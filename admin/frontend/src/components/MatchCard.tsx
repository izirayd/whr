import { Link } from 'react-router-dom';
import { Trophy, Minus } from 'lucide-react';
import clsx from 'clsx';
import type { MatchSideView, MatchView } from '../types';
import RankTierBadge from './RankTierBadge';

interface MatchCardProps {
  match: MatchView;
  highlightPlayerId?: number;
  totalPlayersForRank?: number;
}

const MODE_COLORS: Record<string, string> = {
  duel: 'bg-sky-500/15 text-sky-400 border-sky-500/20',
  team_small: 'bg-violet-500/15 text-violet-400 border-violet-500/20',
  team_large: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  ffa: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
};

const MODE_LABELS: Record<string, string> = {
  duel: '1v1',
  team_small: 'small team',
  team_large: 'large team',
  ffa: 'ffa',
};

interface SidePlayerEntry {
  id: number;
  name: string;
  ratingBefore: number | null;
  rankBefore: number | null;
}

function getSortedSidePlayers(side: MatchSideView): SidePlayerEntry[] {
  return side.players
    .map((name, index) => ({
      id: side.playerIds[index],
      name,
      ratingBefore: typeof side.ratingsBefore?.[index] === 'number' ? side.ratingsBefore[index] : null,
      rankBefore:
        typeof side.rankPositionsBefore?.[index] === 'number' ? side.rankPositionsBefore[index] : null,
    }))
    .sort((a, b) => {
      const leftRating = a.ratingBefore ?? Number.NEGATIVE_INFINITY;
      const rightRating = b.ratingBefore ?? Number.NEGATIVE_INFINITY;

      if (leftRating !== rightRating) {
        return rightRating - leftRating;
      }

      return a.name.localeCompare(b.name);
    });
}

function getDisplaySides(sides: MatchSideView[], highlightPlayerId?: number): MatchSideView[] {
  if (highlightPlayerId === undefined || sides.length !== 2) return sides;
  const highlightedIndex = sides.findIndex((side) => side.playerIds.includes(highlightPlayerId));
  if (highlightedIndex <= 0) return sides;
  return [sides[highlightedIndex], ...sides.filter((_, index) => index !== highlightedIndex)];
}

function normalizeWinProbabilities(match: MatchView): number[] | null {
  const probabilities = match.winProbabilities;
  if (!Array.isArray(probabilities) || probabilities.length !== match.sides.length) return null;
  if (probabilities.length === 0) return null;

  let sum = 0;
  for (const value of probabilities) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
    sum += value;
  }
  if (!(sum > 0)) return null;

  return probabilities.map((value) => value / sum);
}

function remapProbabilitiesToSides(
  sourceProbabilities: number[] | null,
  sourceSides: MatchSideView[],
  targetSides: MatchSideView[],
): number[] | null {
  if (!sourceProbabilities || sourceProbabilities.length !== sourceSides.length) return null;

  const probabilityBySide = new Map<number, number>();
  for (let index = 0; index < sourceSides.length; index += 1) {
    probabilityBySide.set(sourceSides[index].sideIndex, sourceProbabilities[index]);
  }

  const mapped: number[] = [];
  for (const side of targetSides) {
    const value = probabilityBySide.get(side.sideIndex);
    if (value === undefined) return null;
    mapped.push(value);
  }
  return mapped;
}

function formatProbabilityPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function getSideLabel(side: MatchSideView): string {
  if (side.players.length === 1 && side.players[0]) return side.players[0];
  return `Team ${side.sideIndex + 1}`;
}

function getPredictionLabel(
  probabilities: number[] | null,
  sides: MatchSideView[],
): string | null {
  if (!probabilities) return null;
  if (probabilities.length !== sides.length) return null;

  if (probabilities.length === 2) {
    return `Pred: ${getSideLabel(sides[0])} ${formatProbabilityPercent(probabilities[0])} / ${getSideLabel(sides[1])} ${formatProbabilityPercent(probabilities[1])}`;
  }

  return `Pred: ${probabilities
    .map((value, index) => `${getSideLabel(sides[index])} ${formatProbabilityPercent(value)}`)
    .join(' · ')}`;
}

