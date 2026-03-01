#pragma once

#include "config.hpp"
#include "interpolation.hpp"
#include "match.hpp"
#include "math.hpp"
#include "newton_player_update.hpp"
#include "player_history.hpp"
#include "strength_model.hpp"
#include "tridiagonal.hpp"
#include "types.hpp"

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

namespace whr {

class WhrEngine final : public IRatingProvider {
public:
  explicit WhrEngine(WhrConfig cfg = {}) : cfg_(std::move(cfg)) {}

  [[nodiscard]] const WhrConfig& config() const noexcept { return cfg_; }

  // Adds a match and updates internal player histories/indexes.
  // Returns the assigned MatchId.
  MatchId add_match(Match m) {
    std::string err;
    if (!m.validate(&err)) throw std::invalid_argument(err);

    const MatchId id = static_cast<MatchId>(matches_.size());
    matches_.push_back(std::move(m));
    const Match& stored = matches_.back();

    // Internal natural ratings are modeled around 0.0 (average strength).
    // default_rating_elo is applied as an output offset in rating_elo().
    const NaturalRating default_r = 0.0;
    const double default_sigma_r = whr::elo_to_r(cfg_.default_sigma_elo);
    const double default_sigma2_r = default_sigma_r * default_sigma_r;

    for (std::size_t si = 0; si < stored.sides.size(); ++si) {
      for (PlayerId p : stored.sides[si].players) {
        PlayerHistory& h = get_or_create_player_(p);
        const std::size_t ti = h.ensure_time(stored.time, default_r);
        if (h.sigma2.size() == h.times.size()) h.sigma2[ti] = default_sigma2_r;
        if (h.cov_sub.size() == h.times.size()) h.cov_sub[ti] = 0.0;
        h.add_participation(ti, Participation{id, si});
      }
    }
    return id;
  }

  [[nodiscard]] const Match& match(MatchId id) const {
    if (static_cast<std::size_t>(id) >= matches_.size()) throw std::out_of_range("match id");
    return matches_[static_cast<std::size_t>(id)];
  }

  // Global optimization: iterate players and do Newton updates until convergence.
  void optimize_all(std::size_t iterations = 0, double epsilon = -1.0) {
    if (iterations == 0) iterations = cfg_.default_optimize_iterations;
    if (epsilon < 0.0) epsilon = cfg_.default_convergence_epsilon;

    for (std::size_t it = 0; it < iterations; ++it) {
      double max_delta = 0.0;
      for (PlayerId p : player_ids_) {
        max_delta = (std::max)(max_delta, newton_update_player_(p));
      }
      if (max_delta < epsilon) break;
    }

    // Uncertainty at MAP.
    recompute_uncertainty_all_();
    incremental_matches_since_uncertainty_ = 0;
  }

  // Windowed optimization for low-latency streaming:
  // 1) only players that appeared in the last `recent_match_window` matches;
  // 2) for each player, only the last `player_history_window` timeline nodes are optimized.
  void optimize_windowed(
      std::size_t recent_match_window,
      std::size_t player_history_window,
      std::size_t iterations = 0,
      double epsilon = -1.0,
      bool refresh_uncertainty = false) {
    if (matches_.empty() || recent_match_window == 0 || player_history_window == 0) {
      return;
    }

    if (iterations == 0) iterations = cfg_.default_optimize_iterations;
    if (epsilon < 0.0) epsilon = cfg_.default_convergence_epsilon;

    const std::size_t recent_from =
        (recent_match_window >= matches_.size()) ? 0u : matches_.size() - recent_match_window;

    std::vector<PlayerId> active_players;
    for (std::size_t i = recent_from; i < matches_.size(); ++i) {
      const Match& m = matches_[i];
      for (const Side& s : m.sides) {
        for (PlayerId p : s.players) {
          active_players.push_back(p);
        }
      }
    }

    if (active_players.empty()) return;

    std::sort(active_players.begin(), active_players.end());
    active_players.erase(std::unique(active_players.begin(), active_players.end()), active_players.end());

    const std::size_t history_window = (player_history_window == 0) ? 1 : player_history_window;
    for (std::size_t it = 0; it < iterations; ++it) {
      double max_delta = 0.0;
      for (PlayerId p : active_players) {
        auto itp = players_.find(p);
        if (itp == players_.end()) continue;

        PlayerHistory& hist = itp->second;
        const std::size_t n = hist.size();
        if (n == 0) continue;

        const std::size_t begin = (n > history_window) ? (n - history_window) : 0u;
        const std::size_t end = n - 1;
        max_delta = (std::max)(max_delta, newton_update_player_window_(hist, begin, end));
      }
      if (max_delta < epsilon) break;
    }

    if (!refresh_uncertainty) {
      return;
    }

    for (PlayerId p : active_players) {
      recompute_uncertainty_for_player_(p);
    }
    incremental_matches_since_uncertainty_ = 0;
  }

