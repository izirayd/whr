#include "test_utils.hpp"

#include <whr/matchmaking.hpp>

#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace {

class FakeRatingProvider final : public whr::IRatingProvider {
public:
  explicit FakeRatingProvider(std::unordered_map<whr::PlayerId, double> r) : r_(std::move(r)) {}

  [[nodiscard]] whr::NaturalRating rating_r(whr::PlayerId player, whr::TimePoint time) const override {
    (void)time;
    const auto it = r_.find(player);
    return (it == r_.end()) ? 0.0 : it->second;
  }

private:
  std::unordered_map<whr::PlayerId, double> r_;
};

[[nodiscard]] std::unordered_set<whr::PlayerId> to_set(const std::vector<whr::PlayerId>& v) {
  return std::unordered_set<whr::PlayerId>(v.begin(), v.end());
}

} // namespace

TEST(Matchmaking, Balance2TeamsFormsFullTeamsAndNoDuplicates) {
  FakeRatingProvider ratings({
      {1, 3.0},
      {2, 2.0},
      {3, -2.0},
      {4, -3.0},
  });

  const whr::matchmaking::TeamBalancer bal(ratings);
  const auto m = bal.balance_2_teams({1, 2, 3, 4}, /*team_size=*/2, /*time=*/0);

  EXPECT_EQ(m.teamA.size(), 2u);
  EXPECT_EQ(m.teamB.size(), 2u);

  const auto A = to_set(m.teamA);
  const auto B = to_set(m.teamB);
  EXPECT_EQ(A.size(), 2u);
  EXPECT_EQ(B.size(), 2u);

  // Disjointness + union matches input (since all unique).
  for (auto pid : A) EXPECT_EQ(B.count(pid), 0u);
  auto U = A;
  U.insert(B.begin(), B.end());
  EXPECT_EQ(U.size(), 4u);
  EXPECT_EQ(U.count(1), 1u);
  EXPECT_EQ(U.count(2), 1u);
  EXPECT_EQ(U.count(3), 1u);
  EXPECT_EQ(U.count(4), 1u);

  // Probability is sigmoid(diff).
  whr::test::expect_near_rel_abs(m.p_teamA_wins, whr::sigmoid(m.strength_diff_r), 1e-15, 1e-15);

  // With symmetric ratings, perfect balance should be achievable.
  whr::test::expect_near_rel_abs(m.strength_diff_r, 0.0, 1e-12, 0.0);
}

TEST(Matchmaking, Balance2TeamsValidatesInputs) {
  FakeRatingProvider ratings({});
  const whr::matchmaking::TeamBalancer bal(ratings);

  EXPECT_THROW((void)bal.balance_2_teams({1, 2}, 0, 0), std::invalid_argument);
  EXPECT_THROW((void)bal.balance_2_teams({1, 2, 3}, 2, 0), std::invalid_argument);
}

TEST(Matchmaking, MakeMatchFromQueueRemovesPlayersFromFront) {
  FakeRatingProvider ratings({
      {1, 1.0},
      {2, 0.5},
      {3, -0.5},
      {4, -1.0},
  });
  const whr::matchmaking::TeamBalancer bal(ratings);

  std::vector<whr::PlayerId> q = {1, 2, 3, 4};
  const auto opt = bal.make_match_from_queue(q, /*team_size=*/2, /*time=*/0);
  ASSERT_TRUE(opt.has_value());
  EXPECT_TRUE(q.empty());
  EXPECT_EQ(opt->teamA.size(), 2u);
  EXPECT_EQ(opt->teamB.size(), 2u);
}

TEST(Matchmaking, MakeMatchFromQueueReturnsNulloptIfNotEnoughPlayers) {
  FakeRatingProvider ratings({});
  const whr::matchmaking::TeamBalancer bal(ratings);

  std::vector<whr::PlayerId> q = {1, 2, 3};
  const auto opt = bal.make_match_from_queue(q, /*team_size=*/2, /*time=*/0);
  EXPECT_FALSE(opt.has_value());
  EXPECT_EQ(q.size(), 3u);
}

