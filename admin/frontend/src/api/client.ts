import type {
  CreateDuelPayload,
  CreateDuelResponse,
  HealthResponse,
  MatchMode,
  PaginatedMatches,
  PaginatedPlayers,
  PlayerProfile,
  RecalcLaunchOptions,
  RatingScope,
  RecalcJob,
} from '../types';

const BASE = '/api';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  health(): Promise<HealthResponse> {
    return fetchJson(`${BASE}/health`);
  },

  players(
    page = 1,
    pageSize = 25,
    search = '',
    scope: RatingScope = 'duel',
    latestRunOnly = true,
  ): Promise<PaginatedPlayers> {
    const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search) p.set('search', search);
    p.set('scope', scope);
    p.set('latestRunOnly', latestRunOnly ? '1' : '0');
    return fetchJson(`${BASE}/players?${p}`);
  },

  player(
    id: number,
    historyLimit = 500,
    matchesLimit = 50,
    scope: RatingScope = 'duel',
  ): Promise<PlayerProfile> {
    const p = new URLSearchParams({
      historyLimit: String(historyLimit),
      matchesLimit: String(matchesLimit),
      scope,
    });
    return fetchJson(`${BASE}/players/${id}?${p}`);
  },

  matches(opts: {
    page?: number;
    pageSize?: number;
    mode?: MatchMode;
    playerId?: number;
    latestRunOnly?: boolean;
  } = {}): Promise<PaginatedMatches> {
    const p = new URLSearchParams();
    if (opts.page) p.set('page', String(opts.page));
    if (opts.pageSize) p.set('pageSize', String(opts.pageSize));
    if (opts.mode) p.set('mode', opts.mode);
    if (opts.playerId) p.set('playerId', String(opts.playerId));
    if (opts.latestRunOnly !== undefined) {
      p.set('latestRunOnly', opts.latestRunOnly ? '1' : '0');
    }
    return fetchJson(`${BASE}/matches?${p}`);
  },

  recalculate(options: RecalcLaunchOptions = {}): Promise<{
    job: RecalcJob;
    executable: string | null;
    launchOptions: RecalcLaunchOptions;
    alreadyRunning?: boolean;
  }> {
    return fetchJson(`${BASE}/admin/recalculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
  },

  recalcJob(jobId: number): Promise<RecalcJob> {
    return fetchJson(`${BASE}/admin/recalculate/${jobId}`);
  },

  createDuel(payload: CreateDuelPayload): Promise<CreateDuelResponse> {
    return fetchJson(`${BASE}/admin/duels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },
};
