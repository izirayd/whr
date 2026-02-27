#pragma once

#include "types.hpp"

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <vector>

namespace whr {

// Appendix C interpolation for Wiener process between two adjacent time nodes.
// Expects:
// - times sorted, unique
// - r size = times size
// - sigma2 size = times size OR empty (then variance falls back to 0 at nodes)
// - cov_sub size = times size OR empty (then cov12 assumed 0)
//
// Returns estimate at query_time (mean=r, variance=sigma2) in natural units.
[[nodiscard]] inline RatingEstimate interpolate_rating(
    TimePoint query_time,
    const std::vector<TimePoint>& times,
    const std::vector<NaturalRating>& r,
    const std::vector<double>& sigma2,
    const std::vector<double>& cov_sub,
    double w2_r) {
  RatingEstimate out{};
  if (times.empty()) return out;

  const std::size_t n = times.size();

  const bool have_sigma = sigma2.size() == n;
  const bool have_cov = cov_sub.size() == n;

  auto node_sigma2 = [&](std::size_t i) -> double { return have_sigma ? sigma2[i] : 0.0; };
  auto node_cov = [&](std::size_t i) -> double { return have_cov ? cov_sub[i] : 0.0; };

  // Exact hit
  {
    auto it = std::lower_bound(times.begin(), times.end(), query_time);
    if (it != times.end() && *it == query_time) {
      const std::size_t idx = static_cast<std::size_t>(it - times.begin());
      out.r = r[idx];
      out.sigma2 = node_sigma2(idx);
      return out;
    }
  }

  // Outside range: mean stays at edge, variance grows linearly with time
  if (query_time <= times.front()) {
    const double dt = static_cast<double>(times.front() - query_time);
    out.r = r.front();
    out.sigma2 = node_sigma2(0) + dt * w2_r;
    return out;
  }
  if (query_time >= times.back()) {
    const double dt = static_cast<double>(query_time - times.back());
    out.r = r.back();
    out.sigma2 = node_sigma2(n - 1) + dt * w2_r;
    return out;
  }

  // Between two nodes
  const auto it2 = std::upper_bound(times.begin(), times.end(), query_time);
  const std::size_t i2 = static_cast<std::size_t>(it2 - times.begin());
  const std::size_t i1 = i2 - 1;

  const TimePoint t1 = times[i1];
  const TimePoint t2 = times[i2];
  const double dt_total = static_cast<double>(t2 - t1);
  const double a = static_cast<double>(t2 - query_time);
  const double b = static_cast<double>(query_time - t1);

  const double mu1 = r[i1];
  const double mu2 = r[i2];
  const double var1 = node_sigma2(i1);
  const double var2 = node_sigma2(i2);
  const double cov12 = node_cov(i2); // cov between i2 and i1 is stored at cov_sub[i2]

  // Mean interpolation
  out.r = (mu1 * a + mu2 * b) / dt_total;

  // Variance interpolation (Appendix C)
  const double brown = (a * b / dt_total) * w2_r;
  const double interp =
      ((a * a) * var1 + 2.0 * a * b * cov12 + (b * b) * var2) / (dt_total * dt_total);
  out.sigma2 = brown + interp;
  return out;
}

} // namespace whr

