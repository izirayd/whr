#include "test_utils.hpp"

#include <whr/engine.hpp>

#include <algorithm>
#include <cmath>
#include <vector>

namespace {

[[nodiscard]] whr::Match make_match(
    whr::TimePoint t,
    const std::vector<std::vector<whr::PlayerId>>& sides,
    std::size_t winner) {
  whr::Match m;
  m.time = t;
  m.winner_side_index = winner;
  m.sides.reserve(sides.size());
  for (const auto& sp : sides) m.sides.push_back(whr::Side{sp});
  return m;
}

inline void expect_finite_engine_state(const whr::WhrEngine& eng, whr::PlayerId p, whr::TimePoint t) {
  const double r = eng.rating_r(p, t);
  const double s2 = eng.sigma2_r(p, t);
  EXPECT_TRUE(whr::test::is_finite(r));
  EXPECT_TRUE(whr::test::is_finite(s2));
  EXPECT_GE(s2, 0.0);
}

} // namespace

TEST(Engine, OneVsOneWinnerGetsHigherRatingAfterOptimize) {
  whr::WhrEngine eng;
  const whr::PlayerId A = 1;
  const whr::PlayerId B = 2;

  for (int i = 0; i < 30; ++i) {
    eng.add_match(make_match(/*t=*/0, {{A}, {B}}, /*winner=*/0));
  }

  eng.optimize_all(/*iterations=*/60);

  const double rA = eng.rating_r(A, 0);
  const double rB = eng.rating_r(B, 0);
  EXPECT_GT(rA, rB);
  EXPECT_GT(eng.predict_win_probability({A}, {B}, 0), 0.5);

  const double s2A = eng.sigma2_r(A, 0);
  const double s2B = eng.sigma2_r(B, 0);
  EXPECT_TRUE(whr::test::is_finite(s2A));
  EXPECT_TRUE(whr::test::is_finite(s2B));
  EXPECT_GT(s2A, 0.0);
  EXPECT_GT(s2B, 0.0);
}

TEST(Engine, SymmetryWinnerSwapFlipsRatingDifferenceSign) {
  const whr::PlayerId A = 1;
  const whr::PlayerId B = 2;

  whr::WhrEngine engA;
  for (int i = 0; i < 30; ++i) engA.add_match(make_match(0, {{A}, {B}}, 0));
  engA.optimize_all(/*iterations=*/60);
  const double dA = engA.rating_r(A, 0) - engA.rating_r(B, 0);
  EXPECT_GT(dA, 0.0);

  whr::WhrEngine engB;
  for (int i = 0; i < 30; ++i) engB.add_match(make_match(0, {{A}, {B}}, 1));
  engB.optimize_all(/*iterations=*/60);
  const double dB = engB.rating_r(A, 0) - engB.rating_r(B, 0);
  EXPECT_LT(dB, 0.0);
}

TEST(Engine, FFAWinnerHighestAfterOptimize) {
  whr::WhrEngine eng;
  const whr::PlayerId P1 = 1;
  const whr::PlayerId P2 = 2;
  const whr::PlayerId P3 = 3;

  for (int i = 0; i < 40; ++i) {
    eng.add_match(make_match(0, {{P1}, {P2}, {P3}}, /*winner=*/0));
  }

  eng.optimize_all(/*iterations=*/80);

  const double r1 = eng.rating_r(P1, 0);
  const double r2 = eng.rating_r(P2, 0);
  const double r3 = eng.rating_r(P3, 0);

  EXPECT_GT(r1, r2);
  EXPECT_GT(r1, r3);
  whr::test::expect_near_rel_abs(r2, r3, 1e-6, 1e-6);
}

TEST(Engine, IncrementalUpdateKeepsFiniteValues) {
  whr::WhrEngine eng;
  const whr::PlayerId A = 10;
  const whr::PlayerId B = 11;

  const auto mid = eng.add_match(make_match(0, {{A}, {B}}, 0));
  eng.incremental_update_for_match(mid);

  expect_finite_engine_state(eng, A, 0);
  expect_finite_engine_state(eng, B, 0);

  // Full optimize should also keep things sane.
  eng.optimize_all(/*iterations=*/40);
  expect_finite_engine_state(eng, A, 0);
  expect_finite_engine_state(eng, B, 0);
}

TEST(Engine, IncrementalSingleWinRaisesWinnerEloFromDefault) {
  whr::WhrEngine eng;
  const whr::PlayerId A = 21;
  const whr::PlayerId B = 22;
  const double default_elo = eng.config().default_rating_elo;

  const auto mid = eng.add_match(make_match(0, {{A}, {B}}, 0));
  eng.incremental_update_for_match(mid);

  const double a_elo = eng.rating_elo(A, 0);
  const double b_elo = eng.rating_elo(B, 0);

  EXPECT_GT(a_elo, default_elo);
  EXPECT_LT(b_elo, default_elo);
  EXPECT_GT(a_elo, b_elo);
}

