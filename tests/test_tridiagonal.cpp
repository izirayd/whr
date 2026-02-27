#include "test_utils.hpp"

#include <whr/tridiagonal.hpp>

#include <stdexcept>
#include <vector>

namespace {

[[nodiscard]] std::vector<std::vector<double>> invert_dense(std::vector<std::vector<double>> a) {
  const std::size_t n = a.size();
  std::vector<std::vector<double>> inv(n, std::vector<double>(n, 0.0));
  for (std::size_t i = 0; i < n; ++i) inv[i][i] = 1.0;

  for (std::size_t col = 0; col < n; ++col) {
    // Pivot
    std::size_t piv = col;
    double best = std::abs(a[col][col]);
    for (std::size_t r = col + 1; r < n; ++r) {
      const double v = std::abs(a[r][col]);
      if (v > best) {
        best = v;
        piv = r;
      }
    }
    if (best == 0.0) throw std::runtime_error("singular");
    if (piv != col) {
      std::swap(a[piv], a[col]);
      std::swap(inv[piv], inv[col]);
    }

    const double diag = a[col][col];
    for (std::size_t c = 0; c < n; ++c) {
      a[col][c] /= diag;
      inv[col][c] /= diag;
    }

    for (std::size_t r = 0; r < n; ++r) {
      if (r == col) continue;
      const double f = a[r][col];
      if (f == 0.0) continue;
      for (std::size_t c = 0; c < n; ++c) {
        a[r][c] -= f * a[col][c];
        inv[r][c] -= f * inv[col][c];
      }
    }
  }

  return inv;
}

} // namespace

TEST(Tridiagonal, SolveN1) {
  const std::vector<double> diag = {2.0};
  const std::vector<double> off;
  const std::vector<double> rhs = {4.0};
  const auto x = whr::detail::solve_tridiagonal_symmetric(diag, off, rhs);
  ASSERT_EQ(x.size(), 1u);
  whr::test::expect_near_rel_abs(x[0], 2.0);
}

TEST(Tridiagonal, SolveN1SingularThrows) {
  const std::vector<double> diag = {0.0};
  const std::vector<double> off;
  const std::vector<double> rhs = {1.0};
  EXPECT_THROW((void)whr::detail::solve_tridiagonal_symmetric(diag, off, rhs), std::runtime_error);
}

TEST(Tridiagonal, SolveSizeMismatchThrows) {
  const std::vector<double> diag = {1.0, 1.0};
  const std::vector<double> rhs = {1.0};
  EXPECT_THROW((void)whr::detail::solve_tridiagonal_symmetric(diag, {}, rhs), std::invalid_argument);

  const std::vector<double> rhs2 = {1.0, 1.0};
  EXPECT_THROW((void)whr::detail::solve_tridiagonal_symmetric(diag, {}, rhs2), std::invalid_argument);
}

TEST(Tridiagonal, SolveN2MatchesDenseSolution) {
  const std::vector<double> diag = {4.0, 5.0};
  const std::vector<double> off = {1.0};
  const std::vector<double> rhs = {6.0, 7.0};

  const auto x = whr::detail::solve_tridiagonal_symmetric(diag, off, rhs);
  ASSERT_EQ(x.size(), 2u);

  // Dense solve for reference:
  // [4 1][x0] = [6]
  // [1 5][x1]   [7]
  // x1=22/19, x0=23/19
  whr::test::expect_near_rel_abs(x[1], 22.0 / 19.0);
  whr::test::expect_near_rel_abs(x[0], 23.0 / 19.0);
}

TEST(Tridiagonal, CovarianceDiagSubdiagMatchesMinusInverseN2) {
  // Negative definite Hessian.
  const std::vector<double> h_diag = {-2.0, -1.0};
  const std::vector<double> h_off = {0.5};

  const auto cov = whr::detail::covariance_diag_subdiag_from_hessian(h_diag, h_off);
  ASSERT_EQ(cov.diag.size(), 2u);
  ASSERT_EQ(cov.sub.size(), 2u);
  whr::test::expect_near_rel_abs(cov.sub[0], 0.0);

  // Σ = -H^{-1}
  // det = 1.75, Σ = (1/det) * [[1,0.5],[0.5,2]]
  const double det = 1.75;
  whr::test::expect_near_rel_abs(cov.diag[0], 1.0 / det);
  whr::test::expect_near_rel_abs(cov.diag[1], 2.0 / det);
  whr::test::expect_near_rel_abs(cov.sub[1], 0.5 / det);
}

TEST(Tridiagonal, CovarianceDiagSubdiagMatchesMinusInverseN3) {
  const std::vector<double> h_diag = {-2.0, -2.0, -2.0};
  const std::vector<double> h_off = {0.5, 0.25};

  const auto cov = whr::detail::covariance_diag_subdiag_from_hessian(h_diag, h_off);
  ASSERT_EQ(cov.diag.size(), 3u);
  ASSERT_EQ(cov.sub.size(), 3u);
  whr::test::expect_near_rel_abs(cov.sub[0], 0.0);

  // Dense reference Σ = -H^{-1}.
  std::vector<std::vector<double>> H = {
      {h_diag[0], h_off[0], 0.0},
      {h_off[0], h_diag[1], h_off[1]},
      {0.0, h_off[1], h_diag[2]},
  };
  const auto Hinv = invert_dense(H);
  const auto sigma = [&Hinv](std::size_t i, std::size_t j) -> double { return -Hinv[i][j]; };

  whr::test::expect_near_rel_abs(cov.diag[0], sigma(0, 0), 1e-12, 1e-12);
  whr::test::expect_near_rel_abs(cov.diag[1], sigma(1, 1), 1e-12, 1e-12);
  whr::test::expect_near_rel_abs(cov.diag[2], sigma(2, 2), 1e-12, 1e-12);

  whr::test::expect_near_rel_abs(cov.sub[1], sigma(1, 0), 1e-12, 1e-12);
  whr::test::expect_near_rel_abs(cov.sub[2], sigma(2, 1), 1e-12, 1e-12);
}

