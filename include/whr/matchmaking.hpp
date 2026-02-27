#pragma once

#include "math.hpp"
#include "strength_model.hpp"
#include "types.hpp"

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <optional>
#include <stdexcept>
#include <utility>
#include <vector>

namespace whr::matchmaking {

struct BalancedMatch final {
  std::vector<PlayerId> teamA;
  std::vector<PlayerId> teamB;

  // Predicted P(teamA wins) using current ratings at the balancing time.
  double p_teamA_wins = 0.5;

  // Natural strength difference: sum(r_A) - sum(r_B).
  double strength_diff_r = 0.0;
};

class TeamBalancer final {
public:
  explicit TeamBalancer(const IRatingProvider& ratings) : ratings_(ratings) {}

  [[nodiscard]] BalancedMatch balance_2_teams(
      const std::vector<PlayerId>& players,
      std::size_t team_size,
      TimePoint time) const {
    if (team_size == 0) throw std::invalid_argument("team_size must be > 0");
    if (players.size() < 2 * team_size) throw std::invalid_argument("not enough players");

    struct PR {
      PlayerId id;
      double r;
    };
    std::vector<PR> cand;
    cand.reserve(2 * team_size);
    for (std::size_t i = 0; i < 2 * team_size; ++i) {
      const PlayerId pid = players[i];
      cand.push_back(PR{pid, ratings_.rating_r(pid, time)});
    }
    std::sort(cand.begin(), cand.end(), [](const PR& a, const PR& b) { return a.r > b.r; });

    BalancedMatch out;
    out.teamA.reserve(team_size);
    out.teamB.reserve(team_size);

    double sumA = 0.0;
    double sumB = 0.0;

    // Greedy assignment to minimize |sumA - sumB|.
    for (const PR& pr : cand) {
      const bool canA = out.teamA.size() < team_size;
      const bool canB = out.teamB.size() < team_size;
      if (!canA && !canB) break;

      if (canA && (!canB || sumA <= sumB)) {
        out.teamA.push_back(pr.id);
        sumA += pr.r;
      } else {
        out.teamB.push_back(pr.id);
        sumB += pr.r;
      }
    }

    if (out.teamA.size() != team_size || out.teamB.size() != team_size) {
      throw std::runtime_error("failed to form two full teams (duplicate players?)");
    }

    // Local improvement: swap one-by-one between teams to further reduce |diff|.
    // Since team_size <= 35 (typical), O(n^2) search is fine.
    auto rating_of = [&](PlayerId pid) -> double { return ratings_.rating_r(pid, time); };

    std::vector<double> rA(team_size, 0.0);
    std::vector<double> rB(team_size, 0.0);
    for (std::size_t i = 0; i < team_size; ++i) rA[i] = rating_of(out.teamA[i]);
    for (std::size_t i = 0; i < team_size; ++i) rB[i] = rating_of(out.teamB[i]);

    double diff = sumA - sumB;
    for (std::size_t iter = 0; iter < 200; ++iter) {
      double best_abs = std::abs(diff);
      std::size_t best_i = team_size;
      std::size_t best_j = team_size;

      for (std::size_t i = 0; i < team_size; ++i) {
        for (std::size_t j = 0; j < team_size; ++j) {
          const double diff_new = diff + 2.0 * (rB[j] - rA[i]);
          const double abs_new = std::abs(diff_new);
          if (abs_new + 1e-12 < best_abs) {
            best_abs = abs_new;
            best_i = i;
            best_j = j;
          }
        }
      }

      if (best_i == team_size) break; // no improving swap

      // Perform swap
      std::swap(out.teamA[best_i], out.teamB[best_j]);
      std::swap(rA[best_i], rB[best_j]);
      // Recompute sums occasionally for numeric sanity (cheap here).
      sumA = 0.0;
      sumB = 0.0;
      for (double x : rA) sumA += x;
      for (double x : rB) sumB += x;
      diff = sumA - sumB;
    }

    out.strength_diff_r = diff;
    out.p_teamA_wins = whr::sigmoid(diff);
    return out;
  }

  // Simple queue matcher: uses first 2*team_size players.
  // Returns nullopt if queue doesn't have enough players.
  [[nodiscard]] std::optional<BalancedMatch> make_match_from_queue(
      std::vector<PlayerId>& queue,
      std::size_t team_size,
      TimePoint time) const {
    if (queue.size() < 2 * team_size) return std::nullopt;

    std::vector<PlayerId> take;
    take.reserve(2 * team_size);
    for (std::size_t i = 0; i < 2 * team_size; ++i) take.push_back(queue[i]);

    // Remove taken players from the front.
    queue.erase(queue.begin(), queue.begin() + static_cast<std::ptrdiff_t>(2 * team_size));

    return balance_2_teams(take, team_size, time);
  }

private:
  const IRatingProvider& ratings_;
};

} // namespace whr::matchmaking

