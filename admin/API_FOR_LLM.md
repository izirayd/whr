# WHR Admin API for LLM Frontend Generation

This file is the source of truth for rebuilding `admin/frontend` against the current backend.

## Backend Location and Runtime

- API server code: `admin/backend/src/app.ts`
- Default base URL: `http://localhost:3001`
- API prefix: `/api`
- Content type: JSON
- CORS: enabled for all origins
- Auth: none (no token/session checks in current backend)

### Run Backend (CMD)

```cmd
npm --prefix admin\backend install
npm --prefix admin\backend run dev
```

## Common Data Types

```ts
type MatchMode = "duel" | "team" | "ffa";

interface PlayerListItem {
  id: number;
  handle: string;
  ratingElo: number;
  sigmaElo: number;
}

interface MatchSideView {
  sideIndex: number;
  playerIds: number[];
  players: string[];
}

interface MatchView {
  id: number;
  mode: MatchMode;
  playedAt: number;
  winnerSideIndex: number;
  sides: MatchSideView[];
  playerSideIndex?: number; // present in player profile recentMatches only
}

interface PlayerRatingPoint {
  playedAt: number;
  ratingElo: number;
  sigmaElo: number;
  source: string; // "simulation" | "recalculate" currently used
}

interface PlayerProfile {
  player: PlayerListItem;
  ratingHistory: PlayerRatingPoint[];
  recentMatches: MatchView[];
}

interface RecalcJob {
  id: number;
  status: string; // queued | running | success | failed
  requestedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  message: string | null;
}
```

## Error Format

Most errors use:

```json
{ "error": "message" }
```

Special case (`POST /api/admin/recalculate` startup failure):

```json
{
  "error": "Failed to start recalculation",
  "details": "low-level reason"
}
```

## Endpoint Reference

## 1) GET `/api/health`

Returns backend health and latest snapshot timestamp.

- Query params: none
- Success `200`:

```json
{
  "ok": true,
  "latestSnapshotAt": "2026-02-09 12:34:56"
}
```

Notes:
- `latestSnapshotAt` can be `null` when no snapshot exists yet.

---

## 2) GET `/api/players`

Paginated player list with optional handle search.

### Query params

- `page` (int > 0, default `1`, max `1000000`)
- `pageSize` (int > 0, default `25`, max `200`)
- `search` (string, default `""`)

If `page` or `pageSize` is invalid/non-positive, backend falls back to defaults.

### Success `200`

```json
{
  "page": 1,
  "pageSize": 25,
  "latestRunId": 42,
  "total": 100,
  "items": [
    {
      "id": 1,
      "handle": "AshFox",
      "ratingElo": 1512.34,
      "sigmaElo": 245.1
    }
  ]
}
```

Notes:
- Sorting: `ratingElo DESC`, then `id ASC`.
- `latestRunId` can be `null`.

---

## 3) GET `/api/players/:id`

Detailed player profile with rating history and recent matches.

### Path params

- `id` must be positive integer
  - invalid -> `400 { "error": "Invalid player id" }`

### Query params

- `historyLimit` (int > 0, default `300`, max `5000`)
- `matchesLimit` (int > 0, default `50`, max `500`)

### Success `200`

```json
{
  "player": {
    "id": 1,
    "handle": "AshFox",
    "ratingElo": 1512.34,
    "sigmaElo": 245.1
  },
  "ratingHistory": [
    {
      "playedAt": 1,
      "ratingElo": 1500,
      "sigmaElo": 350,
      "source": "simulation"
    }
  ],
  "recentMatches": [
    {
      "id": 999,
      "mode": "duel",
      "playedAt": 12000,
      "winnerSideIndex": 0,
      "playerSideIndex": 1,
      "sides": [
        { "sideIndex": 0, "playerIds": [2], "players": ["BlitzFang"] },
        { "sideIndex": 1, "playerIds": [1], "players": ["AshFox"] }
      ]
    }
  ]
}
```

Other responses:
- `404 { "error": "Player not found" }`

Notes:
- `ratingHistory` is returned in chronological order (oldest -> newest).
- `recentMatches` is newest first by `playedAt DESC, id DESC`.

---

## 4) GET `/api/matches`

Paginated list of matches with optional filters.

### Query params

- `page` (int > 0, default `1`, max `1000000`)
- `pageSize` (int > 0, default `40`, max `200`)
- `mode` (`duel` | `team` | `ffa`; invalid value is ignored)
- `playerId` (optional int; invalid/empty ignored)
- `fromTime` (optional int; invalid/empty ignored)
- `toTime` (optional int; invalid/empty ignored)

### Success `200`

```json
{
  "page": 1,
  "pageSize": 40,
  "total": 12000,
  "items": [
    {
      "id": 12000,
      "mode": "team",
      "playedAt": 12000,
      "winnerSideIndex": 1,
      "sides": [
        { "sideIndex": 0, "playerIds": [1, 5], "players": ["AshFox", "EchoRider"] },
        { "sideIndex": 1, "playerIds": [2, 7], "players": ["BlitzFang", "GaleSpark"] }
      ]
    }
  ]
}
```

Notes:
- Sorting: newest first (`playedAt DESC`, `id DESC`).
- In this endpoint, `items[*].playerSideIndex` is not included.

---

## 5) POST `/api/admin/recalculate`

Creates a recalculation job and starts `whr_recalc.exe` in detached mode.

- Body: any JSON object is accepted; existing client sends `{}`
- Success `202`:

```json
{
  "job": {
    "id": 55,
    "status": "queued",
    "requestedAt": "2026-02-09 12:40:00",
    "startedAt": null,
    "finishedAt": null,
    "message": null
  },
  "executable": "S:\\whr_system\\build\\bin\\whr_recalc.exe"
}
```

Failure `500` example:

```json
{
  "error": "Failed to start recalculation",
  "details": "whr_recalc executable not found. Checked: ..."
}
```

Notes:
- Job lifecycle: `queued -> running -> success|failed`.
- On startup failure backend also marks the created job as `failed`.

---

## 6) GET `/api/admin/recalculate/:jobId`

Returns current recalculation job state.

### Path params

- `jobId` must be positive integer
  - invalid -> `400 { "error": "Invalid job id" }`

### Success `200`

```json
{
  "id": 55,
  "status": "running",
  "requestedAt": "2026-02-09 12:40:00",
  "startedAt": "2026-02-09 12:40:01",
  "finishedAt": null,
  "message": null
}
```

Other responses:
- `404 { "error": "Job not found" }`

## Frontend Rebuild Guidance

- Build pages around these API use-cases:
  - health/dashboard (`/api/health`)
  - players list/search (`/api/players`)
  - player profile + chart/history (`/api/players/:id`)
  - matches list/filter (`/api/matches`)
  - recalc job trigger + polling (`/api/admin/recalculate*`)
- Poll recalc job status every 2 seconds until terminal state (`success` or `failed`).
- Treat `playedAt` as numeric match time from DB (not ISO datetime).
- Always handle nullable fields (`latestRunId`, `latestSnapshotAt`, `startedAt`, `finishedAt`, `message`).
- Do not assume additional endpoints or auth until backend changes.
