#pragma once

#include "types.hpp"

#include <cmath>
#include <cstddef>

namespace whr {

struct WhrConfig final {
  // Model parameters
  // Wiener process variance per TimePoint, in Elo^2 / time_unit.
  // Converted to natural units internally: w2_r = w2_elo * (ln(10)/400)^2.
  double w2_elo = 14.0;

  // Symmetric prior: N virtual wins and N virtual losses
  // against a virtual opponent of rating 0, applied at the first timepoint.
  double prior_games = 1.0;

  // Numerical stability: subtract from Hessian diagonal (paper suggests 0.001).
  double hessian_diag_stability = 1e-3;

  // Clamp per-step Newton delta in natural units (prevents extreme jumps).
  double max_newton_step_r = 10.0;

  // Adaptive incremental trust-region in Elo:
  //   cap_elo = max(min_step_elo,
  //                 base_step_elo +
  //                 sigma_step_scale * sigma_elo +
  //                 surprise_step_elo * surprise)
  // where surprise ~ |y - p| in [0, 1].
  // The final cap is min(cap_elo, r_to_elo(max_newton_step_r)).
  double incremental_min_step_elo = 25.0;
  double incremental_base_step_elo = 20.0;
  double incremental_sigma_step_scale = 0.20;
  double incremental_surprise_step_elo = 400.0;

  // Default optimization parameters
  std::size_t default_optimize_iterations = 50;
  double default_convergence_epsilon = 1e-6;

  // Incremental (online) update controls.
  // Number of latest timepoints updated per participant after each new match.
  // 1 = only current match timepoint (fastest mode).
  std::size_t incremental_smoothing_depth = 1;

  // Number of Gauss-Seidel passes over the incremental smoothing window.
  std::size_t incremental_smoothing_passes = 1;

  // Recompute uncertainty for participants every N incremental matches.
  // 0 disables periodic recompute (uncertainty still recomputed by optimize_all()).
  std::size_t incremental_uncertainty_update_interval = 64;

  // Defaults for players with no history
  double default_rating_elo = 1400.0;
  double default_sigma_elo = 350.0;

  [[nodiscard]] double w2_r() const noexcept {
    static const double k = std::log(10.0) / 400.0;
    return w2_elo * k * k;
  }
};

} // namespace whr