  // Fast incremental update after adding a new match:
  // applies local Newton steps over a small recent window for each participant.
  void incremental_update_for_match(MatchId match_id) {
    const Match& m = match(match_id);
    std::vector<PlayerId> participants;
    participants.reserve(128);
    for (const Side& s : m.sides) {
      for (PlayerId p : s.players) participants.push_back(p);
    }
    std::sort(participants.begin(), participants.end());
    participants.erase(std::unique(participants.begin(), participants.end()), participants.end());

    const std::size_t depth =
        (std::max)(cfg_.incremental_smoothing_depth, static_cast<std::size_t>(1));
    const std::size_t passes =
        (std::max)(cfg_.incremental_smoothing_passes, static_cast<std::size_t>(1));

    for (PlayerId p : participants) {
      auto it = players_.find(p);
      if (it == players_.end()) continue;

      PlayerHistory& hist = it->second;
      const std::size_t latest_idx = hist.find_time_index(m.time);
      if (latest_idx == PlayerHistory::npos()) continue;

      const std::size_t begin_idx = (latest_idx + 1 > depth) ? (latest_idx + 1 - depth) : 0;
      for (std::size_t pass = 0; pass < passes; ++pass) {
        for (std::size_t ti = latest_idx + 1; ti-- > begin_idx;) {
          (void)local_newton_update_player_at_index_(hist, ti);
        }
      }
    }

    const std::size_t uncertainty_interval = cfg_.incremental_uncertainty_update_interval;
    if (uncertainty_interval == 0) return;

    ++incremental_matches_since_uncertainty_;
    if (incremental_matches_since_uncertainty_ < uncertainty_interval) return;

    incremental_matches_since_uncertainty_ = 0;
    for (PlayerId p : participants) recompute_uncertainty_for_player_(p);
  }

  // IRatingProvider
  [[nodiscard]] NaturalRating rating_r(PlayerId player, TimePoint time) const override {
    return rating_estimate_r_(player, time).r;
  }

  [[nodiscard]] Elo rating_elo(PlayerId player, TimePoint time) const {
    return cfg_.default_rating_elo + whr::r_to_elo(rating_r(player, time));
  }

  [[nodiscard]] double sigma2_r(PlayerId player, TimePoint time) const {
    return rating_estimate_r_(player, time).sigma2;
  }

  [[nodiscard]] double sigma_elo(PlayerId player, TimePoint time) const {
    const double s2 = sigma2_r(player, time);
    return (s2 > 0.0) ? (std::sqrt(s2) / whr::elo_to_r_factor()) : 0.0;
  }

  // Prediction helpers (using current ratings at `time`).
  [[nodiscard]] double predict_win_probability(
      const std::vector<PlayerId>& sideA_players,
      const std::vector<PlayerId>& sideB_players,
      TimePoint time) const {
    double sA = 0.0;
    double sB = 0.0;
    for (PlayerId p : sideA_players) sA += rating_r(p, time);
    for (PlayerId p : sideB_players) sB += rating_r(p, time);
    return whr::sigmoid(sA - sB);
  }

  [[nodiscard]] std::vector<double> predict_winner_probabilities(
      const std::vector<Side>& sides,
      TimePoint time) const {
    std::vector<double> strengths;
    strengths.reserve(sides.size());
    for (const Side& s : sides) {
      double ss = 0.0;
      for (PlayerId p : s.players) ss += rating_r(p, time);
      strengths.push_back(ss);
    }
    const double logZ = whr::log_sum_exp(strengths.begin(), strengths.end());
    std::vector<double> out;
    out.reserve(strengths.size());
    for (double s : strengths) out.push_back(std::exp(s - logZ));
    return out;
  }

