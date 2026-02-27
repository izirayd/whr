export type RatingScope = "duel" | "team_small" | "team_large" | "ffa";
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

export interface PlayerRatingPoint {
  playedAt: number;
  scope: RatingScope;
  ratingElo: number;
  sigmaElo: number;
  source: string;
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

export interface RecalcJobView {
  id: number;
  status: string;
  requestedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  message: string | null;
}

export interface RecalcLaunchOptions {
  duelW2Elo?: number;
  teamSmallW2Elo?: number;
  teamLargeW2Elo?: number;
  duelPriorGames?: number;
  duelMaxStepElo?: number;
  optimizeInterval?: number;
  finalOptimizeIterations?: number;
  playersLimit?: number;
  matchesLimit?: number;
}

export interface CreateDuelMatchInput {
  playerAId: number;
  playerBId: number;
  winnerPlayerId: number;
  playedAt?: number;
}

