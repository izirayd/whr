import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  Zap,
  Play,
  Swords,
} from 'lucide-react';
import clsx from 'clsx';
import { api } from '../api/client';
import type { PlayerListItem, RecalcJob, RecalcLaunchOptions } from '../types';

type JobState = 'idle' | 'starting' | 'polling' | 'done' | 'error';

const MAX_DUEL_PLAYER_OPTIONS = 2000;
const MAX_DUEL_VISIBLE_OPTIONS = 300;

function parseNonNegativeNumber(raw: string, label: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number`);
  }
  return value;
}

function parsePositiveNumber(raw: string, label: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
  return value;
}

function parseOptionalNonNegativeNumber(raw: string, label: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number`);
  }
  return value;
}

function parseOptionalPositiveInteger(raw: string, label: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}

function parseOptionalNonNegativeInteger(raw: string, label: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value;
}

function formatPlayerOption(player: PlayerListItem): string {
  return `${player.handle} (#${player.id})`;
}

export default function Admin() {
  const [jobState, setJobState] = useState<JobState>('idle');
  const [job, setJob] = useState<RecalcJob | null>(null);
  const [executable, setExecutable] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeOptions, setActiveOptions] = useState<RecalcLaunchOptions | null>(null);
  const [duelW2EloInput, setDuelW2EloInput] = useState('70');
  const [teamSmallW2EloInput, setTeamSmallW2EloInput] = useState('');
  const [teamLargeW2EloInput, setTeamLargeW2EloInput] = useState('');
  const [duelPriorGamesInput, setDuelPriorGamesInput] = useState('3');
  const [duelMaxStepEloInput, setDuelMaxStepEloInput] = useState('500');
  const [optimizeIntervalInput, setOptimizeIntervalInput] = useState('0');
  const [finalOptimizeIterationsInput, setFinalOptimizeIterationsInput] = useState('8');
  const [playersLimitInput, setPlayersLimitInput] = useState('');
  const [matchesLimitInput, setMatchesLimitInput] = useState('');

  const [duelPlayers, setDuelPlayers] = useState<PlayerListItem[]>([]);
  const [duelSearchInput, setDuelSearchInput] = useState('');
  const [duelPlayerAIdInput, setDuelPlayerAIdInput] = useState('');
  const [duelPlayerBIdInput, setDuelPlayerBIdInput] = useState('');
  const [duelWinnerSlot, setDuelWinnerSlot] = useState<'A' | 'B'>('A');
  const [duelPlayedAtInput, setDuelPlayedAtInput] = useState('');
  const [duelInfoMsg, setDuelInfoMsg] = useState<string | null>(null);
  const [isLoadingDuelPlayers, setIsLoadingDuelPlayers] = useState(true);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  useEffect(() => {
    let cancelled = false;

    const loadDuelPlayers = async () => {
      setIsLoadingDuelPlayers(true);
      try {
        const pageSize = 200;
        let page = 1;
        let total = 0;
        const collected: PlayerListItem[] = [];

        do {
          const response = await api.players(page, pageSize, '', 'duel', false);
          collected.push(...response.items);
          total = response.total;
          page += 1;
        } while (collected.length < total && collected.length < MAX_DUEL_PLAYER_OPTIONS);

        if (!cancelled) {
          setDuelPlayers(collected);
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : 'Failed to load players for manual duel');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingDuelPlayers(false);
        }
      }
    };

    loadDuelPlayers();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (duelPlayers.length === 0) return;
    setDuelPlayerAIdInput((current) => current || String(duelPlayers[0].id));
    setDuelPlayerBIdInput((current) => {
      if (current) return current;
      const fallback = duelPlayers.find((player) => player.id !== duelPlayers[0].id);
      return fallback ? String(fallback.id) : '';
    });
  }, [duelPlayers]);

  const duelPlayerById = useMemo(() => {
    const map = new Map<number, PlayerListItem>();
    for (const player of duelPlayers) {
      map.set(player.id, player);
    }
    return map;
  }, [duelPlayers]);

  const duelOptions = useMemo(() => {
    const needle = duelSearchInput.trim().toLowerCase();
    const filtered = needle
      ? duelPlayers.filter(
          (player) =>
            player.handle.toLowerCase().includes(needle) || String(player.id).includes(needle),
        )
      : duelPlayers;

    const byId = new Map<number, PlayerListItem>();
    for (const player of filtered.slice(0, MAX_DUEL_VISIBLE_OPTIONS)) {
      byId.set(player.id, player);
    }

    const selectedIds = [Number(duelPlayerAIdInput), Number(duelPlayerBIdInput)].filter(
      (id) => Number.isFinite(id) && id > 0,
    );
    for (const id of selectedIds) {
      const player = duelPlayerById.get(id);
      if (player) {
        byId.set(player.id, player);
      }
    }

    return [...byId.values()];
  }, [duelPlayerAIdInput, duelPlayerBIdInput, duelPlayerById, duelPlayers, duelSearchInput]);

  const selectedPlayerA = duelPlayerById.get(Number(duelPlayerAIdInput));
  const selectedPlayerB = duelPlayerById.get(Number(duelPlayerBIdInput));
  const isActionRunning = jobState === 'starting' || jobState === 'polling';

  const buildLaunchOptions = useCallback((): RecalcLaunchOptions => {
    const teamSmallW2Elo = parseOptionalNonNegativeNumber(teamSmallW2EloInput, 'Team small w2_elo');
    const teamLargeW2Elo = parseOptionalNonNegativeNumber(teamLargeW2EloInput, 'Team large w2_elo');
    const launchOptions: RecalcLaunchOptions = {
      duelW2Elo: parseNonNegativeNumber(duelW2EloInput, 'Duel w2_elo'),
      duelPriorGames: parseNonNegativeNumber(duelPriorGamesInput, 'Duel prior_games'),
      duelMaxStepElo: parsePositiveNumber(duelMaxStepEloInput, 'Duel max step Elo'),
    };
    const optimizeInterval = parseOptionalNonNegativeInteger(
      optimizeIntervalInput,
      'Optimize interval',
    );
    const finalOptimizeIterations = parseOptionalNonNegativeInteger(
      finalOptimizeIterationsInput,
      'Final optimize iterations',
    );
    if (optimizeInterval !== undefined) launchOptions.optimizeInterval = optimizeInterval;
    if (finalOptimizeIterations !== undefined) {
      launchOptions.finalOptimizeIterations = finalOptimizeIterations;
    }
    if (teamSmallW2Elo !== undefined) launchOptions.teamSmallW2Elo = teamSmallW2Elo;
    if (teamLargeW2Elo !== undefined) launchOptions.teamLargeW2Elo = teamLargeW2Elo;
    const playersLimit = parseOptionalPositiveInteger(playersLimitInput, 'Players limit');
    const matchesLimit = parseOptionalPositiveInteger(matchesLimitInput, 'Matches limit');
    if (playersLimit !== undefined) launchOptions.playersLimit = playersLimit;
    if (matchesLimit !== undefined) launchOptions.matchesLimit = matchesLimit;
    return launchOptions;
  }, [
    duelW2EloInput,
    teamSmallW2EloInput,
    teamLargeW2EloInput,
    duelPriorGamesInput,
    duelMaxStepEloInput,
    optimizeIntervalInput,
    finalOptimizeIterationsInput,
    playersLimitInput,
    matchesLimitInput,
  ]);

  const startPollingJob = useCallback(
    (jobId: number) => {
      setJobState('polling');
      let pollFailureCount = 0;
      stopPolling();

      pollRef.current = setInterval(async () => {
        try {
          const updated = await api.recalcJob(jobId);
          pollFailureCount = 0;
          setJob(updated);
          if (updated.status === 'success' || updated.status === 'failed') {
            stopPolling();
            setJobState('done');
          }
        } catch {
          pollFailureCount += 1;
          if (pollFailureCount >= 5) {
            stopPolling();
            setErrorMsg('Lost connection to backend while polling re-simulation status');
            setJobState('error');
          }
        }
      }, 2000);
    },
    [stopPolling],
  );

  const startRecalc = useCallback(async () => {
    let launchOptions: RecalcLaunchOptions;
    try {
      launchOptions = buildLaunchOptions();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid launch options');
      setJobState('error');
      return;
    }

    setJobState('starting');
    setErrorMsg(null);
    setDuelInfoMsg(null);
    setJob(null);
    setExecutable(null);
    setActiveOptions(null);
    stopPolling();

    try {
      const result = await api.recalculate(launchOptions);
      setJob(result.job);
      setExecutable(result.executable);
      setActiveOptions(result.alreadyRunning ? null : result.launchOptions);
      startPollingJob(result.job.id);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to start');
      setJobState('error');
    }
  }, [buildLaunchOptions, startPollingJob, stopPolling]);

  const startManualDuel = useCallback(async () => {
    const playerAId = Number(duelPlayerAIdInput);
    const playerBId = Number(duelPlayerBIdInput);
    if (!Number.isInteger(playerAId) || playerAId <= 0) {
      setErrorMsg('Player A is required');
      setJobState('error');
      return;
    }
    if (!Number.isInteger(playerBId) || playerBId <= 0) {
      setErrorMsg('Player B is required');
      setJobState('error');
      return;
    }
    if (playerAId === playerBId) {
      setErrorMsg('Select two different players');
      setJobState('error');
      return;
    }

    let playedAt: number | undefined;
    let launchOptions: RecalcLaunchOptions;
    try {
      playedAt = parseOptionalNonNegativeInteger(duelPlayedAtInput, 'playedAt');
      launchOptions = buildLaunchOptions();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid duel input');
      setJobState('error');
      return;
    }

    const winnerPlayerId = duelWinnerSlot === 'A' ? playerAId : playerBId;

    setJobState('starting');
    setErrorMsg(null);
    setDuelInfoMsg(null);
    setJob(null);
    setExecutable(null);
    setActiveOptions(null);
    stopPolling();

    try {
      const result = await api.createDuel({
        playerAId,
        playerBId,
        winnerPlayerId,
        playedAt,
        recalcOptions: launchOptions,
      });

      const winnerName =
        winnerPlayerId === playerAId
          ? selectedPlayerA?.handle ?? `#${playerAId}`
          : selectedPlayerB?.handle ?? `#${playerBId}`;
      setDuelInfoMsg(`Duel #${result.match.id} recorded, winner: ${winnerName}`);
      setJob(result.job);
      setExecutable(result.executable);
      setActiveOptions(result.launchOptions);
      startPollingJob(result.job.id);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create duel');
      setJobState('error');
    }
  }, [
    buildLaunchOptions,
    duelPlayedAtInput,
    duelPlayerAIdInput,
    duelPlayerBIdInput,
    duelWinnerSlot,
    selectedPlayerA?.handle,
    selectedPlayerB?.handle,
    startPollingJob,
    stopPolling,
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Admin</h1>
        <p className="text-sm text-slate-400 mt-1">System management and re-simulation</p>
      </div>

      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-lg bg-violet-500/15 flex items-center justify-center">
            <RefreshCw className="w-4.5 h-4.5 text-violet-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">WHR Re-simulation</h2>
            <p className="text-xs text-slate-500">
              Recalculate ratings for all matches or after a manual duel
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <label className="space-y-1.5">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Duel w2_elo</span>
            <input
              type="number"
              min={0}
              step="0.1"
              value={duelW2EloInput}
              onChange={(e) => setDuelW2EloInput(e.target.value)}
              className="input-field"
              disabled={isActionRunning}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Team small w2_elo</span>
            <input
              type="number"
              min={0}
              step="0.1"
              value={teamSmallW2EloInput}
              onChange={(e) => setTeamSmallW2EloInput(e.target.value)}
              placeholder="Default: duel w2_elo"
              className="input-field"
              disabled={isActionRunning}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Team large w2_elo</span>
            <input
              type="number"
              min={0}
              step="0.1"
              value={teamLargeW2EloInput}
              onChange={(e) => setTeamLargeW2EloInput(e.target.value)}
              placeholder="Default: duel w2_elo"
              className="input-field"
              disabled={isActionRunning}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Duel prior_games</span>
            <input
              type="number"
              min={0}
              step="0.1"
              value={duelPriorGamesInput}
              onChange={(e) => setDuelPriorGamesInput(e.target.value)}
              className="input-field"
              disabled={isActionRunning}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Duel max step elo</span>
            <input
              type="number"
              min={0.1}
              step="0.1"
              value={duelMaxStepEloInput}
              onChange={(e) => setDuelMaxStepEloInput(e.target.value)}
              className="input-field"
              disabled={isActionRunning}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">
              Optimize interval (simulate)
            </span>
            <input
              type="number"
              min={0}
              step={1}
              value={optimizeIntervalInput}
              onChange={(e) => setOptimizeIntervalInput(e.target.value)}
              placeholder="0 = disabled"
              className="input-field"
              disabled={isActionRunning}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">
              Final optimize iterations (simulate)
            </span>
            <input
              type="number"
              min={0}
              step={1}
              value={finalOptimizeIterationsInput}
              onChange={(e) => setFinalOptimizeIterationsInput(e.target.value)}
              placeholder="0 = disabled"
              className="input-field"
              disabled={isActionRunning}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Players limit</span>
            <input
              type="number"
              min={1}
              step={1}
              placeholder="All players"
              value={playersLimitInput}
              onChange={(e) => setPlayersLimitInput(e.target.value)}
              className="input-field"
              disabled={isActionRunning}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Matches limit</span>
            <input
              type="number"
              min={1}
              step={1}
              placeholder="All matches"
              value={matchesLimitInput}
              onChange={(e) => setMatchesLimitInput(e.target.value)}
              className="input-field"
              disabled={isActionRunning}
            />
          </label>
        </div>

        <button onClick={startRecalc} disabled={isActionRunning} className="btn-primary gap-2">
          {jobState === 'starting' ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Starting...
            </>
          ) : jobState === 'polling' ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Running...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Start Re-simulation
            </>
          )}
        </button>

        {executable && (
          <p className="text-[11px] text-slate-600 font-mono mt-3 break-all">
            <Zap className="w-3 h-3 inline mr-1 text-slate-500" />
            {executable}
          </p>
        )}
        {activeOptions && (
          <p className="text-[11px] text-slate-500 font-mono mt-2 break-all">
            {`duel_w2_elo=${activeOptions.duelW2Elo ?? 70}, team_small_w2_elo=${
              activeOptions.teamSmallW2Elo ?? activeOptions.duelW2Elo ?? 70
            }, team_large_w2_elo=${activeOptions.teamLargeW2Elo ?? activeOptions.duelW2Elo ?? 70}, duel_prior_games=${
              activeOptions.duelPriorGames ?? 3
            }, duel_max_step_elo=${activeOptions.duelMaxStepElo ?? 500}, optimize_interval=${
              activeOptions.optimizeInterval ?? 0
            }, final_optimize_iterations=${activeOptions.finalOptimizeIterations ?? 8}, players=${
              activeOptions.playersLimit ?? 'all'
            }, matches=${activeOptions.matchesLimit ?? 'all'}`}
          </p>
        )}
      </div>

      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-lg bg-sky-500/15 flex items-center justify-center">
            <Swords className="w-4.5 h-4.5 text-sky-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">Manual PvP Duel</h2>
            <p className="text-xs text-slate-500">
              Select two players, pick winner, then auto-run WHR recalculation
            </p>
          </div>
        </div>

        {isLoadingDuelPlayers ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading players...
          </div>
        ) : duelPlayers.length < 2 ? (
          <p className="text-sm text-rose-400">Need at least two players in DB to create a duel.</p>
        ) : (
          <div className="space-y-3">
            <label className="space-y-1.5 block">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">
                Filter players by handle/id
              </span>
              <input
                type="text"
                value={duelSearchInput}
                onChange={(e) => setDuelSearchInput(e.target.value)}
                placeholder="Type handle or ID..."
                className="input-field"
                disabled={isActionRunning}
              />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1.5">
                <span className="text-[10px] uppercase tracking-wider text-slate-500">Player A</span>
                <select
                  value={duelPlayerAIdInput}
                  onChange={(e) => setDuelPlayerAIdInput(e.target.value)}
                  className="select-field w-full"
                  disabled={isActionRunning}
                >
                  {duelOptions.map((player) => (
                    <option key={player.id} value={player.id}>
                      {formatPlayerOption(player)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="text-[10px] uppercase tracking-wider text-slate-500">Player B</span>
                <select
                  value={duelPlayerBIdInput}
                  onChange={(e) => setDuelPlayerBIdInput(e.target.value)}
                  className="select-field w-full"
                  disabled={isActionRunning}
                >
                  {duelOptions.map((player) => (
                    <option key={player.id} value={player.id}>
                      {formatPlayerOption(player)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1.5">
                <span className="text-[10px] uppercase tracking-wider text-slate-500">Winner</span>
                <select
                  value={duelWinnerSlot}
                  onChange={(e) => setDuelWinnerSlot(e.target.value === 'B' ? 'B' : 'A')}
                  className="select-field w-full"
                  disabled={isActionRunning}
                >
                  <option value="A">{selectedPlayerA ? `${selectedPlayerA.handle} wins` : 'Player A wins'}</option>
                  <option value="B">{selectedPlayerB ? `${selectedPlayerB.handle} wins` : 'Player B wins'}</option>
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="text-[10px] uppercase tracking-wider text-slate-500">
                  Match time (optional, integer)
                </span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={duelPlayedAtInput}
                  onChange={(e) => setDuelPlayedAtInput(e.target.value)}
                  placeholder="Auto: max(existing)+1"
                  className="input-field"
                  disabled={isActionRunning}
                />
              </label>
            </div>

            {duelOptions.length === MAX_DUEL_VISIBLE_OPTIONS && (
              <p className="text-[11px] text-slate-500">
                Showing first {MAX_DUEL_VISIBLE_OPTIONS} filtered options. Narrow search to find specific players.
              </p>
            )}

            <button
              onClick={startManualDuel}
              disabled={isActionRunning || duelOptions.length === 0}
              className="btn-primary gap-2"
            >
              <Swords className="w-4 h-4" />
              Record Duel and Recalculate
            </button>
          </div>
        )}
      </div>

      {duelInfoMsg && (
        <div className="glass-card px-5 py-4 border-emerald-500/30 bg-emerald-500/5">
          <p className="text-sm text-emerald-300">{duelInfoMsg}</p>
        </div>
      )}

      {errorMsg && (
        <div className="glass-card px-5 py-4 border-rose-500/30 bg-rose-500/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-rose-300 mb-1">Re-simulation Failed</h3>
              <p className="text-xs text-rose-400/80">{errorMsg}</p>
            </div>
          </div>
        </div>
      )}

      {job && <JobStatusCard job={job} state={jobState} />}
    </div>
  );
}

function JobStatusCard({ job, state }: { job: RecalcJob; state: JobState }) {
  const statusConfig: Record<string, {
    icon: typeof Clock;
    color: string;
    bg: string;
    label: string;
  }> = {
    queued: {
      icon: Clock,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
      label: 'Queued',
    },
    running: {
      icon: Loader2,
      color: 'text-sky-400',
      bg: 'bg-sky-500/10',
      label: 'Running',
    },
    success: {
      icon: CheckCircle2,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      label: 'Success',
    },
    failed: {
      icon: XCircle,
      color: 'text-rose-400',
      bg: 'bg-rose-500/10',
      label: 'Failed',
    },
  };

  const cfg = statusConfig[job.status] || statusConfig.queued;
  const StatusIcon = cfg.icon;

  return (
    <div className="glass-card overflow-hidden animate-slide-up">
      {/* Progress bar for running state */}
      {state === 'polling' && (
        <div className="h-0.5 bg-slate-700/50">
          <div className="h-full bg-gradient-to-r from-violet-500 via-sky-500 to-violet-500 animate-pulse w-full" />
        </div>
      )}

      <div className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center', cfg.bg)}>
            <StatusIcon
              className={clsx('w-4 h-4', cfg.color, job.status === 'running' && 'animate-spin')}
            />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">
              Job #{job.id}
            </h3>
            <span className={clsx('text-xs font-medium', cfg.color)}>
              {cfg.label}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <TimeField label="Requested" value={job.requestedAt} />
          <TimeField label="Started" value={job.startedAt} />
          <TimeField label="Finished" value={job.finishedAt} />
        </div>

        {job.message && (
          <div className="mt-3 px-3 py-2 rounded-lg bg-slate-900/60 border border-slate-700/30">
            <p className="text-xs text-slate-400 font-mono break-all">{job.message}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function TimeField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">{label}</p>
      <p className="text-xs font-mono text-slate-300">
        {value || <span className="text-slate-600">&mdash;</span>}
      </p>
    </div>
  );
}
