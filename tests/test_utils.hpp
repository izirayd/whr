#pragma once

#include <cmath>
#include <limits>
#include <type_traits>

#include <gtest/gtest.h>

namespace whr::test {

[[nodiscard]] inline bool is_finite(double x) noexcept { return std::isfinite(x) != 0; }

inline void expect_near_rel_abs(
    double actual,
    double expected,
    double abs_tol = 1e-12,
    double rel_tol = 1e-12) {
  if (std::isnan(expected)) {
    EXPECT_TRUE(std::isnan(actual));
    return;
  }
  if (std::isinf(expected)) {
    EXPECT_TRUE(std::isinf(actual));
    if (expected > 0) EXPECT_GT(actual, 0);
    if (expected < 0) EXPECT_LT(actual, 0);
    return;
  }

  const double diff = std::abs(actual - expected);
  const double scale = (std::max)(1.0, std::abs(expected));
  EXPECT_LE(diff, (std::max)(abs_tol, rel_tol * scale));
}

} // namespace whr::test