TEST(Engine, IncrementalHugeUpsetIsBoundedByConfiguredStepCap) {
  // Regression for extreme upset bursts in incremental mode:
  // if A is a heavy underdog, one upset should still be bounded by configured per-step cap.
  whr::WhrConfig cfg;
  cfg.w2_elo = 70.0;
  cfg.prior_games = 3.0;
  cfg.max_newton_step_r = whr::elo_to_r(300.0);
  cfg.incremental_smoothing_depth = 1;
  cfg.incremental_smoothing_passes = 1;

  whr::WhrEngine eng(cfg);
  const whr::PlayerId underdog = 31;
  const whr::PlayerId favorite = 32;

  // Build a strong confidence gap first: same-time historical dominance by favorite.
  // Then apply one upset in causal incremental mode at a later timestamp.
  constexpr int kBaseMatches = 120;
  for (int i = 0; i < kBaseMatches; ++i) {
    eng.add_match(make_match(/*t=*/0, {{underdog}, {favorite}}, /*winner=*/1));
  }
  eng.optimize_all(/*iterations=*/80);

  const whr::TimePoint t_before = 0;
  const double p_underdog_before = eng.predict_win_probability(
      {underdog},
      {favorite},
      t_before);
  const double underdog_elo_before = eng.rating_elo(underdog, t_before);
  const double favorite_elo_before = eng.rating_elo(favorite, t_before);

  // Ensure this is really an upset setup (underdog is very unlikely to win).
  EXPECT_LT(p_underdog_before, 0.02);
  EXPECT_LT(underdog_elo_before, favorite_elo_before);

  const whr::TimePoint t_upset = 1;
  const whr::MatchId upset_id =
      eng.add_match(make_match(t_upset, {{underdog}, {favorite}}, /*winner=*/0));
  eng.incremental_update_for_match(upset_id);

  const double underdog_elo_after = eng.rating_elo(underdog, t_upset);
  const double favorite_elo_after = eng.rating_elo(favorite, t_upset);
  const double underdog_gain = underdog_elo_after - underdog_elo_before;
  const double favorite_loss = favorite_elo_before - favorite_elo_after;

  EXPECT_GT(underdog_gain, 0.0);
  EXPECT_GT(favorite_loss, 0.0);

  // Allow tiny numerical slack around 300 Elo cap.
  constexpr double kCapElo = 300.0;
  constexpr double kSlackElo = 1e-3;
  EXPECT_LE(underdog_gain, kCapElo + kSlackElo);
  EXPECT_LE(favorite_loss, kCapElo + kSlackElo);
}

TEST(Engine, IncrementalAdaptiveStepCapAllowsLargeButBoundedUpsetWithHighW2) {
  // With aggressive diffusion, surprise should produce a clearly visible shift,
  // but still stay bounded in one incremental step.
  whr::WhrConfig cfg;
  cfg.w2_elo = 600.0;
  cfg.prior_games = 3.0;
  // Keep a wide hard cap to ensure adaptive cap does the actual limiting.
  cfg.max_newton_step_r = whr::elo_to_r(2000.0);

  whr::WhrEngine eng(cfg);
  const whr::PlayerId underdog = 41;
  const whr::PlayerId favorite = 42;

  constexpr int kBaseMatches = 120;
  for (int i = 0; i < kBaseMatches; ++i) {
    eng.add_match(make_match(/*t=*/0, {{underdog}, {favorite}}, /*winner=*/1));
  }
  eng.optimize_all(/*iterations=*/80);

  const double p_underdog_before = eng.predict_win_probability({underdog}, {favorite}, /*time=*/0);
  const double underdog_elo_before = eng.rating_elo(underdog, /*time=*/0);
  const double favorite_elo_before = eng.rating_elo(favorite, /*time=*/0);

  EXPECT_LT(p_underdog_before, 0.02);
  EXPECT_LT(underdog_elo_before, favorite_elo_before);

  const whr::MatchId upset_id =
      eng.add_match(make_match(/*t=*/1, {{underdog}, {favorite}}, /*winner=*/0));
  eng.incremental_update_for_match(upset_id);

  const double underdog_elo_after = eng.rating_elo(underdog, /*time=*/1);
  const double favorite_elo_after = eng.rating_elo(favorite, /*time=*/1);
  const double underdog_gain = underdog_elo_after - underdog_elo_before;
  const double favorite_loss = favorite_elo_before - favorite_elo_after;

  EXPECT_GT(underdog_gain, 0.0);
  EXPECT_GT(favorite_loss, 0.0);

  // Target behavior: bounded movement even under aggressive diffusion.
  EXPECT_LE(underdog_gain, 600.0);
  EXPECT_LE(favorite_loss, 600.0);
}