  [[nodiscard]] std::size_t players_count() const noexcept { return players_.size(); }
  [[nodiscard]] std::size_t matches_count() const noexcept { return matches_.size(); }

private:
  // Internal rating at exact timepoint (must exist for players who participated).
  [[nodiscard]] NaturalRating rating_r_exact_(PlayerId player, TimePoint time) const {
    const auto it = players_.find(player);
    if (it == players_.end()) return 0.0;
    const PlayerHistory& h = it->second;
    const std::size_t idx = h.find_time_index(time);
    if (idx == PlayerHistory::npos()) return 0.0;
    return h.r[idx];
  }

  [[nodiscard]] RatingEstimate rating_estimate_r_(PlayerId player, TimePoint time) const {
    const auto it = players_.find(player);
    if (it == players_.end() || it->second.times.empty()) {
      RatingEstimate out;
      out.r = 0.0;
      const double s = whr::elo_to_r(cfg_.default_sigma_elo);
      out.sigma2 = s * s;
      return out;
    }
    const PlayerHistory& h = it->second;

    RatingEstimate out = whr::interpolate_rating(time, h.times, h.r, h.sigma2, h.cov_sub, cfg_.w2_r());

    // If uncertainty hasn't been computed yet (all zeros), keep a conservative default.
    if (out.sigma2 <= 0.0) {
      const double s = whr::elo_to_r(cfg_.default_sigma_elo);
      out.sigma2 = s * s;
    }
    return out;
  }

  PlayerHistory& get_or_create_player_(PlayerId p) {
    auto it = players_.find(p);
    if (it != players_.end()) return it->second;

    PlayerHistory h;
    h.player = p;
    players_.emplace(p, std::move(h));
    player_ids_.push_back(p);
    return players_.find(p)->second;
  }

  // Computes one local Newton update for one player at one history index.
  double local_newton_update_player_at_index_(PlayerHistory& hist, std::size_t idx) {
    const std::size_t n = hist.size();
    if (n == 0 || idx >= n) return 0.0;

    const whr::detail::LikelihoodTermAtTime term =
        whr::detail::compute_likelihood_term_at_time_index(
        hist,
        idx,
        cfg_.prior_games,
        [&](MatchId id) -> const Match& { return match(id); },
        [&](PlayerId pid, TimePoint t) -> NaturalRating { return rating_r_exact_(pid, t); });

    double diag = term.hess_diag - cfg_.hessian_diag_stability;
    double grad = term.grad;

    const double w2 = cfg_.w2_r();
    constexpr double kMinSigma2 = 1e-12;

    if (idx > 0) {
      const double dt = static_cast<double>(hist.times[idx] - hist.times[idx - 1]);
      double sigma2 = dt * w2;
      if (sigma2 < kMinSigma2) sigma2 = kMinSigma2;
      const double inv = 1.0 / sigma2;
      diag -= inv;
      grad += -(hist.r[idx] - hist.r[idx - 1]) * inv;
    }
    if (idx + 1 < n) {
      const double dt = static_cast<double>(hist.times[idx + 1] - hist.times[idx]);
      double sigma2 = dt * w2;
      if (sigma2 < kMinSigma2) sigma2 = kMinSigma2;
      const double inv = 1.0 / sigma2;
      diag -= inv;
      grad += -(hist.r[idx] - hist.r[idx + 1]) * inv;
    }

    if (!whr::is_finite(diag) || !whr::is_finite(grad) || std::abs(diag) < 1e-15) return 0.0;

    double d = grad / diag;
    const double max_step = incremental_effective_max_step_r_(hist, idx, term);
    if (d > max_step) d = max_step;
    if (d < -max_step) d = -max_step;
    hist.r[idx] -= d;
    return std::abs(d);
  }

  // Computes one local Newton update for player p at specific timepoint.
  // This keeps incremental updates causal for match-by-match history rendering.
  double local_newton_update_player_at_time_(PlayerId p, TimePoint time) {
    auto it = players_.find(p);
    if (it == players_.end()) return 0.0;
    PlayerHistory& hist = it->second;
    const std::size_t idx = hist.find_time_index(time);
    if (idx == PlayerHistory::npos()) return 0.0;
    return local_newton_update_player_at_index_(hist, idx);
  }

