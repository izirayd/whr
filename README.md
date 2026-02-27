# WHR System

WHR System is a local rating platform based on Whole-History Rating for multiplayer scenarios.  
The repository combines a C++ WHR core, SQLite data pipeline, and a TypeScript admin panel.

## What is Included

- `include/whr`: header-only WHR core (math, engine, matching helpers).
- `apps/simulate`: synthetic match generation into SQLite.
- `apps/recalc`: full rating recalculation from historical matches.
- `apps/debug_duel`: deterministic 1v1 sandbox for debugging rating behavior.
- `admin/backend`: Express API for reading rankings/matches and launching recalculation jobs.
- `admin/frontend`: React + Vite UI for monitoring and manual admin actions.

## Requirements

- Windows 10/11
- CMake 3.20+
- C++17 compiler (MSVC recommended)
- Node.js 18+ and npm

## Quick Start (Windows CMD)

```cmd
cd /d S:\whr_system
npm --prefix admin\backend install
npm --prefix admin\frontend install
cmake -S . -B build
cmake --build build --config Debug
build\bin\whr_simulate.exe --db data\whr_simulation.sqlite --players 100 --matches 12000 --seed 20260209
build\bin\whr_recalc.exe --db data\whr_simulation.sqlite --full
start_admin_services.bat
```

After startup:

- Backend: `http://localhost:3001`
- Frontend: `http://localhost:5173`

## NPM Scripts (root)

- `npm run cpp:build` - configure and build C++ targets (`Debug`).
- `npm run sim:generate` - generate simulation data into `data\whr_simulation.sqlite`.
- `npm run sim:recalc` - run recalculation over existing DB.
- `npm run admin:backend` - run backend in watch mode.
- `npm run admin:frontend` - run frontend in dev mode.
- `npm run admin:smoke` - run backend smoke script.

## C++ Tools

Build outputs are expected under `build\bin`.

- `whr_simulate.exe`  
  Generates players and matches, then writes rating history/snapshots.
  - `--db <path>`
  - `--players <n>`
  - `--matches <n>`
  - `--duel-w2-elo <x>`
  - `--duel-prior-games <x>`
  - `--duel-max-step-elo <x>`
  - `--optimize-interval <n>`
  - `--final-optimize-iterations <n>`
  - `--no-reset`
- `whr_recalc.exe`  
  Re-runs optimization from persisted matches.
  - `--db <path>`
  - `--iterations <n>`
  - `--epsilon <x>`
  - `--duel-w2-elo <x>`
  - `--duel-prior-games <x>`
  - `--duel-max-step-elo <x>`
  - `--players <n>`
  - `--matches <n>`
- `whr_debug_duel.exe`  
  Runs a deterministic 3-player duel timeline for diagnostics.

Use `--help` on `whr_simulate` or `whr_recalc` to see full flag reference.

## Tests

```cmd
cmake -S . -B build
cmake --build build --target whr_tests --config Debug
ctest --test-dir build -C Debug --output-on-failure
```

## Backend Environment Variables

- `WHR_DB_PATH` - SQLite path (default `data\whr_simulation.sqlite` from repo root).
- `WHR_SIMULATE_EXE` - custom path to `whr_simulate.exe`.
- `WHR_RECALC_EXE` - custom path to `whr_recalc.exe`.
- `WHR_ADMIN_PORT` - backend port (default `3001`).

## Project Structure

```text
whr_system/
  admin/
    backend/
    frontend/
  apps/
    common/
    debug_duel/
    recalc/
    simulate/
  include/
    whr/
  tests/
  data/
  CMakeLists.txt
  package.json
```

## Additional Integration Notes

- WHR async integration guidance for game servers: `LLM_WHR_MMO_INTEGRATION.md`
- Admin API contract reference: `admin/API_FOR_LLM.md`
