#include <whr/engine.hpp>
#include <whr/math.hpp>

#include <iomanip>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

struct DuelMatch final {
  whr::TimePoint time = 0;
  whr::PlayerId left = 0;
  whr::PlayerId right = 0;
  whr::PlayerId winner = 0;
};

struct Snapshot final {
  std::size_t step = 0;
  whr::TimePoint time = 0;
  whr::PlayerId left = 0;
  whr::PlayerId right = 0;
  whr::PlayerId winner = 0;
  whr::Elo player_a_elo = 0.0;
  whr::Elo player_b_elo = 0.0;
  whr::Elo player_c_elo = 0.0;
  double p_left_wins = 0.5;
  double p_right_wins = 0.5;
};

[[nodiscard]] std::string winner_text(
    whr::PlayerId winner,
    whr::PlayerId player_a,
    whr::PlayerId player_b,
    whr::PlayerId player_c) {
  if (winner == 0) return "-";
  if (winner == player_a) return "A";
  if (winner == player_b) return "B";
  if (winner == player_c) return "C";
  return "?";
}

[[nodiscard]] std::string duel_text(
    whr::PlayerId left,
    whr::PlayerId right,
    whr::PlayerId player_a,
    whr::PlayerId player_b,
    whr::PlayerId player_c) {
  if (left == 0 || right == 0) return "-";
  return winner_text(left, player_a, player_b, player_c) + " vs " +
      winner_text(right, player_a, player_b, player_c);
}

void validate_duel(
    const DuelMatch& duel,
    whr::PlayerId player_a,
    whr::PlayerId player_b,
    whr::PlayerId player_c) {
  const auto is_known_player = [&](whr::PlayerId id) {
    return id == player_a || id == player_b || id == player_c;
  };

  if (!is_known_player(duel.left) || !is_known_player(duel.right)) {
    throw std::invalid_argument("duel players must be A, B, or C");
  }
  if (duel.left == duel.right) {
    throw std::invalid_argument("duel players must be different");
  }
  if (duel.winner != duel.left && duel.winner != duel.right) {
    throw std::invalid_argument("duel winner must be one of the duel players");
  }
}

void validate_three_participants_used(
    const std::vector<DuelMatch>& duels,
    whr::PlayerId player_a,
    whr::PlayerId player_b,
    whr::PlayerId player_c) {
  bool saw_a = false;
  bool saw_b = false;
  bool saw_c = false;

  for (const DuelMatch& duel : duels) {
    saw_a = saw_a || duel.left == player_a || duel.right == player_a;
    saw_b = saw_b || duel.left == player_b || duel.right == player_b;
    saw_c = saw_c || duel.left == player_c || duel.right == player_c;
  }

  if (!saw_a || !saw_b || !saw_c) {
    throw std::invalid_argument("duel sequence must include all three participants");
  }
}

[[nodiscard]] std::vector<Snapshot> play_duel_series(
    const std::vector<DuelMatch>& duels,
    whr::PlayerId player_a,
    whr::PlayerId player_b,
    whr::PlayerId player_c,
    const whr::WhrConfig& cfg) {
  validate_three_participants_used(duels, player_a, player_b, player_c);

  whr::WhrEngine engine(cfg);
  std::vector<Snapshot> timeline;
  timeline.reserve(duels.size() + 1);

  const whr::TimePoint initial_time = duels.empty() ? 0 : (duels.front().time - 1);
  Snapshot initial;
  initial.step = 0;
  initial.time = initial_time;
  initial.player_a_elo = engine.rating_elo(player_a, initial_time);
  initial.player_b_elo = engine.rating_elo(player_b, initial_time);
  initial.player_c_elo = engine.rating_elo(player_c, initial_time);
  timeline.push_back(initial);

  for (std::size_t i = 0; i < duels.size(); ++i) {
    const DuelMatch& duel = duels[i];
    validate_duel(duel, player_a, player_b, player_c);

    whr::Match match;
    match.time = duel.time;
    match.sides = {whr::Side{{duel.left}}, whr::Side{{duel.right}}};
    match.winner_side_index = (duel.winner == duel.left) ? 0u : 1u;

    const double p_left_wins = engine.predict_win_probability(
        match.sides[0].players, match.sides[1].players, duel.time);
    const whr::MatchId match_id = engine.add_match(match);
    engine.incremental_update_for_match(match_id);
    // Keep sandbox output intuitive by re-fitting full history after each duel.
    engine.optimize_all(8, 1e-6);

    Snapshot row;
    row.step = i + 1;
    row.time = duel.time;
    row.left = duel.left;
    row.right = duel.right;
    row.winner = duel.winner;
    row.player_a_elo = engine.rating_elo(player_a, duel.time);
    row.player_b_elo = engine.rating_elo(player_b, duel.time);
    row.player_c_elo = engine.rating_elo(player_c, duel.time);
    row.p_left_wins = p_left_wins;
    row.p_right_wins = 1.0 - p_left_wins;
    timeline.push_back(row);
  }

  return timeline;
}