  double newton_update_player_window_(
      PlayerHistory& hist,
      std::size_t begin_idx,
      std::size_t end_idx) {
    const std::size_t n = hist.size();
    if (n == 0 || begin_idx > end_idx || end_idx >= n) return 0.0;

    const std::size_t local_n = end_idx - begin_idx + 1u;
    std::vector<double> diag(local_n);
    std::vector<double> grad(local_n);
    std::vector<double> off;
    if (local_n > 1) off.assign(local_n - 1, 0.0);

    const double w2 = cfg_.w2_r();
    constexpr double kMinSigma2 = 1e-12;

    for (std::size_t gi = begin_idx; gi <= end_idx; ++gi) {
      const std::size_t li = gi - begin_idx;

      const whr::detail::LikelihoodTermAtTime term =
          whr::detail::compute_likelihood_term_at_time_index(
              hist,
              gi,
              cfg_.prior_games,
              [&](MatchId id) -> const Match& { return match(id); },
              [&](PlayerId pid, TimePoint t) -> NaturalRating { return rating_r_exact_(pid, t); });

      double local_diag = term.hess_diag - cfg_.hessian_diag_stability;
      double local_grad = term.grad;

      if (gi > 0) {
        const double dt = static_cast<double>(hist.times[gi] - hist.times[gi - 1]);
        double sigma2 = dt * w2;
        if (sigma2 < kMinSigma2) sigma2 = kMinSigma2;
        const double inv = 1.0 / sigma2;
        local_diag -= inv;
        local_grad += -(hist.r[gi] - hist.r[gi - 1]) * inv;
        if (gi > begin_idx) {
          off[li - 1] = inv;
        }
      }

      if (gi + 1 < n) {
        const double dt = static_cast<double>(hist.times[gi + 1] - hist.times[gi]);
        double sigma2 = dt * w2;
        if (sigma2 < kMinSigma2) sigma2 = kMinSigma2;
        const double inv = 1.0 / sigma2;
        local_diag -= inv;
        local_grad += -(hist.r[gi] - hist.r[gi + 1]) * inv;
        if (gi < end_idx) {
          off[li] = inv;
        }
      }

      diag[li] = local_diag;
      grad[li] = local_grad;
    }

    const std::vector<double> delta = whr::detail::solve_tridiagonal_symmetric(diag, off, grad);

    const double max_step = cfg_.max_newton_step_r;
    double max_abs = 0.0;
    for (std::size_t li = 0; li < local_n; ++li) {
      double d = delta[li];
      if (d > max_step) d = max_step;
      if (d < -max_step) d = -max_step;
      hist.r[begin_idx + li] -= d;
      max_abs = (std::max)(max_abs, std::abs(d));
    }
    return max_abs;
  }

  // Computes one Newton update for player p, returns max |Δ| applied (natural units).
  double newton_update_player_(PlayerId p) {
    auto it = players_.find(p);
    if (it == players_.end()) return 0.0;
    PlayerHistory& hist = it->second;
    const std::size_t n = hist.size();
    if (n == 0) return 0.0;

    const auto terms = whr::detail::compute_likelihood_terms(
        hist,
        cfg_.prior_games,
        [&](MatchId id) -> const Match& { return match(id); },
        [&](PlayerId pid, TimePoint t) -> NaturalRating { return rating_r_exact_(pid, t); });

    // Build tridiagonal Hessian and full gradient by adding Wiener prior terms.
    std::vector<double> diag = terms.hess_diag;
    std::vector<double> grad = terms.grad;
    std::vector<double> off;
    if (n > 1) off.assign(n - 1, 0.0);

    const double w2 = cfg_.w2_r();
    constexpr double kMinSigma2 = 1e-12;

    // Prior couplings between adjacent timepoints
    for (std::size_t i = 0; i + 1 < n; ++i) {
      const double dt = static_cast<double>(hist.times[i + 1] - hist.times[i]);
      double sigma2 = dt * w2;
      if (sigma2 < kMinSigma2) sigma2 = kMinSigma2;
      off[i] = 1.0 / sigma2;
    }
    for (std::size_t i = 0; i < n; ++i) {
      // Stability
      diag[i] -= cfg_.hessian_diag_stability;

      if (i > 0) {
        diag[i] -= off[i - 1];
        grad[i] += -(hist.r[i] - hist.r[i - 1]) * off[i - 1];
      }
      if (i + 1 < n) {
        diag[i] -= off[i];
        grad[i] += -(hist.r[i] - hist.r[i + 1]) * off[i];
      }
    }

    std::vector<double> delta = whr::detail::solve_tridiagonal_symmetric(diag, off, grad);

    const double max_step = cfg_.max_newton_step_r;
    double max_abs = 0.0;
    for (std::size_t i = 0; i < n; ++i) {
      double d = delta[i];
      if (d > max_step) d = max_step;
      if (d < -max_step) d = -max_step;
      hist.r[i] -= d;
      max_abs = (std::max)(max_abs, std::abs(d));
    }
    return max_abs;
  }

