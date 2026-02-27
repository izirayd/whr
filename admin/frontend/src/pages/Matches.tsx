import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Filter, Loader2 } from 'lucide-react';
import { api } from '../api/client';
import MatchCard from '../components/MatchCard';
import Pagination from '../components/Pagination';
import type { MatchMode, MatchView } from '../types';

const PAGE_SIZE = 30;
const MODES: { value: string; label: string }[] = [
  { value: '', label: 'All Modes' },
  { value: 'duel', label: '1v1' },
  { value: 'team_small', label: 'Small Team (<=4v4)' },
  { value: 'team_large', label: 'Large Team (5v5+)' },
  { value: 'ffa', label: 'FFA' },
];

function parseMode(raw: string | null): MatchMode | '' {
  if (raw === 'duel' || raw === 'team_small' || raw === 'team_large' || raw === 'ffa') return raw;
  return '';
}

function parseLatestRunOnly(raw: string | null): boolean {
  if (raw === null) return true;
  if (raw === '0' || raw.toLowerCase() === 'false' || raw.toLowerCase() === 'no') return false;
  return true;
}

export default function Matches() {
  const [searchParams, setSearchParams] = useSearchParams();
  const pageParam = Number(searchParams.get('page')) || 1;
  const modeParam = parseMode(searchParams.get('mode'));
  const playerIdParam = searchParams.get('playerId') || '';
  const latestRunOnlyParam = parseLatestRunOnly(searchParams.get('latestRunOnly'));

  const [matches, setMatches] = useState<MatchView[]>([]);
  const [total, setTotal] = useState(0);
  const [latestRunId, setLatestRunId] = useState<number | null>(null);
  const [page, setPage] = useState(pageParam);
  const [mode, setMode] = useState<string>(modeParam);
  const [playerIdInput, setPlayerIdInput] = useState(playerIdParam);
  const [latestRunOnly, setLatestRunOnly] = useState(latestRunOnlyParam);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMatches = useCallback(async (p: number, m: string, pid: string, latestOnly: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const opts: Parameters<typeof api.matches>[0] = {
        page: p,
        pageSize: PAGE_SIZE,
        latestRunOnly: latestOnly,
      };
      if (m) opts.mode = m as MatchMode;
      const pidNum = Number(pid);
      if (pidNum > 0) opts.playerId = pidNum;

      const data = await api.matches(opts);
      setMatches(data.items);
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
    loadMatches(page, mode, playerIdInput, latestRunOnly);

    const params = new URLSearchParams();
    if (page > 1) params.set('page', String(page));
    if (mode) params.set('mode', mode);
    if (playerIdInput) params.set('playerId', playerIdInput);
    if (!latestRunOnly) params.set('latestRunOnly', '0');
    setSearchParams(params, { replace: true });
  }, [page, mode, playerIdInput, latestRunOnly]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Matches</h1>
        <p className="text-sm text-slate-400 mt-1">
          {latestRunOnly
            ? `${total.toLocaleString()} matches in latest recalculation${
              latestRunId !== null ? ` (run #${latestRunId})` : ''
            }`
            : `${total.toLocaleString()} matches recorded`}
        </p>
      </div>

      {/* Filters */}
      <div className="glass-card px-4 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <Filter className="w-4 h-4 text-slate-500 flex-shrink-0" />

          <select
            value={mode}
            onChange={(e) => { setMode(e.target.value); setPage(1); }}
            className="select-field w-auto min-w-[130px]"
          >
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Player ID..."
            value={playerIdInput}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, '');
              setPlayerIdInput(val);
              setPage(1);
            }}
            className="input-field w-auto max-w-[150px]"
          />

          <button
            onClick={() => { setLatestRunOnly((prev) => !prev); setPage(1); }}
            className="btn-ghost text-xs"
          >
            {latestRunOnly ? 'Latest run only: ON' : 'Latest run only: OFF'}
          </button>

          {(mode || playerIdInput) && (
            <button
              onClick={() => { setMode(''); setPlayerIdInput(''); setPage(1); }}
              className="btn-ghost text-xs"
            >
              Clear filters
            </button>
          )}

          {loading && <Loader2 className="w-4 h-4 text-slate-500 animate-spin ml-auto" />}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="glass-card px-4 py-3 border-rose-500/30 bg-rose-500/5">
          <p className="text-sm text-rose-400">{error}</p>
        </div>
      )}

      {/* Match list */}
      {!loading && matches.length === 0 ? (
        <div className="glass-card p-12 text-center text-slate-500 text-sm">
          No matches found with current filters
        </div>
      ) : (
        <div className="space-y-2">
          {matches.map((match) => (
            <MatchCard key={match.id} match={match} />
          ))}
        </div>
      )}

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
    </div>
  );
}