void print_timeline(
    const std::vector<Snapshot>& timeline,
    whr::PlayerId player_a,
    whr::PlayerId player_b,
    whr::PlayerId player_c) {
  std::cout << std::left
            << std::setw(6) << "Step"
            << std::setw(8) << "Time"
            << std::setw(10) << "Duel"
            << std::setw(8) << "Winner"
            << std::setw(14) << "A Elo"
            << std::setw(14) << "B Elo"
            << std::setw(14) << "C Elo"
            << std::setw(12) << "P(Left)"
            << std::setw(12) << "P(Right)"
            << "\n";

  for (const auto& row : timeline) {
    std::cout << std::left
              << std::setw(6) << row.step
              << std::setw(8) << row.time
              << std::setw(10) << duel_text(row.left, row.right, player_a, player_b, player_c)
              << std::setw(8) << winner_text(row.winner, player_a, player_b, player_c)
              << std::setw(14) << std::fixed << std::setprecision(2) << row.player_a_elo
              << std::setw(14) << std::fixed << std::setprecision(2) << row.player_b_elo
              << std::setw(14) << std::fixed << std::setprecision(2) << row.player_c_elo
              << std::setw(12) << std::fixed << std::setprecision(4) << row.p_left_wins
              << std::setw(12) << std::fixed << std::setprecision(4) << row.p_right_wins
              << "\n";
  }
}

} // namespace

int main() {
  const whr::PlayerId player_a = 1001;
  const whr::PlayerId player_b = 1002;
  const whr::PlayerId player_c = 1003;

  whr::WhrConfig cfg;
  cfg.w2_elo = 50.0;
  cfg.prior_games = 3.0;
  cfg.max_newton_step_r = whr::elo_to_r(150.0);

  const std::vector<DuelMatch> duels = {
      {1, player_a, player_b, player_a},
      {2, player_a, player_b, player_a},
      {3, player_a, player_b, player_a},
      {4, player_a, player_b, player_a},
      {5, player_c, player_a, player_c},
      {6, player_c, player_a, player_c},
      {7, player_c, player_a, player_c},
      {8, player_c, player_a, player_c},
      {9, player_c, player_b, player_b},
      {10, player_c, player_b, player_b},
  };

  const auto timeline = play_duel_series(duels, player_a, player_b, player_c, cfg);

  std::cout << "Three-player WHR debug sandbox (1v1 mode)\n";
  std::cout << "Player A id: " << player_a
            << ", Player B id: " << player_b
            << ", Player C id: " << player_c
            << "\n";
  std::cout << "Duel sequence:";
  for (const DuelMatch& duel : duels) {
    std::cout << " [" << duel_text(duel.left, duel.right, player_a, player_b, player_c)
              << " -> " << winner_text(duel.winner, player_a, player_b, player_c) << "]";
  }
  std::cout << "\n\n";

  print_timeline(timeline, player_a, player_b, player_c);
  return 0;
}