  void recompute_uncertainty_for_player_(PlayerId p) {
    auto it = players_.find(p);
    if (it == players_.end()) return;
    PlayerHistory& hist = it->second;
    const std::size_t n = hist.size();
    if (n == 0) return;

    const auto terms = whr::detail::compute_likelihood_terms(
        hist,
        cfg_.prior_games,
        [&](MatchId id) -> const Match& { return match(id); },
        [&](PlayerId pid, TimePoint t) -> NaturalRating { return rating_r_exact_(pid, t); });

    std::vector<double> diag = terms.hess_diag;
    std::vector<double> off;
    if (n > 1) off.assign(n - 1, 0.0);

    const double w2 = cfg_.w2_r();
    constexpr double kMinSigma2 = 1e-12;

    for (std::size_t i = 0; i + 1 < n; ++i) {
      const double dt = static_cast<double>(hist.times[i + 1] - hist.times[i]);
      double sigma2 = dt * w2;
      if (sigma2 < kMinSigma2) sigma2 = kMinSigma2;
      off[i] = 1.0 / sigma2;
    }
    for (std::size_t i = 0; i < n; ++i) {
      diag[i] -= cfg_.hessian_diag_stability;
      if (i > 0) diag[i] -= off[i - 1];
      if (i + 1 < n) diag[i] -= off[i];
    }

    const auto cov = whr::detail::covariance_diag_subdiag_from_hessian(diag, off);
    hist.sigma2 = cov.diag;
    hist.cov_sub = cov.sub;
  }

  void recompute_uncertainty_all_() {
    for (PlayerId p : player_ids_) recompute_uncertainty_for_player_(p);
  }

  [[nodiscard]] double incremental_effective_max_step_r_(
      const PlayerHistory& hist,
      std::size_t idx,
      const whr::detail::LikelihoodTermAtTime& term) const {
    const double hard_cap_r = cfg_.max_newton_step_r;
    if (!whr::is_finite(hard_cap_r) || hard_cap_r <= 0.0) return 0.0;

    double sigma2 = 0.0;
    if (idx < hist.sigma2.size()) sigma2 = hist.sigma2[idx];
    if (!(sigma2 > 0.0)) {
      const double s = whr::elo_to_r(cfg_.default_sigma_elo);
      sigma2 = s * s;
    }
    const double sigma_elo =
        (sigma2 > 0.0) ? (std::sqrt(sigma2) / whr::elo_to_r_factor()) : cfg_.default_sigma_elo;

    const double base_elo = (std::max)(0.0, cfg_.incremental_base_step_elo);
    const double sigma_scale = (std::max)(0.0, cfg_.incremental_sigma_step_scale);
    const double min_elo = (std::max)(0.0, cfg_.incremental_min_step_elo);

    const double clamped_surprise = (std::min)(1.0, (std::max)(0.0, std::abs(term.grad)));
    const double surprise_step_elo = (std::max)(0.0, cfg_.incremental_surprise_step_elo);

    double adaptive_cap_elo = base_elo + sigma_scale * sigma_elo + surprise_step_elo * clamped_surprise;
    if (adaptive_cap_elo < min_elo) adaptive_cap_elo = min_elo;

    const double adaptive_cap_r = whr::elo_to_r(adaptive_cap_elo);
    return (std::min)(hard_cap_r, adaptive_cap_r);
  }

  WhrConfig cfg_;
  std::vector<Match> matches_;
  std::unordered_map<PlayerId, PlayerHistory> players_;
  std::vector<PlayerId> player_ids_;
  std::size_t incremental_matches_since_uncertainty_ = 0;
};

} // namespace whr

