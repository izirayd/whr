#include "test_utils.hpp"

#include <whr/engine.hpp>
#include <whr/match.hpp>

#include <stdexcept>

TEST(Match, ValidateRequiresAtLeastTwoSides) {
  whr::Match m;
  m.time = 0;
  m.sides = {whr::Side{{1}}};
  m.winner_side_index = 0;
  EXPECT_FALSE(m.validate());
}

TEST(Match, ValidateWinnerSideIndexInRange) {
  whr::Match m;
  m.time = 0;
  m.sides = {whr::Side{{1}}, whr::Side{{2}}};
  m.winner_side_index = 2;
  EXPECT_FALSE(m.validate());
}

TEST(Match, ValidateNoEmptySides) {
  whr::Match m;
  m.time = 0;
  m.sides = {whr::Side{{1}}, whr::Side{{}}};
  m.winner_side_index = 0;
  EXPECT_FALSE(m.validate());
}

TEST(Match, ValidateNoDuplicatePlayersAcrossSides) {
  whr::Match m;
  m.time = 0;
  m.sides = {whr::Side{{1}}, whr::Side{{1}}};
  m.winner_side_index = 0;
  EXPECT_FALSE(m.validate());
}

TEST(Engine, AddMatchThrowsOnInvalidMatch) {
  whr::WhrEngine eng;
  whr::Match bad;
  bad.time = 0;
  bad.sides = {whr::Side{{1}}}; // invalid: only one side
  bad.winner_side_index = 0;

  EXPECT_THROW((void)eng.add_match(std::move(bad)), std::invalid_argument);
}

