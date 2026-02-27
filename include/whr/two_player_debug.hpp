#pragma once

#include "engine.hpp"

#include <cstddef>
#include <stdexcept>
#include <utility>
#include <vector>

namespace whr::debug {

class TwoPlayerRatingSandbox final {
public:
  struct Snapshot final {
    std::size_t step = 0;
    TimePoint time = 0;
    PlayerId winner = 0;
    Elo player_a_elo = 0.0;
    Elo player_b_elo = 0.0;
    double p_player_a_wins = 0.5;
  };

  explicit TwoPlayerRatingSandbox(PlayerId player_a, PlayerId player_b, WhrConfig cfg = {})
      : player_a_(player_a), player_b_(player_b), engine_(std::move(cfg)) {
    if (player_a_ == player_b_) {
      throw std::invalid_argument("player_a and player_b must be different");
    }
  }

  [[nodiscard]] PlayerId player_a() const noexcept { return player_a_; }
  [[nodiscard]] PlayerId player_b() const noexcept { return player_b_; }

  [[nodiscard]] Snapshot initial_snapshot(TimePoint time = 0) const {
    return make_snapshot_(/*step=*/0, time, /*winner=*/0);
  }

  [[nodiscard]] Snapshot play_match(TimePoint time, PlayerId winner) {
    validate_winner_(winner);

    Match match;
    match.time = time;
    match.sides = {Side{{player_a_}}, Side{{player_b_}}};
    match.winner_side_index = (winner == player_a_) ? 0u : 1u;
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
  void validate_winner_(PlayerId winner) const {
    if (winner != player_a_ && winner != player_b_) {
      throw std::invalid_argument("winner must be player_a or player_b");
    }
  }

  [[nodiscard]] Snapshot make_snapshot_(std::size_t step, TimePoint time, PlayerId winner) const {
    Snapshot out;
    out.step = step;
    out.time = time;
    out.winner = winner;
    out.player_a_elo = engine_.rating_elo(player_a_, time);
    out.player_b_elo = engine_.rating_elo(player_b_, time);
    out.p_player_a_wins = engine_.predict_win_probability({player_a_}, {player_b_}, time);
    return out;
  }

  PlayerId player_a_;
  PlayerId player_b_;
  WhrEngine engine_;
  std::size_t step_counter_ = 0;
};

} // namespace whr::debug

