import { useEffect, useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Swords,
  Loader2,
  Hash,
} from 'lucide-react';
import { api } from '../api/client';
import RatingChart from '../components/RatingChart';
import MatchCard from '../components/MatchCard';
import RankTierBadge from '../components/RankTierBadge';
import type { PlayerProfile as PlayerProfileType, RatingScope } from '../types';

const RATING_SCOPES: Array<{ value: RatingScope; label: string }> = [
  { value: 'duel', label: '1v1' },
  { value: 'team_small', label: 'Small Team' },
  { value: 'team_large', label: 'Large Team' },
  { value: 'ffa', label: 'FFA' },
];
const ALL_MATCHES_LIMIT = 1000000;

function parseScope(raw: string | null): RatingScope {
  if (raw === 'team_small' || raw === 'team_large' || raw === 'ffa') return raw;
  return 'duel';
}

export default function PlayerProfile() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const scope = parseScope(searchParams.get('scope'));
  const [profile, setProfile] = useState<PlayerProfileType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const playerId = Number(id);

    if (!playerId || playerId <= 0) {
      setError('Invalid player ID');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    api.player(playerId, 500, ALL_MATCHES_LIMIT, scope).then((data) => {
      if (!cancelled) {
        setProfile(data);
        setLoading(false);
      }
    }).catch((err) => {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : 'Failed to load');
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [id, scope]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="glass-card p-8 text-center">
          <h3 className="text-lg font-semibold text-white mb-2">Player Not Found</h3>
          <p className="text-sm text-slate-400">{error || 'Could not load player profile'}</p>
        </div>
      </div>
    );
  }

  const {
    player,
    ratingHistory,
    recentMatches,
    selectedScope,
    scopeTotalPlayers,
    scopeRankPosition,
  } = profile;
  const selectedRating = player.ratings[selectedScope];

  // Calculate stats from history
  const latestRating = ratingHistory.length > 0 ? ratingHistory[ratingHistory.length - 1] : null;
  const prevRating = ratingHistory.length > 1 ? ratingHistory[ratingHistory.length - 2] : null;
  const ratingDelta = latestRating && prevRating
    ? latestRating.ratingElo - prevRating.ratingElo
    : null;
  const wins = recentMatches.filter(
    (m) => m.playerSideIndex !== undefined && m.playerSideIndex === m.winnerSideIndex,
  ).length;
  const losses = recentMatches.filter(
    (m) => m.playerSideIndex !== undefined && m.playerSideIndex !== m.winnerSideIndex,
  ).length;

  function handleScopeChange(nextScope: RatingScope) {
    const next = new URLSearchParams(searchParams);
    next.set('scope', nextScope);
    setSearchParams(next, { replace: true });
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <BackLink />

      {/* Player header */}
      <div className="glass-card p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {/* Avatar placeholder */}
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20 flex-shrink-0">
            <span className="text-xl font-bold text-white">
              {player.handle.charAt(0).toUpperCase()}
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-white truncate">{player.handle}</h1>
            <p className="text-xs text-slate-500 font-mono flex items-center gap-1 mt-0.5">
              <Hash className="w-3 h-3" />
              {player.id}
            </p>
            {typeof scopeRankPosition === 'number' &&
              typeof scopeTotalPlayers === 'number' &&
              scopeTotalPlayers > 0 && (
                <div className="mt-2">
                  <RankTierBadge
                    rankPosition={scopeRankPosition}
                    totalPlayers={scopeTotalPlayers}
                    showRank
                    showPercent
                  />
                </div>
              )}
          </div>

          <select
            value={selectedScope}
            onChange={(e) => handleScopeChange(parseScope(e.target.value))}
            className="select-field w-auto min-w-[150px]"
          >
            {RATING_SCOPES.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>

          {/* Rating stats */}
          <div className="flex gap-6">
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Rating</p>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold font-mono text-white">
                  {selectedRating.ratingElo.toFixed(1)}
                </span>
                {ratingDelta !== null && (
                  <span className={`flex items-center gap-0.5 text-xs font-mono font-medium ${
                    ratingDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {ratingDelta >= 0 ? (
                      <TrendingUp className="w-3.5 h-3.5" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5" />
                    )}
                    {ratingDelta >= 0 ? '+' : ''}
                    {ratingDelta.toFixed(1)}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Sigma</p>
              <span className="text-2xl font-bold font-mono text-slate-400">
                &plusmn;{selectedRating.sigmaElo.toFixed(1)}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-2">
          {RATING_SCOPES.map((item) => {
            const isActive = item.value === selectedScope;
            const value = player.ratings[item.value];
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => handleScopeChange(item.value)}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                  isActive
                    ? 'border-violet-500/60 bg-violet-500/10'
                    : 'border-slate-700/50 bg-slate-900/40 hover:border-slate-600/70'
                }`}
              >
                <p className={`text-[10px] uppercase tracking-wider ${
                  isActive ? 'text-violet-300' : 'text-slate-500'
                }`}>
                  {item.label}
                </p>
                <p className="text-sm font-mono font-semibold text-white mt-0.5">
                  {value.ratingElo.toFixed(1)}
                </p>
                <p className="text-[10px] font-mono text-slate-500">
                  &plusmn;{value.sigmaElo.toFixed(1)}
                </p>
              </button>
            );
          })}
        </div>

        {/* Win/Loss bar */}
        {(wins + losses) > 0 && (
          <div className="mt-5 pt-4 border-t border-slate-700/40">
            <div className="flex items-center gap-4 text-xs">
              <span className="text-emerald-400 font-medium">{wins}W</span>
              <div className="flex-1 h-1.5 rounded-full bg-slate-700/50 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-500"
                  style={{ width: `${(wins / (wins + losses)) * 100}%` }}
                />
              </div>
              <span className="text-rose-400 font-medium">{losses}L</span>
            </div>
          </div>
        )}
      </div>

      {/* Rating Chart */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <BarChart3 className="w-4 h-4 text-violet-400" />
          <h2 className="text-sm font-semibold text-slate-200">
            Rating History ({RATING_SCOPES.find((item) => item.value === selectedScope)?.label || '1v1'})
          </h2>
          <span className="text-[10px] text-slate-600 font-mono ml-auto">
            {ratingHistory.length} data points
          </span>
        </div>
        <RatingChart data={ratingHistory} />
      </div>

      {/* Recent Matches */}
      <div className="space-y-3">
        <div className="flex items-center gap-2.5 px-1">
          <Swords className="w-4 h-4 text-violet-400" />
          <h2 className="text-sm font-semibold text-slate-200">Recent Matches</h2>
          <span className="text-[10px] text-slate-600 font-mono ml-auto">
            {recentMatches.length} matches
          </span>
        </div>

        {recentMatches.length === 0 ? (
          <div className="glass-card p-8 text-center text-slate-500 text-sm">
            No matches found
          </div>
        ) : (
          <div className="space-y-2">
            {recentMatches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                highlightPlayerId={player.id}
                totalPlayersForRank={scopeTotalPlayers}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/players"
      className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-violet-300 transition-colors"
    >
      <ArrowLeft className="w-4 h-4" />
      Back to Leaderboard
    </Link>
  );
}
