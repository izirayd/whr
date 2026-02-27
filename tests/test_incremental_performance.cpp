#include "test_utils.hpp"

#include <whr/engine.hpp>
#include <whr/match.hpp>

#include <chrono>
#include <cstddef>
#include <cstdint>
#include <iomanip>
#include <iostream>
#include <vector>

namespace {

struct WindowTiming final {
  std::size_t from = 0;
  std::size_t to = 0;
  double total_ms = 0.0;
  double per_match_ms = 0.0;
};

[[nodiscard]] whr::Match make_deterministic_duel_match(
    std::size_t match_number,
    std::size_t players_count) {
  const std::uint64_t x = static_cast<std::uint64_t>(match_number);
  std::size_t a = static_cast<std::size_t>((x * 7ull + 3ull) % players_count);
  std::size_t b = static_cast<std::size_t>((x * 13ull + 5ull) % players_count);
  if (a == b) b = (b + 1) % players_count;

  whr::Match m;
  m.time = static_cast<whr::TimePoint>(match_number);
  m.sides = {
      whr::Side{{static_cast<whr::PlayerId>(a + 1)}},
      whr::Side{{static_cast<whr::PlayerId>(b + 1)}},
  };
  m.winner_side_index = static_cast<std::size_t>((x * 17ull + 11ull) % 2ull);
  return m;
}

} // namespace

TEST(Performance, DISABLED_IncrementalWindowTimings) {
  // Stress profile close to admin resimulation defaults.
  constexpr std::size_t kPlayers = 10;
  constexpr std::size_t kWindowSize = 10;
  constexpr std::size_t kMaxCheckpoint = 25000;

  std::vector<std::size_t> checkpoints;
  for (std::size_t cp = 1000; cp <= kMaxCheckpoint; cp += 1000) checkpoints.push_back(cp);

  whr::WhrConfig cfg;
  cfg.w2_elo = 70.0;
  cfg.prior_games = 3.0;
  whr::WhrEngine eng(cfg);

  std::vector<WindowTiming> timings;
  timings.reserve(checkpoints.size());

  std::size_t next_checkpoint_idx = 0;
  bool window_active = false;
  std::chrono::steady_clock::time_point window_start{};

  const std::size_t total_target_matches = kMaxCheckpoint + kWindowSize;
  for (std::size_t total_matches = 0; total_matches < total_target_matches;) {
    if (!window_active && next_checkpoint_idx < checkpoints.size() &&
        total_matches == checkpoints[next_checkpoint_idx]) {
      window_active = true;
      window_start = std::chrono::steady_clock::now();
    }

    const std::size_t match_number = total_matches + 1;
    const whr::Match m = make_deterministic_duel_match(match_number, kPlayers);
    const whr::MatchId mid = eng.add_match(m);
    eng.incremental_update_for_match(mid);
    ++total_matches;

    if (window_active &&
        total_matches == checkpoints[next_checkpoint_idx] + kWindowSize) {
      const auto stop = std::chrono::steady_clock::now();
      const std::chrono::duration<double, std::milli> elapsed = stop - window_start;

      WindowTiming wt;
      wt.from = checkpoints[next_checkpoint_idx];
      wt.to = checkpoints[next_checkpoint_idx] + kWindowSize;
      wt.total_ms = elapsed.count();
      wt.per_match_ms = wt.total_ms / static_cast<double>(kWindowSize);
      timings.push_back(wt);

      window_active = false;
      ++next_checkpoint_idx;
      if (next_checkpoint_idx >= checkpoints.size()) break;
    }
  }

  ASSERT_EQ(timings.size(), checkpoints.size());
  for (const WindowTiming& t : timings) {
    EXPECT_TRUE(whr::test::is_finite(t.total_ms));
    EXPECT_TRUE(whr::test::is_finite(t.per_match_ms));
    EXPECT_GE(t.total_ms, 0.0);
    EXPECT_GE(t.per_match_ms, 0.0);
  }

  std::cout << "\n[Performance] Incremental WHR windows (" << kPlayers
            << " players, duel, depth=" << cfg.incremental_smoothing_depth
            << ", passes=" << cfg.incremental_smoothing_passes
            << ", uncertainty_interval=" << cfg.incremental_uncertainty_update_interval
            << ")\n";
  std::cout << std::left << std::setw(14) << "Window"
            << std::right << std::setw(16) << "Total ms"
            << std::right << std::setw(20) << "Avg ms/match"
            << "\n";
  for (const WindowTiming& t : timings) {
    const std::string label = std::to_string(t.from) + " -> " + std::to_string(t.to);
    std::cout << std::left << std::setw(14) << label
              << std::right << std::setw(16) << std::fixed << std::setprecision(3) << t.total_ms
              << std::right << std::setw(20) << std::fixed << std::setprecision(4) << t.per_match_ms
              << "\n";
  }
}