export default function MatchCard({ match, highlightPlayerId, totalPlayersForRank }: MatchCardProps) {
  const playerSideIdx = match.playerSideIndex;
  const isWin = playerSideIdx !== undefined && playerSideIdx === match.winnerSideIndex;
  const isLoss = playerSideIdx !== undefined && playerSideIdx !== match.winnerSideIndex;
  const playerRatingBefore =
    typeof match.playerRatingBefore === 'number' ? match.playerRatingBefore : null;
  const playerRatingAfter =
    typeof match.playerRatingAfter === 'number' ? match.playerRatingAfter : null;
  const playerRatingSummary =
    playerRatingBefore !== null && playerRatingAfter !== null
      ? { before: playerRatingBefore, after: playerRatingAfter }
      : null;
  const hasPlayerRating = playerRatingSummary !== null;
  const playerRatingDelta =
    typeof match.playerRatingDelta === 'number'
      ? match.playerRatingDelta
      : hasPlayerRating
        ? playerRatingSummary.after - playerRatingSummary.before
        : undefined;
  const hasRankProgress =
    typeof totalPlayersForRank === 'number' &&
    totalPlayersForRank > 0 &&
    typeof match.playerRankBefore === 'number' &&
    typeof match.playerRankAfter === 'number';
  const displaySides = getDisplaySides(match.sides, highlightPlayerId);
  const winProbabilities = remapProbabilitiesToSides(
    normalizeWinProbabilities(match),
    match.sides,
    displaySides,
  );
  const predictionLabel = getPredictionLabel(winProbabilities, displaySides);

  return (
    <div
      className={clsx(
        'glass-card px-4 py-3 transition-all duration-150',
        isWin && 'border-l-2 border-l-emerald-500/60',
        isLoss && 'border-l-2 border-l-rose-500/50',
      )}
    >
      {/* Header row */}
      <div className="flex items-center gap-3 mb-2.5">
        <span
          className={clsx(
            'text-[10px] font-bold uppercase px-2 py-0.5 rounded border',
            MODE_COLORS[match.mode] || 'bg-slate-700/50 text-slate-400',
          )}
        >
          {MODE_LABELS[match.mode] || match.mode}
        </span>

        <span className="text-xs text-slate-500 font-mono">#{match.id}</span>

        <span className="text-xs text-slate-600 font-mono ml-auto">
          t={match.playedAt}
        </span>

        {playerSideIdx !== undefined && (
          <span
            className={clsx(
              'text-[10px] font-bold uppercase px-2 py-0.5 rounded',
              isWin ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400',
            )}
          >
            {isWin ? 'WIN' : 'LOSS'}
          </span>
        )}
      </div>

      {predictionLabel && (
        <div className="mb-2 text-[10px] font-mono text-slate-500">{predictionLabel}</div>
      )}

      {/* Sides */}
      {match.mode === 'duel' && displaySides.length === 2 ? (
        <DuelDisplay
          match={match}
          sides={displaySides}
          highlightPlayerId={highlightPlayerId}
          totalPlayersForRank={totalPlayersForRank}
        />
      ) : (
        <SidesDisplay
          match={match}
          sides={displaySides}
          highlightPlayerId={highlightPlayerId}
          totalPlayersForRank={totalPlayersForRank}
        />
      )}

      {playerRatingSummary && playerRatingDelta !== undefined && (
        <div className="mt-2.5 space-y-2 border-t border-slate-700/40 pt-2 text-[11px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500 font-mono">
              Rating: {playerRatingSummary.before.toFixed(1)} {'->'} {playerRatingSummary.after.toFixed(1)}
            </span>
            <span
              className={clsx(
                'font-mono font-semibold',
                playerRatingDelta >= 0 ? 'text-emerald-400' : 'text-rose-400',
              )}
            >
              {playerRatingDelta >= 0 ? '+' : ''}
              {playerRatingDelta.toFixed(1)}
            </span>
          </div>

          {hasRankProgress && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-slate-500 font-mono">Rank:</span>
              <RankTierBadge
                rankPosition={match.playerRankBefore!}
                totalPlayers={totalPlayersForRank!}
                showRank
                compact
              />
              <span className="text-slate-500 font-mono">-&gt;</span>
              <RankTierBadge
                rankPosition={match.playerRankAfter!}
                totalPlayers={totalPlayersForRank!}
                showRank
                compact
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DuelDisplay({
  match,
  sides,
  highlightPlayerId,
  totalPlayersForRank,
}: {
  match: MatchView;
  sides: MatchSideView[];
  highlightPlayerId?: number;
  totalPlayersForRank?: number;
}) {
  const [sideA, sideB] = sides;

  return (
    <div className="flex items-center gap-3">
      <SidePlayers
        side={sideA}
        isWinner={sideA.sideIndex === match.winnerSideIndex}
        highlightPlayerId={highlightPlayerId}
        totalPlayersForRank={totalPlayersForRank}
      />
      <span className="text-slate-600 text-xs font-bold">VS</span>
      <SidePlayers
        side={sideB}
        isWinner={sideB.sideIndex === match.winnerSideIndex}
        highlightPlayerId={highlightPlayerId}
        totalPlayersForRank={totalPlayersForRank}
      />
    </div>
  );
}

function SidesDisplay({
  match,
  sides,
  highlightPlayerId,
  totalPlayersForRank,
}: {
  match: MatchView;
  sides: MatchSideView[];
  highlightPlayerId?: number;
  totalPlayersForRank?: number;
}) {
  if (sides.length === 2) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {sides.map((side) => {
          const isWinner = side.sideIndex === match.winnerSideIndex;

          return (
            <div
              key={side.sideIndex}
              className={clsx(
                'rounded-lg border bg-slate-900/35 px-3 py-2.5',
                isWinner ? 'border-emerald-500/30' : 'border-slate-700/50',
              )}
            >
              <div className="mb-2 flex items-center gap-1.5">
                {isWinner ? (
                  <Trophy className="h-3.5 w-3.5 flex-shrink-0 text-amber-400" />
                ) : (
                  <Minus className="h-3.5 w-3.5 flex-shrink-0 text-slate-600" />
                )}
                <span
                  className={clsx(
                    'text-[10px] font-semibold uppercase tracking-wider',
                    isWinner ? 'text-emerald-300' : 'text-slate-500',
                  )}
                >
                  Team {side.sideIndex + 1}
                </span>
              </div>
              <SidePlayers
                side={side}
                isWinner={isWinner}
                highlightPlayerId={highlightPlayerId}
                totalPlayersForRank={totalPlayersForRank}
              />
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sides.map((side) => (
        <div
          key={side.sideIndex}
          className={clsx(
            'rounded-lg border bg-slate-900/35 px-3 py-2.5',
            side.sideIndex === match.winnerSideIndex ? 'border-emerald-500/30' : 'border-slate-700/50',
          )}
        >
          <div className="mb-2 flex items-center gap-1.5">
            {side.sideIndex === match.winnerSideIndex ? (
              <Trophy className="h-3.5 w-3.5 flex-shrink-0 text-amber-400" />
            ) : (
              <Minus className="h-3.5 w-3.5 flex-shrink-0 text-slate-600" />
            )}
            <span
              className={clsx(
                'text-[10px] font-semibold uppercase tracking-wider',
                side.sideIndex === match.winnerSideIndex ? 'text-emerald-300' : 'text-slate-500',
              )}
            >
              Team {side.sideIndex + 1}
            </span>
          </div>
          <SidePlayers
            side={side}
            isWinner={side.sideIndex === match.winnerSideIndex}
            highlightPlayerId={highlightPlayerId}
            totalPlayersForRank={totalPlayersForRank}
          />
        </div>
      ))}
    </div>
  );
}

function SidePlayers({
  side,
  isWinner,
  highlightPlayerId,
  totalPlayersForRank,
}: {
  side: MatchSideView;
  isWinner: boolean;
  highlightPlayerId?: number;
  totalPlayersForRank?: number;
}) {
  const players = getSortedSidePlayers(side);

  return (
    <ul className="space-y-1.5">
      {players.map((entry) => {
        const isHighlighted = highlightPlayerId !== undefined && entry.id === highlightPlayerId;
        const canShowEntryRank =
          typeof totalPlayersForRank === 'number' &&
          totalPlayersForRank > 0 &&
          typeof entry.rankBefore === 'number';

        return (
          <li
            key={entry.id}
            className={clsx(
              'flex items-center justify-between gap-2 rounded-md px-2 py-1',
              isHighlighted && 'bg-fuchsia-500/15 ring-1 ring-fuchsia-400/40',
            )}
          >
            <div className="flex min-w-0 items-center gap-1.5">
              <Link
                to={`/players/${entry.id}`}
                className={clsx(
                  'min-w-0 truncate text-sm transition-colors',
                  isHighlighted
                    ? 'font-semibold text-fuchsia-300 hover:text-fuchsia-200'
                    : isWinner
                      ? 'text-slate-200 hover:text-violet-300'
                      : 'text-slate-400 hover:text-violet-300',
                )}
              >
                {entry.name}
              </Link>
              {canShowEntryRank && (
                <RankTierBadge
                  rankPosition={entry.rankBefore!}
                  totalPlayers={totalPlayersForRank!}
                  compact
                  className="shrink-0"
                />
              )}
            </div>
            {typeof entry.ratingBefore === 'number' && (
              <span
                className={clsx(
                  'text-[10px] font-mono',
                  isHighlighted ? 'text-fuchsia-200/90' : 'text-slate-500',
                )}
              >
                {entry.ratingBefore.toFixed(1)}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
