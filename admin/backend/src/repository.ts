import Database from "better-sqlite3";

import type {
  CreateDuelMatchInput,
  MatchMode,
  MatchSideView,
  MatchView,
  PlayerListItem,
  PlayerProfile,
  PlayerRatingPoint,
  RatingScope,
  RatingValue,
  RecalcJobView
} from "./types.js";

interface MatchFilters {
  mode?: MatchMode;
  playerId?: number;
  fromTime?: number;
  toTime?: number;
  latestRunOnly?: boolean;
  page: number;
  pageSize: number;
}

const DEFAULT_RATING_ELO = 1400.0;
const DEFAULT_SIGMA_ELO = 350.0;
const ELO_TO_R_FACTOR = Math.LN10 / 400.0;

interface MatchParticipantRating {
  ratingBefore: number;
  ratingAfter: number;
}

type MatchRatingsByPlayer = Map<number, MatchParticipantRating>;

function ratingEloToNaturalR(ratingElo: number): number {
  return (ratingElo - DEFAULT_RATING_ELO) * ELO_TO_R_FACTOR;
}

function softmax(values: number[]): number[] {
  if (values.length === 0) return [];
  const maxValue = Math.max(...values);
  const expValues = values.map((value) => Math.exp(value - maxValue));
  const expSum = expValues.reduce((acc, value) => acc + value, 0.0);
  if (!(expSum > 0)) {
    const uniform = 1.0 / values.length;
    return values.map(() => uniform);
  }
  return expValues.map((value) => value / expSum);
}

function normalizedModeSql(alias: string): string {
  return `
CASE
  WHEN ${alias}.mode = 'team' THEN
    CASE
      WHEN COALESCE((
        SELECT COUNT(1)
        FROM match_sides AS ms0
        JOIN side_players AS sp0
          ON sp0.side_id = ms0.id
        WHERE ms0.match_id = ${alias}.id
          AND ms0.side_index = 0
      ), 0) <= 4 THEN 'team_small'
      ELSE 'team_large'
    END
  WHEN ${alias}.mode = 'team_small' THEN 'team_small'
  WHEN ${alias}.mode = 'team_large' THEN 'team_large'
  WHEN ${alias}.mode = 'duel' THEN 'duel'
  WHEN ${alias}.mode = 'ffa' THEN 'ffa'
  ELSE 'duel'
END`;
}

