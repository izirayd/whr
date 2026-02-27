#pragma once

#include <algorithm>
#include <cmath>
#include <iterator>
#include <limits>

namespace whr {

[[nodiscard]] inline double elo_to_r_factor() noexcept {
  static const double k = std::log(10.0) / 400.0;
  return k;
}

[[nodiscard]] inline double elo_to_r(double elo) noexcept { return elo * elo_to_r_factor(); }
[[nodiscard]] inline double r_to_elo(double r) noexcept { return r / elo_to_r_factor(); }

[[nodiscard]] inline bool is_finite(double x) noexcept { return std::isfinite(x) != 0; }

[[nodiscard]] inline double sigmoid(double x) noexcept {
  if (x >= 0.0) {
    const double z = std::exp(-x);
    return 1.0 / (1.0 + z);
  }
  const double z = std::exp(x);
  return z / (1.0 + z);
}

[[nodiscard]] inline double log1p_exp(double x) noexcept {
  // log(1 + exp(x)) stable for large |x|
  if (x > 0.0) return x + std::log1p(std::exp(-x));
  return std::log1p(std::exp(x));
}

template <class It>
[[nodiscard]] inline double log_sum_exp(It begin, It end) {
  if (begin == end) return -std::numeric_limits<double>::infinity();
  double max_v = *begin;
  for (auto it = begin; it != end; ++it) max_v = (std::max)(max_v, *it);
  double sum = 0.0;
  for (auto it = begin; it != end; ++it) sum += std::exp(*it - max_v);
  return max_v + std::log(sum);
}

} // namespace whr

