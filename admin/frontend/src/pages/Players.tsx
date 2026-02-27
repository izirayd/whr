import { useEffect, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, ChevronRight, Loader2 } from 'lucide-react';
import { api } from '../api/client';
import { useDebounce } from '../hooks/useDebounce';
import Pagination from '../components/Pagination';
import RankTierBadge from '../components/RankTierBadge';
import type { PlayerListItem, RatingScope } from '../types';

const PAGE_SIZE = 25;
const RATING_SCOPES: Array<{ value: RatingScope; label: string }> = [
  { value: 'duel', label: '1v1' },
  { value: 'team_small', label: 'Small Team (<=4v4)' },
  { value: 'team_large', label: 'Large Team (5v5+)' },
  { value: 'ffa', label: 'FFA' },
];

function parseScope(raw: string | null): RatingScope {
  if (raw === 'team_small' || raw === 'team_large' || raw === 'ffa') return raw;
  return 'duel';
}

function parseLatestRunOnly(raw: string | null): boolean {
  if (raw === null) return true;
  if (raw === '0' || raw.toLowerCase() === 'false' || raw.toLowerCase() === 'no') return false;
  return true;
}

export default function Players() {
  const [searchParams, setSearchParams] = useSearchParams();
  const pageParam = Number(searchParams.get('page')) || 1;
  const searchParam = searchParams.get('search') || '';
  const scopeParam = parseScope(searchParams.get('scope'));
  const latestRunOnlyParam = parseLatestRunOnly(searchParams.get('latestRunOnly'));

  const [search, setSearch] = useState(searchParam);
  const [players, setPlayers] = useState<PlayerListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [latestRunId, setLatestRunId] = useState<number | null>(null);
  const [page, setPage] = useState(pageParam);
  const [scope, setScope] = useState<RatingScope>(scopeParam);
  const [latestRunOnly, setLatestRunOnly] = useState(latestRunOnlyParam);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const debouncedSearch = useDebounce(search, 300);

  const loadPlayers = useCallback(async (p: number, q: string, selectedScope: RatingScope, latestOnly: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.players(p, PAGE_SIZE, q, selectedScope, latestOnly);
      setPlayers(data.items);
      setTotal(data.total);
      setLatestRunId(data.latestRunId);
      setPage(data.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const newPage = debouncedSearch !== searchParam ? 1 : page;
    loadPlayers(newPage, debouncedSearch, scope, latestRunOnly);

    const params = new URLSearchParams();
    if (newPage > 1) params.set('page', String(newPage));
    if (debouncedSearch) params.set('search', debouncedSearch);
    params.set('scope', scope);
    if (!latestRunOnly) params.set('latestRunOnly', '0');
    setSearchParams(params, { replace: true });
  }, [debouncedSearch, page, scope, latestRunOnly]);

  function handlePageChange(newPage: number) {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Leaderboard</h1>
          <p className="text-sm text-slate-400 mt-1">
            {total.toLocaleString()} players{' '}
            {latestRunOnly ? `in latest recalculation${latestRunId !== null ? ` (run #${latestRunId})` : ''}` : 'overall'} ranked by{' '}
            {RATING_SCOPES.find((item) => item.value === scope)?.label || '1v1'} rating
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setLatestRunOnly((prev) => !prev); setPage(1); }}
            className="btn-ghost text-xs"
          >
            {latestRunOnly ? 'Latest run only: ON' : 'Latest run only: OFF'}
          </button>
          <select
            value={scope}
            onChange={(e) => { setScope(parseScope(e.target.value)); setPage(1); }}
            className="select-field w-auto min-w-[190px]"
          >
            {RATING_SCOPES.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          placeholder="Search by handle..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="input-field pl-10"
        />
        {loading && (
          <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 animate-spin" />
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="glass-card px-4 py-3 border-rose-500/30 bg-rose-500/5">
          <p className="text-sm text-rose-400">{error}</p>
        </div>
      )}

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700/40">
              <th className="text-left text-[11px] uppercase tracking-wider text-slate-500 font-semibold px-5 py-3 w-16">
                Rank
              </th>
              <th className="text-left text-[11px] uppercase tracking-wider text-slate-500 font-semibold px-5 py-3">
                Player
              </th>
              <th className="text-right text-[11px] uppercase tracking-wider text-slate-500 font-semibold px-5 py-3 w-32">
                Rating
              </th>
              <th className="text-right text-[11px] uppercase tracking-wider text-slate-500 font-semibold px-5 py-3 w-32">
                Uncertainty
              </th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/20">
            {!loading && players.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-12 text-slate-500 text-sm">
                  {search ? 'No players match your search' : 'No players found'}
                </td>
              </tr>
            )}
            {players.map((player, i) => {
              const rank = (page - 1) * PAGE_SIZE + i + 1;
              return (
                <tr
                  key={player.id}
                  className="group hover:bg-slate-800/40 transition-colors"
                >
                  <td className="px-5 py-3">
                    <RankTierBadge
                      rankPosition={rank}
                      totalPlayers={total}
                      showRank
                    />
                  </td>
                  <td className="px-5 py-3">
                    <Link
                      to={`/players/${player.id}`}
                      className="text-sm font-medium text-slate-200 hover:text-violet-300 transition-colors"
                    >
                      {player.handle}
                    </Link>
                    <p className="text-[11px] text-slate-600 font-mono">ID: {player.id}</p>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span className="text-sm font-mono font-semibold text-white">
                      {player.ratingElo.toFixed(1)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span className="text-sm font-mono text-slate-400">
                      &plusmn;{player.sigmaElo.toFixed(1)}
                    </span>
                  </td>
                  <td className="pr-3">
                    <Link to={`/players/${player.id}`}>
                      <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={handlePageChange} />
    </div>
  );
}
