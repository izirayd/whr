#include "test_utils.hpp"

#include <whr/interpolation.hpp>

#include <vector>

TEST(Interpolation, ExactNodeHitReturnsNodeMeanAndVariance) {
  const std::vector<whr::TimePoint> times = {0, 10};
  const std::vector<whr::NaturalRating> r = {1.0, 3.0};
  const std::vector<double> sigma2 = {4.0, 9.0};
  const std::vector<double> cov_sub = {0.0, 0.5};

  const auto est = whr::interpolate_rating(10, times, r, sigma2, cov_sub, /*w2_r=*/2.0);
  whr::test::expect_near_rel_abs(est.r, 3.0);
  whr::test::expect_near_rel_abs(est.sigma2, 9.0);
}

TEST(Interpolation, OutsideRangeKeepsEdgeMeanAndGrowsVarianceLinearly) {
  const std::vector<whr::TimePoint> times = {0, 10};
  const std::vector<whr::NaturalRating> r = {0.0, 10.0};
  const std::vector<double> sigma2 = {1.0, 4.0};
  const std::vector<double> cov_sub = {0.0, 0.5};
  const double w2_r = 2.0;

  {
    const auto est = whr::interpolate_rating(-5, times, r, sigma2, cov_sub, w2_r);
    whr::test::expect_near_rel_abs(est.r, 0.0);
    // dt = 5
    whr::test::expect_near_rel_abs(est.sigma2, 1.0 + 5.0 * w2_r);
  }
  {
    const auto est = whr::interpolate_rating(15, times, r, sigma2, cov_sub, w2_r);
    whr::test::expect_near_rel_abs(est.r, 10.0);
    // dt = 5
    whr::test::expect_near_rel_abs(est.sigma2, 4.0 + 5.0 * w2_r);
  }
}

TEST(Interpolation, BetweenNodesMatchesAppendixCFormula) {
  const std::vector<whr::TimePoint> times = {0, 10};
  const std::vector<whr::NaturalRating> r = {0.0, 10.0};
  const std::vector<double> sigma2 = {1.0, 4.0};
  const std::vector<double> cov_sub = {0.0, 0.5}; // cov(1,0)
  const double w2_r = 2.0;

  const auto est = whr::interpolate_rating(5, times, r, sigma2, cov_sub, w2_r);

  // Mean is linear between nodes.
  whr::test::expect_near_rel_abs(est.r, 5.0);

  // Expected sigma^2:
  // dt_total=10, a=5, b=5
  // brown = (a*b/dt_total)*w2 = 2.5*w2 = 5
  // interp = (a^2*var1 + 2ab*cov12 + b^2*var2)/dt_total^2
  //       = (25*1 + 50*0.5 + 25*4)/100 = (25 + 25 + 100)/100 = 1.5
  // total = 6.5
  whr::test::expect_near_rel_abs(est.sigma2, 6.5, 1e-12, 1e-12);
}

TEST(Interpolation, WorksWithoutSigmaOrCovVectors) {
  const std::vector<whr::TimePoint> times = {0, 10};
  const std::vector<whr::NaturalRating> r = {0.0, 10.0};
  const std::vector<double> empty;
  const double w2_r = 2.0;

  const auto est = whr::interpolate_rating(5, times, r, empty, empty, w2_r);
  whr::test::expect_near_rel_abs(est.r, 5.0);
  // With no sigma/cov at nodes: interp part is 0, only brown contributes.
  // brown = (25/10)*2 = 5
  whr::test::expect_near_rel_abs(est.sigma2, 5.0);
}

