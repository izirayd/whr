#pragma once

#include "engine.hpp"

#include <cstddef>
#include <stdexcept>
#include <utility>
#include <vector>

namespace whr::debug {

class ThreePlayerRatingSandbox final {
public:
  struct Snapshot final {
    std::size_t step = 0;
    TimePoint time = 0;
    PlayerId winner = 0;
    Elo player_a_elo = 0.0;
    Elo player_b_elo = 0.0;
    Elo player_c_elo = 0.0;
    double p_player_a_wins = 1.0 / 3.0;
    double p_player_b_wins = 1.0 / 3.0;
    double p_player_c_wins = 1.0 / 3.0;
  };

  explicit ThreePlayerRatingSandbox(
      PlayerId player_a,
      PlayerId player_b,
      PlayerId player_c,
      WhrConfig cfg = {})
      : player_a_(player_a), player_b_(player_b), player_c_(player_c), engine_(std::move(cfg)) {
    if (player_a_ == player_b_ || player_a_ == player_c_ || player_b_ == player_c_) {
      throw std::invalid_argument("player ids must be pairwise different");
    }
  }

  [[nodiscard]] PlayerId player_a() const noexcept { return player_a_; }
  [[nodiscard]] PlayerId player_b() const noexcept { return player_b_; }
  [[nodiscard]] PlayerId player_c() const noexcept { return player_c_; }

  [[nodiscard]] Snapshot initial_snapshot(TimePoint time = 0) const {
    return make_snapshot_(/*step=*/0, time, /*winner=*/0);
  }

  [[nodiscard]] Snapshot play_match(TimePoint time, PlayerId winner) {
    validate_winner_(winner);

    Match match;
    match.time = time;
    match.sides = {Side{{player_a_}}, Side{{player_b_}}, Side{{player_c_}}};
    match.winner_side_index = winner_side_index_(winner);
    const MatchId id = engine_.add_match(std::move(match));
    engine_.incremental_update_for_match(id);

    ++step_counter_;
    return make_snapshot_(step_counter_, time, winner);
  }

  [[nodiscard]] std::vector<Snapshot> play_series(
      const std::vector<PlayerId>& winners,
      TimePoint first_match_time = 1) {
    std::vector<Snapshot> out;
    out.reserve(winners.size() + 1);
    out.push_back(initial_snapshot(first_match_time - 1));

    TimePoint current_time = first_match_time;
    for (PlayerId winner : winners) {
      out.push_back(play_match(current_time, winner));
      ++current_time;
    }
    return out;
  }

private:
  [[nodiscard]] std::size_t winner_side_index_(PlayerId winner) const noexcept {
    if (winner == player_a_) return 0u;
    if (winner == player_b_) return 1u;
    return 2u;
  }

  void validate_winner_(PlayerId winner) const {
    if (winner != player_a_ && winner != player_b_ && winner != player_c_) {
      throw std::invalid_argument("winner must be player_a, player_b, or player_c");
    }
  }

  [[nodiscard]] Snapshot make_snapshot_(std::size_t step, TimePoint time, PlayerId winner) const {
    Snapshot out;
    out.step = step;
    out.time = time;
    out.winner = winner;
    out.player_a_elo = engine_.rating_elo(player_a_, time);
    out.player_b_elo = engine_.rating_elo(player_b_, time);
    out.player_c_elo = engine_.rating_elo(player_c_, time);

    const std::vector<Side> sides = {Side{{player_a_}}, Side{{player_b_}}, Side{{player_c_}}};
    const std::vector<double> probs = engine_.predict_winner_probabilities(sides, time);
    if (probs.size() == 3u) {
      out.p_player_a_wins = probs[0];
      out.p_player_b_wins = probs[1];
      out.p_player_c_wins = probs[2];
    }
    return out;
  }

  PlayerId player_a_;
  PlayerId player_b_;
  PlayerId player_c_;
  WhrEngine engine_;
  std::size_t step_counter_ = 0;
};

} // namespace whr::debug