export class WhrRepository {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath, { timeout: 15000 });
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("busy_timeout = 15000");
    this.ensureSchema();
  }

  close(): void {
    this.db.close();
  }

  listPlayers(
    search: string,
    page: number,
    pageSize: number,
    scope: RatingScope,
    latestRunOnly: boolean
  ): {
    latestRunId: number | null;
    total: number;
    items: PlayerListItem[];
  } {
    const latestRunId = this.getLatestCompletedRunId();
    const queryText = search.trim();
    const like = `%${queryText}%`;
    const offset = (page - 1) * pageSize;

    if (latestRunOnly) {
      if (latestRunId === null) {
        return {
          latestRunId: null,
          total: 0,
          items: []
        };
      }

      const total = this.db
        .prepare(
          `
SELECT COUNT(1) AS total
FROM players AS p
JOIN rating_snapshots AS rs
  ON rs.player_id = p.id
 AND rs.run_id = ?
 AND rs.rating_scope = ?
WHERE (? = '' OR p.handle LIKE ?);
`
        )
        .get(latestRunId, scope, queryText, like) as { total: number };

      const rows = this.db
        .prepare(
          `
SELECT
  p.id AS id,
  p.handle AS handle,
  rs.rating_elo AS ratingElo,
  rs.sigma_elo AS sigmaElo
FROM players AS p
JOIN rating_snapshots AS rs
  ON rs.player_id = p.id
 AND rs.run_id = ?
 AND rs.rating_scope = ?
WHERE (? = '' OR p.handle LIKE ?)
ORDER BY rs.rating_elo DESC, p.id ASC
LIMIT ? OFFSET ?;
`
        )
        .all(latestRunId, scope, queryText, like, pageSize, offset) as PlayerListItem[];

      return {
        latestRunId,
        total: total.total,
        items: rows
      };
    }

    const total = this.db
      .prepare(
        `
SELECT COUNT(1) AS total
FROM players
WHERE (? = '' OR handle LIKE ?);
`
      )
      .get(queryText, like) as { total: number };

    const rows = this.db
      .prepare(
        `
SELECT
  p.id AS id,
  p.handle AS handle,
  COALESCE(rs.rating_elo, ${DEFAULT_RATING_ELO}) AS ratingElo,
  COALESCE(rs.sigma_elo, ${DEFAULT_SIGMA_ELO}) AS sigmaElo
FROM players AS p
LEFT JOIN rating_snapshots AS rs
  ON rs.player_id = p.id
 AND rs.run_id = ?
 AND rs.rating_scope = ?
WHERE (? = '' OR p.handle LIKE ?)
ORDER BY ratingElo DESC, p.id ASC
LIMIT ? OFFSET ?;
`
      )
      .all(latestRunId, scope, queryText, like, pageSize, offset) as PlayerListItem[];

    return {
      latestRunId,
      total: total.total,
      items: rows
    };
  }

  getPlayerProfile(
    playerId: number,
    historyLimit: number,
    matchesLimit: number,
    scope: RatingScope
  ): PlayerProfile | null {
    const latestRunId = this.getLatestCompletedRunId();
    const player = this.db
      .prepare(
        `
SELECT
  p.id AS id,
  p.handle AS handle
FROM players AS p
WHERE p.id = ?;
`
      )
      .get(playerId) as { id: number; handle: string } | undefined;

    if (!player) return null;

    const ratings = this.defaultRatings_();
    if (latestRunId !== null) {
      const snapshotRows = this.db
        .prepare(
          `
SELECT
  rating_scope AS ratingScope,
  rating_elo AS ratingElo,
  sigma_elo AS sigmaElo
FROM rating_snapshots
WHERE run_id = ?
  AND player_id = ?;
`
        )
        .all(latestRunId, playerId) as Array<{
        ratingScope: RatingScope;
        ratingElo: number;
        sigmaElo: number;
      }>;
      for (const row of snapshotRows) {
        ratings[row.ratingScope] = {
          ratingElo: row.ratingElo,
          sigmaElo: row.sigmaElo
        };
      }
    }

    const historyRows = this.queryPlayerHistory_(playerId, scope, historyLimit, latestRunId);
    historyRows.reverse();
    if (historyRows.length === 0 || historyRows[0].playedAt > 0) {
      historyRows.unshift({
        playedAt: 0,
        scope,
        ratingElo: DEFAULT_RATING_ELO,
        sigmaElo: DEFAULT_SIGMA_ELO,
        source: "initial"
      });
    }

    const scopeTotalPlayers =
      latestRunId !== null ? this.getScopeTotalPlayers_(latestRunId, scope) : undefined;
    const selectedScopeRating = ratings[scope];
    const scopeRankPosition =
      latestRunId !== null && scopeTotalPlayers !== undefined && scopeTotalPlayers > 0
        ? this.getSnapshotRankPosition_(
            latestRunId,
            scope,
            playerId,
            selectedScopeRating.ratingElo
          )
        : undefined;

    const modeExpr = normalizedModeSql("m");
    const matchRows = this.db
      .prepare(
        `
SELECT
  m.id AS id,
  ${modeExpr} AS mode,
  m.played_at AS playedAt,
  m.winner_side_index AS winnerSideIndex,
  ms.side_index AS playerSideIndex
FROM matches AS m
JOIN match_sides AS ms
  ON ms.match_id = m.id
JOIN side_players AS sp
  ON sp.side_id = ms.id
WHERE sp.player_id = ?
  AND ${modeExpr} = ?
ORDER BY m.played_at DESC, m.id DESC
LIMIT ?;
`
      )
      .all(playerId, scope, matchesLimit) as Array<{
      id: number;
      mode: MatchMode;
      playedAt: number;
      winnerSideIndex: number;
      playerSideIndex: number;
    }>;

    const matchRatingsById = this.getMatchRatingsByPlayer_(matchRows.map((row) => row.id), scope, latestRunId);
    const rankByPlayerAndRatingCache = new Map<string, number>();
    const resolveRankForPlayer = (
      targetPlayerId: number,
      rating: number | undefined
    ): number | undefined => {
      if (
        latestRunId === null ||
        rating === undefined ||
        scopeTotalPlayers === undefined ||
        scopeTotalPlayers <= 0
      ) {
        return undefined;
      }
      const key = `${targetPlayerId}:${rating.toFixed(6)}`;
      const cached = rankByPlayerAndRatingCache.get(key);
      if (cached !== undefined) return cached;
      const rank = this.getSnapshotRankPosition_(latestRunId, scope, targetPlayerId, rating);
      rankByPlayerAndRatingCache.set(key, rank);
      return rank;
    };
    const recentMatches = matchRows.map((row) => {
      const ratingsByPlayer = matchRatingsById.get(row.id);
      const rankPositionsByPlayer = new Map<number, number>();
      if (ratingsByPlayer) {
        for (const [targetPlayerId, rating] of ratingsByPlayer.entries()) {
          const rankBefore = resolveRankForPlayer(targetPlayerId, rating.ratingBefore);
          if (rankBefore !== undefined) {
            rankPositionsByPlayer.set(targetPlayerId, rankBefore);
          }
        }
      }
      const selectedPlayerRating = ratingsByPlayer?.get(playerId);
      const playerRankBefore = resolveRankForPlayer(playerId, selectedPlayerRating?.ratingBefore);
      const playerRankAfter = resolveRankForPlayer(playerId, selectedPlayerRating?.ratingAfter);
      const sides = this.getMatchSides(
        row.id,
        ratingsByPlayer,
        rankPositionsByPlayer.size > 0 ? rankPositionsByPlayer : undefined
      );
      return {
        id: row.id,
        mode: row.mode,
        playedAt: row.playedAt,
        winnerSideIndex: row.winnerSideIndex,
        playerSideIndex: row.playerSideIndex,
        playerRatingBefore: selectedPlayerRating?.ratingBefore,
        playerRatingAfter: selectedPlayerRating?.ratingAfter,
        playerRatingDelta:
          selectedPlayerRating !== undefined
            ? selectedPlayerRating.ratingAfter - selectedPlayerRating.ratingBefore
            : undefined,
        playerRankBefore,
        playerRankAfter,
        sides,
        winProbabilities: this.computeWinProbabilities_(sides, ratingsByPlayer)
      };
    });

    return {
      player: {
        id: player.id,
        handle: player.handle,
        ratings
      },
      selectedScope: scope,
      scopeTotalPlayers,
      scopeRankPosition,
      ratingHistory: historyRows,
      recentMatches
    };
  }

  listMatches(filters: MatchFilters): {
    total: number;
    items: MatchView[];
    latestRunId: number | null;
  } {
    const modeExpr = normalizedModeSql("m");
    const where: string[] = [];
    const params: Array<string | number> = [];
    const latestRunId = filters.latestRunOnly ? this.getLatestCompletedRunId() : null;

    if (filters.latestRunOnly) {
      if (latestRunId === null) {
        return {
          total: 0,
          items: [],
          latestRunId: null
        };
      }
      where.push(
        "EXISTS (SELECT 1 FROM player_rating_history h WHERE h.run_id = ? AND h.match_id = m.id)"
      );
      params.push(latestRunId);
    }

    if (filters.mode) {
      where.push(`${modeExpr} = ?`);
      params.push(filters.mode);
    }
    if (filters.fromTime !== undefined) {
      where.push("m.played_at >= ?");
      params.push(filters.fromTime);
    }
    if (filters.toTime !== undefined) {
      where.push("m.played_at <= ?");
      params.push(filters.toTime);
    }
    if (filters.playerId !== undefined) {
      where.push(
        "EXISTS (SELECT 1 FROM match_sides ms2 JOIN side_players sp2 ON sp2.side_id = ms2.id WHERE ms2.match_id = m.id AND sp2.player_id = ?)"
      );
      params.push(filters.playerId);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const offset = (filters.page - 1) * filters.pageSize;

    const totalStmt = this.db.prepare(`
SELECT COUNT(1) AS total
FROM matches AS m
${whereClause};
`);
    const total = totalStmt.get(...params) as { total: number };

    const pageStmt = this.db.prepare(`
SELECT
  m.id AS id,
  ${modeExpr} AS mode,
  m.played_at AS playedAt,
  m.winner_side_index AS winnerSideIndex
FROM matches AS m
${whereClause}
ORDER BY m.played_at DESC, m.id DESC
LIMIT ? OFFSET ?;
`);
    const rows = pageStmt.all(...params, filters.pageSize, offset) as Array<{
      id: number;
      mode: MatchMode;
      playedAt: number;
      winnerSideIndex: number;
    }>;

    const matchIdsByMode: Record<MatchMode, number[]> = {
      duel: [],
      team_small: [],
      team_large: [],
      ffa: []
    };
    for (const row of rows) {
      matchIdsByMode[row.mode].push(row.id);
    }
    const matchRatingsByMode: Record<MatchMode, Map<number, MatchRatingsByPlayer>> = {
      duel: this.getMatchRatingsByPlayer_(matchIdsByMode.duel, "duel", latestRunId),
      team_small: this.getMatchRatingsByPlayer_(matchIdsByMode.team_small, "team_small", latestRunId),
      team_large: this.getMatchRatingsByPlayer_(matchIdsByMode.team_large, "team_large", latestRunId),
      ffa: this.getMatchRatingsByPlayer_(matchIdsByMode.ffa, "ffa", latestRunId)
    };

    return {
      total: total.total,
      latestRunId,
      items: rows.map((row) => {
        const sides = this.getMatchSides(row.id);
        const ratingsByPlayer = matchRatingsByMode[row.mode].get(row.id);
        return {
          ...row,
          sides,
          winProbabilities: this.computeWinProbabilities_(sides, ratingsByPlayer)
        };
      })
    };
  }

  createDuelMatch(input: CreateDuelMatchInput): MatchView {
    if (input.playerAId === input.playerBId) {
      throw new Error("playerAId and playerBId must be different");
    }
    if (input.winnerPlayerId !== input.playerAId && input.winnerPlayerId !== input.playerBId) {
      throw new Error("winnerPlayerId must match one of selected players");
    }

    const playerRows = this.db
      .prepare(
        `
SELECT
  id AS id,
  handle AS handle
FROM players
WHERE id IN (?, ?);
`
      )
      .all(input.playerAId, input.playerBId) as Array<{ id: number; handle: string }>;

    if (playerRows.length !== 2) {
      const foundIds = new Set<number>(playerRows.map((row) => row.id));
      const missing: number[] = [];
      if (!foundIds.has(input.playerAId)) missing.push(input.playerAId);
      if (!foundIds.has(input.playerBId)) missing.push(input.playerBId);
      throw new Error(`Players not found: ${missing.join(", ")}`);
    }

    const playerHandlesById = new Map<number, string>();
    for (const row of playerRows) {
      playerHandlesById.set(row.id, row.handle);
    }

    const winnerSideIndex = input.winnerPlayerId === input.playerAId ? 0 : 1;
    const playedAt = input.playedAt ?? this.getNextPlayedAt_();

    const writeTransaction = this.db.transaction((): number => {
      const matchInfo = this.db
        .prepare(
          `
INSERT INTO matches(mode, played_at, winner_side_index)
VALUES ('duel', ?, ?);
`
        )
        .run(playedAt, winnerSideIndex);
      const matchId = Number(matchInfo.lastInsertRowid);

      const sideStmt = this.db.prepare(
        `
INSERT INTO match_sides(match_id, side_index)
VALUES (?, ?);
`
      );
      const side0Id = Number(sideStmt.run(matchId, 0).lastInsertRowid);
      const side1Id = Number(sideStmt.run(matchId, 1).lastInsertRowid);

      const sidePlayerStmt = this.db.prepare(
        `
INSERT INTO side_players(side_id, player_id)
VALUES (?, ?);
`
      );
      sidePlayerStmt.run(side0Id, input.playerAId);
      sidePlayerStmt.run(side1Id, input.playerBId);

      return matchId;
    });

    const matchId = writeTransaction();

    return {
      id: matchId,
      mode: "duel",
      playedAt,
      winnerSideIndex,
      sides: [
        {
          sideIndex: 0,
          playerIds: [input.playerAId],
          players: [playerHandlesById.get(input.playerAId)!]
        },
        {
          sideIndex: 1,
          playerIds: [input.playerBId],
          players: [playerHandlesById.get(input.playerBId)!]
        }
      ]
    };
  }

  createRecalcJob(): RecalcJobView {
    const info = this.db.prepare("INSERT INTO recalc_jobs(status) VALUES('queued');").run();
    const jobId = Number(info.lastInsertRowid);
    const job = this.getRecalcJob(jobId);
    if (!job) throw new Error("Failed to create recalc job");
    return job;
  }

  getRecalcJob(jobId: number): RecalcJobView | null {
    const row = this.db
      .prepare(
        `
SELECT
  id AS id,
  status AS status,
  requested_at AS requestedAt,
  started_at AS startedAt,
  finished_at AS finishedAt,
  message AS message
FROM recalc_jobs
WHERE id = ?;
`
      )
      .get(jobId) as RecalcJobView | undefined;
    return row ?? null;
  }

  getLatestActiveRecalcJob(): RecalcJobView | null {
    const row = this.db
      .prepare(
        `
SELECT
  id AS id,
  status AS status,
  requested_at AS requestedAt,
  started_at AS startedAt,
  finished_at AS finishedAt,
  message AS message
FROM recalc_jobs
WHERE status IN ('queued', 'running')
ORDER BY id DESC
LIMIT 1;
`
      )
      .get() as RecalcJobView | undefined;
    if (!row) return null;

    const latestTerminalRow = this.db
      .prepare(
        `
SELECT id AS id
FROM recalc_jobs
WHERE status IN ('success', 'failed')
ORDER BY id DESC
LIMIT 1;
`
      )
      .get() as { id: number } | undefined;

    // Defensive cleanup: if a newer terminal job exists, older active job is stale.
    if (latestTerminalRow && latestTerminalRow.id > row.id) {
      this.db
        .prepare(
          `
UPDATE recalc_jobs
SET status = 'failed',
    finished_at = COALESCE(finished_at, CURRENT_TIMESTAMP),
    message = COALESCE(message, 'Marked stale by backend: newer recalc job already completed')
WHERE id = ?
  AND status IN ('queued', 'running');
`
        )
        .run(row.id);
      return null;
    }

    return row;
  }

  markRecalcJobFailed(jobId: number, message: string): void {
    this.db
      .prepare(
        `
UPDATE recalc_jobs
SET status = 'failed',
    finished_at = CURRENT_TIMESTAMP,
    message = ?
WHERE id = ?;
`
      )
      .run(message, jobId);
  }

  getLatestSnapshotTimestamp(): string | null {
    const row = this.db
      .prepare("SELECT MAX(updated_at) AS latest FROM rating_snapshots;")
      .get() as { latest: string | null };
    return row.latest;
  }

  private getLatestCompletedRunId(): number | null {
    const row = this.db
      .prepare(
        `
SELECT id
FROM rating_runs
WHERE status = 'completed'
ORDER BY CASE WHEN run_type = 'recalculate' THEN 0 ELSE 1 END,
         id DESC
LIMIT 1;
`
      )
      .get() as { id: number } | undefined;
    return row?.id ?? null;
  }

  private getMatchSides(
    matchId: number,
    ratingsByPlayer?: MatchRatingsByPlayer,
    rankPositionsByPlayer?: Map<number, number>
  ): MatchSideView[] {
    const rows = this.db
      .prepare(
        `
SELECT
  ms.side_index AS sideIndex,
  sp.player_id AS playerId,
  p.handle AS handle
FROM match_sides AS ms
JOIN side_players AS sp
  ON sp.side_id = ms.id
JOIN players AS p
  ON p.id = sp.player_id
WHERE ms.match_id = ?
ORDER BY ms.side_index ASC, sp.player_id ASC;
`
      )
      .all(matchId) as Array<{ sideIndex: number; playerId: number; handle: string }>;

    const sides = new Map<number, MatchSideView>();
    for (const row of rows) {
      if (!sides.has(row.sideIndex)) {
        const side: MatchSideView = {
          sideIndex: row.sideIndex,
          playerIds: [],
          players: []
        };
        if (ratingsByPlayer) {
          side.ratingsBefore = [];
          if (rankPositionsByPlayer) {
            side.rankPositionsBefore = [];
          }
        }
        sides.set(row.sideIndex, side);
      }
      const side = sides.get(row.sideIndex)!;
      side.playerIds.push(row.playerId);
      side.players.push(row.handle);
      if (side.ratingsBefore) {
        const rating = ratingsByPlayer?.get(row.playerId);
        side.ratingsBefore.push(rating ? rating.ratingBefore : null);
      }
      if (side.rankPositionsBefore) {
        const rank = rankPositionsByPlayer?.get(row.playerId);
        side.rankPositionsBefore.push(rank ?? null);
      }
    }

    return [...sides.values()].sort((a, b) => a.sideIndex - b.sideIndex);
  }

  private computeWinProbabilities_(
    sides: MatchSideView[],
    ratingsByPlayer?: MatchRatingsByPlayer
  ): number[] | undefined {
    if (sides.length === 0) return undefined;
    if (sides.length === 1) return [1.0];

    const strengths = sides.map((side) => {
      let strengthR = 0.0;
      for (const playerId of side.playerIds) {
        const ratingBefore = ratingsByPlayer?.get(playerId)?.ratingBefore ?? DEFAULT_RATING_ELO;
        strengthR += ratingEloToNaturalR(ratingBefore);
      }
      return strengthR;
    });

    return softmax(strengths);
  }

  private getMatchRatingsByPlayer_(
    matchIds: number[],
    scope: RatingScope,
    latestRunId: number | null
  ): Map<number, MatchRatingsByPlayer> {
    if (matchIds.length === 0) return new Map<number, MatchRatingsByPlayer>();

    const placeholders = matchIds.map(() => "?").join(", ");
    const whereRunSql = latestRunId !== null ? "AND h.run_id = ?" : "";
    const previousRunSql = latestRunId !== null ? "AND h_prev.run_id = h.run_id" : "";
    const rows = this.db
      .prepare(
        `
SELECT
  h.id AS historyId,
  h.match_id AS matchId,
  h.player_id AS playerId,
  h.rating_elo AS ratingAfter,
  COALESCE(
    (
      SELECT h_prev.rating_elo
      FROM player_rating_history AS h_prev
      WHERE h_prev.player_id = h.player_id
        AND h_prev.rating_scope = h.rating_scope
        ${previousRunSql}
        AND (
          h_prev.played_at < h.played_at
          OR (h_prev.played_at = h.played_at AND h_prev.id < h.id)
        )
      ORDER BY h_prev.played_at DESC, h_prev.id DESC
      LIMIT 1
    ),
    ${DEFAULT_RATING_ELO}
  ) AS ratingBefore
FROM player_rating_history AS h
WHERE h.match_id IN (${placeholders})
  AND h.rating_scope = ?
  ${whereRunSql}
ORDER BY h.id DESC;
`
      )
      .all(...matchIds, scope, ...(latestRunId !== null ? [latestRunId] : [])) as Array<{
      historyId: number;
      matchId: number;
      playerId: number;
      ratingAfter: number;
      ratingBefore: number;
    }>;

    const result = new Map<number, MatchRatingsByPlayer>();
    for (const row of rows) {
      let byPlayer = result.get(row.matchId);
      if (!byPlayer) {
        byPlayer = new Map<number, MatchParticipantRating>();
        result.set(row.matchId, byPlayer);
      }
      if (!byPlayer.has(row.playerId)) {
        byPlayer.set(row.playerId, {
          ratingBefore: row.ratingBefore,
          ratingAfter: row.ratingAfter
        });
      }
    }
    return result;
  }

  private getScopeTotalPlayers_(runId: number, scope: RatingScope): number {
    const row = this.db
      .prepare(
        `
SELECT COUNT(1) AS total
FROM rating_snapshots
WHERE run_id = ?
  AND rating_scope = ?;
`
      )
      .get(runId, scope) as { total: number };
    return row.total;
  }

  private getSnapshotRankPosition_(
    runId: number,
    scope: RatingScope,
    playerId: number,
    ratingElo: number
  ): number {
    const row = this.db
      .prepare(
        `
SELECT COUNT(1) AS better
FROM rating_snapshots
WHERE run_id = ?
  AND rating_scope = ?
  AND (
    rating_elo > ?
    OR (rating_elo = ? AND player_id < ?)
  );
`
      )
      .get(runId, scope, ratingElo, ratingElo, playerId) as { better: number };
    return row.better + 1;
  }

  private getNextPlayedAt_(): number {
    const row = this.db
      .prepare("SELECT MAX(played_at) AS maxPlayedAt FROM matches;")
      .get() as { maxPlayedAt: number | null };
    if (typeof row.maxPlayedAt === "number" && Number.isFinite(row.maxPlayedAt)) {
      return Math.floor(row.maxPlayedAt) + 1;
    }
    return Math.floor(Date.now() / 1000);
  }

  private ensureSchema(): void {
    this.db.exec(`
CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mode TEXT NOT NULL,
  played_at INTEGER NOT NULL,
  winner_side_index INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS match_sides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  side_index INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS side_players (
  side_id INTEGER NOT NULL REFERENCES match_sides(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  PRIMARY KEY (side_id, player_id)
);

CREATE TABLE IF NOT EXISTS rating_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_type TEXT NOT NULL,
  status TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rating_snapshots (
  run_id INTEGER NOT NULL REFERENCES rating_runs(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  rating_scope TEXT NOT NULL DEFAULT 'duel',
  rating_elo REAL NOT NULL,
  sigma_elo REAL NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (run_id, player_id, rating_scope)
);

CREATE TABLE IF NOT EXISTS player_rating_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES rating_runs(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  match_id INTEGER REFERENCES matches(id) ON DELETE SET NULL,
  played_at INTEGER NOT NULL,
  rating_scope TEXT NOT NULL DEFAULT 'duel',
  rating_elo REAL NOT NULL,
  sigma_elo REAL NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recalc_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL,
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  finished_at TEXT,
  message TEXT
);

CREATE INDEX IF NOT EXISTS idx_matches_order ON matches(played_at, id);
CREATE INDEX IF NOT EXISTS idx_match_sides_match ON match_sides(match_id, side_index);
CREATE INDEX IF NOT EXISTS idx_side_players_player ON side_players(player_id, side_id);
CREATE INDEX IF NOT EXISTS idx_recalc_jobs_status ON recalc_jobs(status, id);
`);
    this.migrateLegacyRatingSchema_();
    this.db.exec(`
CREATE INDEX IF NOT EXISTS idx_rating_snapshots_player_scope_run
  ON rating_snapshots(player_id, rating_scope, run_id);
CREATE INDEX IF NOT EXISTS idx_history_player_scope_time
  ON player_rating_history(player_id, rating_scope, played_at, id);
`);
  }

  private migrateLegacyRatingSchema_(): void {
    const snapshotsHasScope = this.tableHasColumn_("rating_snapshots", "rating_scope");
    const snapshotsPkHasScope = this.ratingSnapshotsPkHasScope_();

    if (!snapshotsHasScope || !snapshotsPkHasScope) {
      this.db.exec(`
CREATE TABLE rating_snapshots_new (
  run_id INTEGER NOT NULL REFERENCES rating_runs(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  rating_scope TEXT NOT NULL DEFAULT 'duel',
  rating_elo REAL NOT NULL,
  sigma_elo REAL NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (run_id, player_id, rating_scope)
);
`);

      if (snapshotsHasScope) {
        this.db.exec(`
INSERT INTO rating_snapshots_new(run_id, player_id, rating_scope, rating_elo, sigma_elo, updated_at)
SELECT
  run_id,
  player_id,
  COALESCE(NULLIF(rating_scope, ''), 'duel'),
  rating_elo,
  sigma_elo,
  updated_at
FROM rating_snapshots;
`);
      } else {
        this.db.exec(`
INSERT INTO rating_snapshots_new(run_id, player_id, rating_scope, rating_elo, sigma_elo, updated_at)
SELECT
  run_id,
  player_id,
  'duel',
  rating_elo,
  sigma_elo,
  updated_at
FROM rating_snapshots;
`);
      }

      this.db.exec(`
DROP TABLE rating_snapshots;
ALTER TABLE rating_snapshots_new RENAME TO rating_snapshots;
`);
    } else {
      if (this.hasEmptyRatingScopeValues_("rating_snapshots")) {
        this.db.exec(`
UPDATE rating_snapshots
SET rating_scope = 'duel'
WHERE rating_scope IS NULL OR rating_scope = '';
`);
      }
    }

    if (!this.tableHasColumn_("player_rating_history", "rating_scope")) {
      this.db.exec(
        "ALTER TABLE player_rating_history ADD COLUMN rating_scope TEXT NOT NULL DEFAULT 'duel';"
      );
    }
    if (this.hasEmptyRatingScopeValues_("player_rating_history")) {
      this.db.exec(`
UPDATE player_rating_history
SET rating_scope = 'duel'
WHERE rating_scope IS NULL OR rating_scope = '';
`);
    }
  }

  private tableHasColumn_(tableName: string, columnName: string): boolean {
    const rows = this.db.prepare(`PRAGMA table_info(${tableName});`).all() as Array<{ name: string }>;
    return rows.some((row) => row.name === columnName);
  }

  private hasEmptyRatingScopeValues_(tableName: "rating_snapshots" | "player_rating_history"): boolean {
    const row = this.db
      .prepare(
        `
SELECT EXISTS(
  SELECT 1
  FROM ${tableName}
  WHERE rating_scope IS NULL OR rating_scope = ''
) AS hasRows;
`
      )
      .get() as { hasRows: number };
    return row.hasRows === 1;
  }

  private ratingSnapshotsPkHasScope_(): boolean {
    const rows = this.db
      .prepare("PRAGMA table_info(rating_snapshots);")
      .all() as Array<{ name: string; pk: number }>;
    const runPk = rows.some((row) => row.name === "run_id" && row.pk > 0);
    const playerPk = rows.some((row) => row.name === "player_id" && row.pk > 0);
    const scopePk = rows.some((row) => row.name === "rating_scope" && row.pk > 0);
    return runPk && playerPk && scopePk;
  }

  private defaultRatings_(): Record<RatingScope, RatingValue> {
    return {
      duel: { ratingElo: DEFAULT_RATING_ELO, sigmaElo: DEFAULT_SIGMA_ELO },
      team_small: { ratingElo: DEFAULT_RATING_ELO, sigmaElo: DEFAULT_SIGMA_ELO },
      team_large: { ratingElo: DEFAULT_RATING_ELO, sigmaElo: DEFAULT_SIGMA_ELO },
      ffa: { ratingElo: DEFAULT_RATING_ELO, sigmaElo: DEFAULT_SIGMA_ELO }
    };
  }

  private queryPlayerHistory_(
    playerId: number,
    scope: RatingScope,
    historyLimit: number,
    latestRunId: number | null
  ): PlayerRatingPoint[] {
    if (latestRunId !== null) {
      return this.db
        .prepare(
          `
SELECT
  played_at AS playedAt,
  rating_scope AS scope,
  rating_elo AS ratingElo,
  sigma_elo AS sigmaElo,
  source AS source
FROM player_rating_history
WHERE player_id = ?
  AND rating_scope = ?
  AND run_id = ?
ORDER BY played_at DESC, id DESC
LIMIT ?;
`
        )
        .all(playerId, scope, latestRunId, historyLimit) as PlayerRatingPoint[];
    }

    return this.db
      .prepare(
        `
SELECT
  played_at AS playedAt,
  rating_scope AS scope,
  rating_elo AS ratingElo,
  sigma_elo AS sigmaElo,
  source AS source
FROM player_rating_history
WHERE player_id = ?
  AND rating_scope = ?
ORDER BY played_at DESC, id DESC
LIMIT ?;
`
      )
      .all(playerId, scope, historyLimit) as PlayerRatingPoint[];
  }
}

