# WHR Integration Guide for MMORPG (LLM)

## Goal

Integrate WHR rating into an MMORPG without blocking the main game loop.

## Critical Constraint

There is only one game logic thread (`GameThread`).

- Do not run heavy rating operations on `GameThread`.
- `optimize_all(...)` must never run in match hot path.
- `GameThread` should only publish match results and continue.

## Recommended Architecture

`GameThread -> MatchResultQueue -> RatingWorker -> DB + Cache`

- **GameThread**
  - validates and finalizes match result;
  - pushes `MatchResultEvent` to queue;
  - returns immediately (no blocking WHR computation).
- **RatingWorker** (separate thread or process)
  - owns `WhrEngine`;
  - runs `add_match(...)` + `incremental_update_for_match(...)`;
  - updates in-memory rating snapshot cache;
  - writes rating history/snapshots to DB in batches.
- **Read path**
  - matchmaking/UI reads from snapshot/cache;
  - does not wait for full-history optimization.

## How to Use `optimize_all(...)` Safely

Use only in background jobs:

- `optimizeInterval = 0` for online/live path.
- periodic optimize only for offline maintenance windows.
- `finalOptimizeIterations` for batch recalculation jobs.

Do not run full optimize after each match on production traffic.

## Timepoint Rule

Use monotonic timepoints (`played_at`).

- Avoid many matches sharing the same timepoint.
- Prefer increasing logical tick or high-resolution timestamp mapping.

## Suggested Defaults (Duel Mode)

- `duelW2Elo = 70`
- `duelPriorGames = 3`
- `duelMaxStepElo = 500`
- `optimizeInterval = 0`
- `finalOptimizeIterations = 8` (batch only)

## Operational Rules

- One owner of `WhrEngine` instance (RatingWorker) per scope.
- Batch DB writes for throughput.
- Keep durable event log for replay/recovery.
- Add metrics:
  - queue depth and queue lag;
  - rating worker matches/sec;
  - p95/p99 rating update latency;
  - optimize duration and frequency.

## Integration Checklist for LLM

1. Add `MatchResultEvent` queue (MPSC or equivalent).
2. Implement `RatingWorker` class (single owner of `WhrEngine`).
3. Move WHR updates out of `GameThread`.
4. Implement batched persistence for history/snapshots.
5. Add background scheduler for optimize jobs.
6. Add graceful shutdown + replay from durable log.
7. Add load tests with `100k+` matches.

## Frontend/Admin Notes

For simulation jobs, expose and forward:

- `optimizeInterval`
- `finalOptimizeIterations`

Keep these parameters optional, with safe defaults.
