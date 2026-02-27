#pragma once

#include <cstddef>
#include <cstdint>

namespace whr {

using PlayerId = std::uint64_t;
using MatchId = std::uint64_t;

// Time is an arbitrary monotonic unit chosen by the caller (e.g. days, seconds).
// The WHR parameter w^2 is interpreted as "per one TimePoint unit".
using TimePoint = std::int64_t;

using Elo = double;
using NaturalRating = double; // r = ln(gamma)

struct RatingEstimate final {
  NaturalRating r = 0.0; // mean (MAP) in natural units
  double sigma2 = 0.0;   // variance in natural units
};

} // namespace whr

