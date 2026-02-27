#pragma once

#include "match.hpp"
#include "types.hpp"

namespace whr {

class IRatingProvider {
public:
  virtual ~IRatingProvider() = default;

  [[nodiscard]] virtual NaturalRating rating_r(PlayerId player, TimePoint time) const = 0;
};

class IStrengthModel {
public:
  virtual ~IStrengthModel() = default;

  [[nodiscard]] virtual double side_strength_r(
      const IRatingProvider& ratings,
      const Side& side,
      TimePoint time) const = 0;
};

class SumStrengthModel final : public IStrengthModel {
public:
  [[nodiscard]] double side_strength_r(
      const IRatingProvider& ratings,
      const Side& side,
      TimePoint time) const override {
    double s = 0.0;
    for (PlayerId p : side.players) s += ratings.rating_r(p, time);
    return s;
  }
};

} // namespace whr

