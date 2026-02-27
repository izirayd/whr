#include "test_utils.hpp"

#include <whr/match.hpp>
#include <whr/newton_player_update.hpp>
#include <whr/player_history.hpp>

#include <vector>

namespace {

[[nodiscard]] whr::Match make_1v1(whr::TimePoint t, whr::PlayerId a, whr::PlayerId b, std::size_t winner) {
  whr::Match m;
  m.time = t;
  m.sides = {whr::Side{{a}}, whr::Side{{b}}};
  m.winner_side_index = winner;
  return m;
}

[[nodiscard]] whr::Match make_ffa3(whr::TimePoint t, whr::PlayerId a, whr::PlayerId b, whr::PlayerId c, std::size_t winner) {
  whr::Match m;
  m.time = t;
  m.sides = {whr::Side{{a}}, whr::Side{{b}}, whr::Side{{c}}};
  m.winner_side_index = winner;
  return m;
}

} // namespace

TEST(LikelihoodTerms, OneMatchWinnerHasPositiveGradient) {
  std::vector<whr::Match> matches;
  matches.push_back(make_1v1(/*t=*/0, /*a=*/1, /*b=*/2, /*winner=*/0));

  whr::PlayerHistory hist;
  hist.player = 1;
  hist.ensure_time(0, 0.0);
  hist.r[0] = 0.0;
  hist.add_participation(0, whr::Participation{0, 0});

  auto get_match = [&](whr::MatchId id) -> const whr::Match& { return matches.at(static_cast<std::size_t>(id)); };
  auto rating_at_exact = [&](whr::PlayerId /*pid*/, whr::TimePoint /*t*/) -> whr::NaturalRating {
    return 0.0; // all players fixed at 0 => pk=0.5
  };

  const auto terms = whr::detail::compute_likelihood_terms(hist, /*prior_games=*/0.0, get_match, rating_at_exact);
  ASSERT_EQ(terms.grad.size(), 1u);
  ASSERT_EQ(terms.hess_diag.size(), 1u);

  whr::test::expect_near_rel_abs(terms.grad[0], 0.5);
  whr::test::expect_near_rel_abs(terms.hess_diag[0], -0.25);
}

TEST(LikelihoodTerms, OneMatchLoserHasNegativeGradient) {
  std::vector<whr::Match> matches;
  matches.push_back(make_1v1(/*t=*/0, /*a=*/1, /*b=*/2, /*winner=*/1));

  whr::PlayerHistory hist;
  hist.player = 1;
  hist.ensure_time(0, 0.0);
  hist.r[0] = 0.0;
  hist.add_participation(0, whr::Participation{0, 0});

  auto get_match = [&](whr::MatchId id) -> const whr::Match& { return matches.at(static_cast<std::size_t>(id)); };
  auto rating_at_exact = [&](whr::PlayerId /*pid*/, whr::TimePoint /*t*/) -> whr::NaturalRating { return 0.0; };

  const auto terms = whr::detail::compute_likelihood_terms(hist, /*prior_games=*/0.0, get_match, rating_at_exact);
  whr::test::expect_near_rel_abs(terms.grad[0], -0.5);
  whr::test::expect_near_rel_abs(terms.hess_diag[0], -0.25);
}

TEST(LikelihoodTerms, PriorGamesAffectOnlyFirstTimepoint) {
  std::vector<whr::Match> matches;
  matches.push_back(make_1v1(/*t=*/0, /*a=*/1, /*b=*/2, /*winner=*/0));

  whr::PlayerHistory hist;
  hist.player = 1;
  hist.ensure_time(0, 0.0);
  hist.r[0] = 0.0; // sigmoid(0)=0.5 => prior grad adds 0, hess adds -0.5*prior_games
  hist.add_participation(0, whr::Participation{0, 0});

  auto get_match = [&](whr::MatchId id) -> const whr::Match& { return matches.at(static_cast<std::size_t>(id)); };
  auto rating_at_exact = [&](whr::PlayerId /*pid*/, whr::TimePoint /*t*/) -> whr::NaturalRating { return 0.0; };

  const auto terms = whr::detail::compute_likelihood_terms(hist, /*prior_games=*/2.0, get_match, rating_at_exact);
  whr::test::expect_near_rel_abs(terms.grad[0], 0.5);
  // base -0.25 + (-0.5*2.0) = -1.25
  whr::test::expect_near_rel_abs(terms.hess_diag[0], -1.25);
}

TEST(LikelihoodTerms, MultiwayWinnerUsesSoftmax) {
  std::vector<whr::Match> matches;
  matches.push_back(make_ffa3(/*t=*/0, /*a=*/1, /*b=*/2, /*c=*/3, /*winner=*/0));

  whr::PlayerHistory hist;
  hist.player = 1;
  hist.ensure_time(0, 0.0);
  hist.r[0] = 0.0;
  hist.add_participation(0, whr::Participation{0, 0});

  auto get_match = [&](whr::MatchId id) -> const whr::Match& { return matches.at(static_cast<std::size_t>(id)); };
  auto rating_at_exact = [&](whr::PlayerId /*pid*/, whr::TimePoint /*t*/) -> whr::NaturalRating {
    return 0.0; // all strengths equal => pk=1/3
  };

  const auto terms = whr::detail::compute_likelihood_terms(hist, /*prior_games=*/0.0, get_match, rating_at_exact);
  whr::test::expect_near_rel_abs(terms.grad[0], 2.0 / 3.0, 1e-15, 1e-15);
  whr::test::expect_near_rel_abs(terms.hess_diag[0], -2.0 / 9.0, 1e-15, 1e-15);
}

