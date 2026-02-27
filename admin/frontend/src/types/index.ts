export type RatingScope = 'duel' | 'team_small' | 'team_large' | 'ffa';
export type MatchMode = RatingScope;

export interface RatingValue {
  ratingElo: number;
  sigmaElo: number;
}

export interface PlayerListItem {
  id: number;
  handle: string;
  ratingElo: number;
  sigmaElo: number;
}

export interface MatchSideView {
  sideIndex: number;
  playerIds: number[];
  players: string[];
  ratingsBefore?: Array<number | null>;
  rankPositionsBefore?: Array<number | null>;
}

export interface MatchView {
  id: number;
  mode: MatchMode;
  playedAt: number;
  winnerSideIndex: number;
  sides: MatchSideView[];
  winProbabilities?: number[];
  playerSideIndex?: number;
  playerRatingBefore?: number;
  playerRatingAfter?: number;
  playerRatingDelta?: number;
  playerRankBefore?: number;
  playerRankAfter?: number;
}

export interface PlayerRatingPoint {
  playedAt: number;
  scope: RatingScope;
  ratingElo: number;
  sigmaElo: number;
  source: string;
}

export interface PlayerProfile {
  player: {
    id: number;
    handle: string;
    ratings: Record<RatingScope, RatingValue>;
  };
  selectedScope: RatingScope;
  scopeTotalPlayers?: number;
  scopeRankPosition?: number;
  ratingHistory: PlayerRatingPoint[];
  recentMatches: MatchView[];
}

export interface RecalcJob {
  id: number;
  status: string;
  requestedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  message: string | null;
}

export interface HealthResponse {
  ok: boolean;
  latestSnapshotAt: string | null;
}

export interface PaginatedPlayers {
  page: number;
  pageSize: number;
  scope: RatingScope;
  latestRunId: number | null;
  total: number;
  items: PlayerListItem[];
}

export interface PaginatedMatches {
  page: number;
  pageSize: number;
  total: number;
  items: MatchView[];
}
