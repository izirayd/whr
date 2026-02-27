#pragma once

#include "types.hpp"

#include <algorithm>
#include <cstddef>
#include <limits>
#include <utility>
#include <vector>

namespace whr {

struct Participation final {
  MatchId match_id = 0;
  std::size_t side_index = 0;
};

struct PlayerHistory final {
  PlayerId player = 0;

  // Unique, sorted timepoints when this player played at least one match.
  std::vector<TimePoint> times;

  // MAP estimates at each timepoint (natural units r = ln(gamma)).
  std::vector<NaturalRating> r;

  // Uncertainty estimates at each timepoint (natural units).
  std::vector<double> sigma2; // variance Σ_{i,i}
  std::vector<double> cov_sub; // Σ_{i,i-1}, cov_sub[0]=0

  // Matches this player participated in, bucketed by time index.
  std::vector<std::vector<Participation>> participations;

  [[nodiscard]] bool empty() const noexcept { return times.empty(); }
  [[nodiscard]] std::size_t size() const noexcept { return times.size(); }

  [[nodiscard]] std::size_t find_time_index(TimePoint t) const noexcept {
    auto it = std::lower_bound(times.begin(), times.end(), t);
    if (it == times.end() || *it != t) return npos();
    return static_cast<std::size_t>(it - times.begin());
  }

  [[nodiscard]] static constexpr std::size_t npos() noexcept {
    return (std::numeric_limits<std::size_t>::max)();
  }

  // Ensures this history has a node for time t, returns its index.
  // If inserted, initializes r by extrapolation/interpolation from neighbours.
  std::size_t ensure_time(TimePoint t, NaturalRating default_r) {
    auto it = std::lower_bound(times.begin(), times.end(), t);
    if (it != times.end() && *it == t) {
      return static_cast<std::size_t>(it - times.begin());
    }

    const std::size_t idx = static_cast<std::size_t>(it - times.begin());
    NaturalRating init = default_r;

    if (!times.empty()) {
      if (idx == 0) {
        init = r.front();
      } else if (idx >= times.size()) {
        init = r.back();
      } else {
        const TimePoint t1 = times[idx - 1];
        const TimePoint t2 = times[idx];
        const double denom = static_cast<double>(t2 - t1);
        const double alpha =
            (denom != 0.0) ? (static_cast<double>(t - t1) / denom) : 0.5;
        init = r[idx - 1] + alpha * (r[idx] - r[idx - 1]);
      }
    }

    times.insert(it, t);
    r.insert(r.begin() + static_cast<std::ptrdiff_t>(idx), init);
    sigma2.insert(sigma2.begin() + static_cast<std::ptrdiff_t>(idx), 0.0);
    cov_sub.insert(cov_sub.begin() + static_cast<std::ptrdiff_t>(idx), 0.0);
    participations.emplace(participations.begin() + static_cast<std::ptrdiff_t>(idx));
    return idx;
  }

  void add_participation(std::size_t time_index, Participation p) {
    if (time_index >= participations.size()) return;
    participations[time_index].push_back(std::move(p));
  }
};

} // namespace whr

