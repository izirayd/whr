#include "test_utils.hpp"

#include <whr/math.hpp>

#include <algorithm>
#include <cmath>
#include <limits>
#include <vector>

TEST(Math, EloToRAndBackIsIdentity) {
  const double k = whr::elo_to_r_factor();
  EXPECT_GT(k, 0.0);

  const std::vector<double> elos = {0.0, 1.0, -1.0, 400.0, -400.0, 1234.5, -999.25};
  for (double elo : elos) {
    const double r = whr::elo_to_r(elo);
    whr::test::expect_near_rel_abs(r, elo * k);
    whr::test::expect_near_rel_abs(whr::r_to_elo(r), elo, 1e-12, 1e-12);
  }
}

TEST(Math, SigmoidSymmetryAndMonotone) {
  whr::test::expect_near_rel_abs(whr::sigmoid(0.0), 0.5);
  for (double x : {0.1, 1.0, 2.5, 10.0}) {
    const double sx = whr::sigmoid(x);
    const double snx = whr::sigmoid(-x);
    EXPECT_GT(sx, 0.5);
    EXPECT_LT(snx, 0.5);
    whr::test::expect_near_rel_abs(sx, 1.0 - snx, 1e-15, 1e-15);
  }

  // Monotonicity on a small grid
  double prev = whr::sigmoid(-10.0);
  for (int i = -9; i <= 10; ++i) {
    const double cur = whr::sigmoid(static_cast<double>(i));
    EXPECT_GE(cur, prev);
    prev = cur;
  }
}

TEST(Math, SigmoidSaturates) {
  const double s_pos = whr::sigmoid(1000.0);
  const double s_neg = whr::sigmoid(-1000.0);
  EXPECT_GT(s_pos, 1.0 - 1e-12);
  EXPECT_LT(s_neg, 1e-12);
}

TEST(Math, Log1pExpIsStableForLargeMagnitudes) {
  // Moderate values should match the naive formula.
  for (double x : {-10.0, -2.0, -0.5, 0.0, 0.5, 2.0, 10.0}) {
    const double naive = std::log1p(std::exp(x));
    const double stable = whr::log1p_exp(x);
    whr::test::expect_near_rel_abs(stable, naive, 1e-15, 1e-15);
  }

  // Very large magnitude values should not overflow/underflow in stable version.
  whr::test::expect_near_rel_abs(whr::log1p_exp(1000.0), 1000.0, 1e-12, 0.0);
  whr::test::expect_near_rel_abs(whr::log1p_exp(-1000.0), 0.0, 1e-15, 0.0);
}

TEST(Math, LogSumExpMatchesNaiveForSmallNumbers) {
  std::vector<double> v = {-1.0, 0.0, 1.0, 2.0};
  const double naive = std::log(std::exp(v[0]) + std::exp(v[1]) + std::exp(v[2]) + std::exp(v[3]));
  const double stable = whr::log_sum_exp(v.begin(), v.end());
  whr::test::expect_near_rel_abs(stable, naive, 1e-15, 1e-15);
}

TEST(Math, LogSumExpEmptyIsMinusInfinity) {
  std::vector<double> v;
  const double s = whr::log_sum_exp(v.begin(), v.end());
  EXPECT_TRUE(std::isinf(s));
  EXPECT_LT(s, 0.0);
}

