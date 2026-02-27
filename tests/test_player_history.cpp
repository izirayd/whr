#include "test_utils.hpp"

#include <whr/player_history.hpp>

#include <limits>

TEST(PlayerHistory, EnsureTimeOnEmptyUsesDefaultRating) {
  whr::PlayerHistory h;
  h.player = 42;

  const double default_r = 1.25;
  const std::size_t idx = h.ensure_time(10, default_r);
  EXPECT_EQ(idx, 0u);
  ASSERT_EQ(h.times.size(), 1u);
  EXPECT_EQ(h.times[0], 10);
  ASSERT_EQ(h.r.size(), 1u);
  whr::test::expect_near_rel_abs(h.r[0], default_r);

  EXPECT_EQ(h.sigma2.size(), h.times.size());
  EXPECT_EQ(h.cov_sub.size(), h.times.size());
  EXPECT_EQ(h.participations.size(), h.times.size());
}

TEST(PlayerHistory, EnsureTimeInsertsAtBeginningWithFrontRating) {
  whr::PlayerHistory h;
  h.ensure_time(10, 0.0);
  h.r[0] = 3.0;

  const std::size_t idx = h.ensure_time(5, 123.0);
  EXPECT_EQ(idx, 0u);
  ASSERT_EQ(h.times.size(), 2u);
  EXPECT_EQ(h.times[0], 5);
  EXPECT_EQ(h.times[1], 10);
  ASSERT_EQ(h.r.size(), 2u);
  whr::test::expect_near_rel_abs(h.r[0], 3.0);
}

TEST(PlayerHistory, EnsureTimeInsertsAtEndWithBackRating) {
  whr::PlayerHistory h;
  h.ensure_time(10, 0.0);
  h.r[0] = -2.0;

  const std::size_t idx = h.ensure_time(20, 123.0);
  EXPECT_EQ(idx, 1u);
  ASSERT_EQ(h.times.size(), 2u);
  EXPECT_EQ(h.times[0], 10);
  EXPECT_EQ(h.times[1], 20);
  ASSERT_EQ(h.r.size(), 2u);
  whr::test::expect_near_rel_abs(h.r[1], -2.0);
}

TEST(PlayerHistory, EnsureTimeInsertsInMiddleInterpolatesLinearly) {
  whr::PlayerHistory h;
  h.ensure_time(0, 0.0);
  h.ensure_time(10, 0.0);
  h.r[0] = 0.0;
  h.r[1] = 10.0;

  const std::size_t idx = h.ensure_time(5, 999.0);
  EXPECT_EQ(idx, 1u);
  ASSERT_EQ(h.times.size(), 3u);
  EXPECT_EQ(h.times[0], 0);
  EXPECT_EQ(h.times[1], 5);
  EXPECT_EQ(h.times[2], 10);
  ASSERT_EQ(h.r.size(), 3u);
  whr::test::expect_near_rel_abs(h.r[1], 5.0);
}

TEST(PlayerHistory, FindTimeIndexReturnsNposIfMissing) {
  whr::PlayerHistory h;
  h.ensure_time(0, 0.0);
  h.ensure_time(10, 0.0);

  EXPECT_EQ(h.find_time_index(0), 0u);
  EXPECT_EQ(h.find_time_index(10), 1u);
  EXPECT_EQ(h.find_time_index(5), whr::PlayerHistory::npos());
}

