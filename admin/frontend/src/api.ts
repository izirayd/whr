import type {
  PlayersPayload,
  PlayerProfile,
  MatchesPayload,
  MatchMode,
  RecalcJob,
  HealthPayload,
} from "./types";

async function apiGet<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return (await response.json()) as T;
}

async function apiPost<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

export const api = {
  health(): Promise<HealthPayload> {
    return apiGet("/api/health");
  },

  getPlayers(page: number, pageSize: number, search: string): Promise<PlayersPayload> {
    return apiGet(
      `/api/players?page=${page}&pageSize=${pageSize}&search=${encodeURIComponent(search)}`
    );
  },

  getPlayerProfile(
    playerId: number,
    historyLimit = 400,
    matchesLimit = 40
  ): Promise<PlayerProfile> {
    return apiGet(
      `/api/players/${playerId}?historyLimit=${historyLimit}&matchesLimit=${matchesLimit}`
    );
  },

  getMatches(page: number, pageSize: number, mode?: MatchMode): Promise<MatchesPayload> {
    const modeParam = mode ? `&mode=${mode}` : "";
    return apiGet(`/api/matches?page=${page}&pageSize=${pageSize}${modeParam}`);
  },

  startRecalculation(): Promise<{ job: RecalcJob }> {
    return apiPost("/api/admin/recalculate");
  },

  getRecalcJob(jobId: number): Promise<RecalcJob> {
    return apiGet(`/api/admin/recalculate/${jobId}`);
  },
};

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
