#pragma once

#include "math.hpp"
#include "match.hpp"
#include "player_history.hpp"

#include <cmath>
#include <cstddef>
#include <utility>
#include <vector>

namespace whr::detail {

struct LikelihoodTerms final {
  std::vector<double> grad;      // ∂ log P / ∂ r(t_i)
  std::vector<double> hess_diag; // ∂² log P / ∂ r(t_i)²
};

struct LikelihoodTermAtTime final {
  double grad = 0.0;      // ∂ log P / ∂ r(t_i)
  double hess_diag = 0.0; // ∂² log P / ∂ r(t_i)²
};

template <class GetMatchFn, class RatingAtExactFn>
[[nodiscard]] inline LikelihoodTermAtTime compute_likelihood_term_at_time_index(
    const PlayerHistory& hist,
    std::size_t time_index,
    double prior_games,
    GetMatchFn&& get_match,
    RatingAtExactFn&& rating_at_exact) {
  LikelihoodTermAtTime out;
  const std::size_t n = hist.size();
  if (time_index >= n) return out;

  // Symmetric virtual prior at first timepoint: N wins + N losses vs rating 0.
  if (time_index == 0 && prior_games > 0.0) {
    const double p = whr::sigmoid(hist.r[0]); // P(win vs r=0)
    out.grad += prior_games * (1.0 - 2.0 * p);
    out.hess_diag += -2.0 * prior_games * p * (1.0 - p);
  }

  std::vector<double> strengths;
  strengths.reserve(8);

  for (const Participation& part : hist.participations[time_index]) {
    const Match& m = get_match(part.match_id);

    strengths.clear();
    strengths.resize(m.sides.size(), 0.0);

    for (std::size_t si = 0; si < m.sides.size(); ++si) {
      double s = 0.0;
      for (PlayerId p : m.sides[si].players) {
        s += rating_at_exact(p, m.time);
      }
      strengths[si] = s;
    }

    const double logZ = whr::log_sum_exp(strengths.begin(), strengths.end());
    const double pk = std::exp(strengths[part.side_index] - logZ);

    if (part.side_index == m.winner_side_index) {
      out.grad += 1.0 - pk;
    } else {
      out.grad += -pk;
    }
    out.hess_diag += -pk * (1.0 - pk);
  }

  return out;
}

// Builds the likelihood-only gradient/Hessian-diagonal terms for one player history.
// Opponents are assumed fixed at their current (MAP) ratings.
//
// Supports 1v1, teams, and multiway FFA (winner-only) via:
//   P(win = k) = exp(s_k) / Σ_m exp(s_m)
// where s_k is side strength in natural units.
//
// prior_games implements "N virtual wins and N virtual losses vs rating 0"
// at the first timepoint of the player (paper's symmetric prior scheme).
template <class GetMatchFn, class RatingAtExactFn>
[[nodiscard]] inline LikelihoodTerms compute_likelihood_terms(
    const PlayerHistory& hist,
    double prior_games,
    GetMatchFn&& get_match,
    RatingAtExactFn&& rating_at_exact) {
  LikelihoodTerms out;
  const std::size_t n = hist.size();
  out.grad.assign(n, 0.0);
  out.hess_diag.assign(n, 0.0);
  if (n == 0) return out;

  for (std::size_t ti = 0; ti < n; ++ti) {
    const LikelihoodTermAtTime term = compute_likelihood_term_at_time_index(
        hist,
        ti,
        prior_games,
        get_match,
        rating_at_exact);
    out.grad[ti] = term.grad;
    out.hess_diag[ti] = term.hess_diag;
  }

  return out;
}

} // namespace whr::detail

