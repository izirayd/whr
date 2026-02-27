#pragma once

#include "types.hpp"

#include <string>
#include <unordered_set>
#include <utility>
#include <vector>

namespace whr {

struct Side final {
  std::vector<PlayerId> players;
};

struct Match final {
  TimePoint time = 0;
  std::vector<Side> sides;
  std::size_t winner_side_index = 0;

  [[nodiscard]] bool validate(std::string* error = nullptr) const {
    if (sides.size() < 2) {
      if (error) *error = "Match must have at least 2 sides.";
      return false;
    }
    if (winner_side_index >= sides.size()) {
      if (error) *error = "winner_side_index is out of range.";
      return false;
    }

    std::unordered_set<PlayerId> seen;
    for (std::size_t si = 0; si < sides.size(); ++si) {
      const auto& side = sides[si];
      if (side.players.empty()) {
        if (error) *error = "Side has no players.";
        return false;
      }
      for (PlayerId p : side.players) {
        if (!seen.insert(p).second) {
          if (error) *error = "Player appears multiple times in match sides.";
          return false;
        }
      }
    }
    return true;
  }
};

} // namespace whr

