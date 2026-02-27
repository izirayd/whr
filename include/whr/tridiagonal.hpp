#pragma once

#include <algorithm>
#include <cstddef>
#include <stdexcept>
#include <utility>
#include <vector>

namespace whr::detail {

// Solves symmetric tridiagonal system:
//   diag[i] * x[i] + off[i-1] * x[i-1] + off[i] * x[i+1] = rhs[i]
// where off has size n-1 and represents both sub/super diagonal.
//
// Returns x.
[[nodiscard]] inline std::vector<double> solve_tridiagonal_symmetric(
    const std::vector<double>& diag,
    const std::vector<double>& off,
    const std::vector<double>& rhs) {
  const std::size_t n = diag.size();
  if (rhs.size() != n) throw std::invalid_argument("rhs size mismatch");
  if (n == 0) return {};
  if (n == 1) {
    if (diag[0] == 0.0) throw std::runtime_error("singular tridiagonal system");
    return {rhs[0] / diag[0]};
  }
  if (off.size() != n - 1) throw std::invalid_argument("off size mismatch");

  // LU decomposition (Appendix B): store a (sub factors) and d (U diagonal).
  std::vector<double> a(n, 0.0);
  std::vector<double> d(n, 0.0);
  d[0] = diag[0];
  for (std::size_t i = 1; i < n; ++i) {
    if (d[i - 1] == 0.0) throw std::runtime_error("singular tridiagonal system");
    a[i] = off[i - 1] / d[i - 1];
    d[i] = diag[i] - a[i] * off[i - 1];
  }

  // Forward solve L y = rhs
  std::vector<double> y(n, 0.0);
  y[0] = rhs[0];
  for (std::size_t i = 1; i < n; ++i) y[i] = rhs[i] - a[i] * y[i - 1];

  // Backward solve U x = y
  std::vector<double> x(n, 0.0);
  if (d[n - 1] == 0.0) throw std::runtime_error("singular tridiagonal system");
  x[n - 1] = y[n - 1] / d[n - 1];
  for (std::size_t i = n - 1; i-- > 0;) {
    if (d[i] == 0.0) throw std::runtime_error("singular tridiagonal system");
    x[i] = (y[i] - off[i] * x[i + 1]) / d[i];
  }
  return x;
}

struct CovarianceDiagSubdiag final {
  // Σ = -H^{-1} approximation for one player's time-slices.
  // diag[i] = Σ_{i,i}  (variance)
  // sub[i]  = Σ_{i,i-1} for i>=1, sub[0]=0.
  std::vector<double> diag;
  std::vector<double> sub;
};

// Computes diagonal and sub-diagonal of Σ = -H^{-1} in O(n),
// using the dual LU/UL decomposition trick from Appendix B.2.
//
// Inputs are Hessian entries H (tridiagonal), with:
// - h_diag size n
// - h_off size n-1, h_off[i] = H_{i,i+1} = H_{i+1,i}
//
// Assumes H is (numerically) negative definite.
[[nodiscard]] inline CovarianceDiagSubdiag covariance_diag_subdiag_from_hessian(
    const std::vector<double>& h_diag,
    const std::vector<double>& h_off) {
  const std::size_t n = h_diag.size();
  if (n == 0) return {};
  if (n == 1) {
    if (h_diag[0] == 0.0) throw std::runtime_error("singular Hessian");
    CovarianceDiagSubdiag out;
    out.diag = {-1.0 / h_diag[0]};
    out.sub = {0.0};
    return out;
  }
  if (h_off.size() != n - 1) throw std::invalid_argument("h_off size mismatch");

  // LU (forward) to get d and a (Appendix B)
  std::vector<double> a(n, 0.0);
  std::vector<double> d(n, 0.0);
  d[0] = h_diag[0];
  for (std::size_t i = 1; i < n; ++i) {
    if (d[i - 1] == 0.0) throw std::runtime_error("singular Hessian");
    a[i] = h_off[i - 1] / d[i - 1];
    d[i] = h_diag[i] - a[i] * h_off[i - 1];
  }

  // UL (backward) to get d' (Appendix B.2). We do not need a' explicitly.
  std::vector<double> dprime(n, 0.0);
  dprime[n - 1] = h_diag[n - 1];
  for (std::size_t ii = n - 1; ii-- > 0;) {
    const std::size_t i = ii;
    if (dprime[i + 1] == 0.0) throw std::runtime_error("singular Hessian");
    const double off = h_off[i]; // H_{i,i+1}
    dprime[i] = h_diag[i] - (off * off) / dprime[i + 1];
  }

  CovarianceDiagSubdiag out;
  out.diag.assign(n, 0.0);
  out.sub.assign(n, 0.0);

  // Diagonal terms for i < n
  for (std::size_t i = 0; i + 1 < n; ++i) {
    const double b_i = h_off[i];        // super
    const double bprime_ip1 = h_off[i]; // sub for row i+1
    const double denom = (d[i] * dprime[i + 1]) - (b_i * bprime_ip1);
    if (denom == 0.0) throw std::runtime_error("singular Hessian");
    out.diag[i] = -dprime[i + 1] / denom;
  }
  if (d[n - 1] == 0.0) throw std::runtime_error("singular Hessian");
  out.diag[n - 1] = -1.0 / d[n - 1];

  // Sub-diagonal terms: Σ_{i,i-1} = -a_i * Σ_{i,i}
  for (std::size_t i = 1; i < n; ++i) out.sub[i] = -a[i] * out.diag[i];

  return out;
}

} // namespace whr::detail

