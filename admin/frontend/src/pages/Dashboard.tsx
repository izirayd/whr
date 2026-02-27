import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  Users,
  Swords,
  TrendingUp,
  Clock,
  ArrowRight,
} from 'lucide-react';
import clsx from 'clsx';
import { api } from '../api/client';
import RankTierBadge from '../components/RankTierBadge';
import type { HealthResponse, PlayerListItem } from '../types';

interface DashboardState {
  health: HealthResponse | null;
  totalPlayers: number;
  totalMatches: number;
  topPlayers: PlayerListItem[];
  loading: boolean;
  error: string | null;
}

export default function Dashboard() {
  const [state, setState] = useState<DashboardState>({
    health: null,
    totalPlayers: 0,
    totalMatches: 0,
    topPlayers: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [health, players, matches] = await Promise.all([
          api.health(),
          api.players(1, 5),
          api.matches({ page: 1, pageSize: 1 }),
        ]);

        if (!cancelled) {
          setState({
            health,
            totalPlayers: players.total,
            totalMatches: matches.total,
            topPlayers: players.items,
            loading: false,
            error: null,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setState((s) => ({
            ...s,
            loading: false,
            error: err instanceof Error ? err.message : 'Connection failed',
          }));
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  if (state.loading) return <LoadingState />;

  if (state.error) {
    return (
      <div className="space-y-6">
        <PageHeader />
        <div className="glass-card p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center mx-auto mb-4">
            <Activity className="w-6 h-6 text-rose-400" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">Connection Error</h3>
          <p className="text-sm text-slate-400 mb-4">{state.error}</p>
          <p className="text-xs text-slate-500">
            Make sure the backend is running at <code className="font-mono text-slate-400">localhost:3001</code>
          </p>
        </div>
      </div>
    );
  }

  const { health, totalPlayers, totalMatches, topPlayers } = state;

  return (
    <div className="space-y-6">
      <PageHeader />

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Activity}
          label="System Status"
          value={health?.ok ? 'Online' : 'Offline'}
          color={health?.ok ? 'emerald' : 'rose'}
          pulse={health?.ok}
        />
        <StatCard
          icon={Users}
          label="Total Players"
          value={totalPlayers.toLocaleString()}
          color="violet"
        />
        <StatCard
          icon={Swords}
          label="Total Matches"
          value={totalMatches.toLocaleString()}
          color="sky"
        />
        <StatCard
          icon={Clock}
          label="Last Snapshot"
          value={health?.latestSnapshotAt || 'N/A'}
          color="amber"
          small
        />
      </div>

      {/* Top Players */}
      <div className="glass-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/40">
          <div className="flex items-center gap-2.5">
            <TrendingUp className="w-4 h-4 text-violet-400" />
            <h2 className="text-sm font-semibold text-slate-200">Top Rated Players</h2>
          </div>
          <Link
            to="/players"
            className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
          >
            View all <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="divide-y divide-slate-700/30">
          {topPlayers.map((player, i) => (
            <Link
              key={player.id}
              to={`/players/${player.id}`}
              className="flex items-center gap-4 px-5 py-3 hover:bg-slate-800/40 transition-colors"
            >
              <RankTierBadge rankPosition={i + 1} totalPlayers={totalPlayers} showRank compact />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-200 truncate">
                  {player.handle}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-mono font-semibold text-white">
                  {player.ratingElo.toFixed(1)}
                </p>
                <p className="text-[10px] font-mono text-slate-500">
                  &sigma; {player.sigmaElo.toFixed(1)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function PageHeader() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-white tracking-tight">Dashboard</h1>
      <p className="text-sm text-slate-400 mt-1">WHR system overview and quick stats</p>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  pulse,
  small,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  color: string;
  pulse?: boolean;
  small?: boolean;
}) {
  const colorMap: Record<string, { bg: string; text: string; dot: string; shadow: string }> = {
    emerald: {
      bg: 'bg-emerald-500/10',
      text: 'text-emerald-400',
      dot: 'bg-emerald-400',
      shadow: 'shadow-emerald-500/5',
    },
    rose: {
      bg: 'bg-rose-500/10',
      text: 'text-rose-400',
      dot: 'bg-rose-400',
      shadow: 'shadow-rose-500/5',
    },
    violet: {
      bg: 'bg-violet-500/10',
      text: 'text-violet-400',
      dot: 'bg-violet-400',
      shadow: 'shadow-violet-500/5',
    },
    sky: {
      bg: 'bg-sky-500/10',
      text: 'text-sky-400',
      dot: 'bg-sky-400',
      shadow: 'shadow-sky-500/5',
    },
    amber: {
      bg: 'bg-amber-500/10',
      text: 'text-amber-400',
      dot: 'bg-amber-400',
      shadow: 'shadow-amber-500/5',
    },
  };

  const c = colorMap[color] || colorMap.violet;

  return (
    <div className={clsx('glass-card p-4 hover:shadow-lg transition-shadow', c.shadow)}>
      <div className="flex items-center gap-3 mb-3">
        <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center', c.bg)}>
          <Icon className={clsx('w-4 h-4', c.text)} />
        </div>
        {pulse && (
          <span className="relative flex h-2.5 w-2.5 ml-auto">
            <span className={clsx('animate-ping absolute inline-flex h-full w-full rounded-full opacity-60', c.dot)} />
            <span className={clsx('relative inline-flex rounded-full h-2.5 w-2.5', c.dot)} />
          </span>
        )}
      </div>
      <p className="text-[11px] text-slate-500 uppercase tracking-wide font-medium mb-1">
        {label}
      </p>
      <p className={clsx(small ? 'text-sm font-medium font-mono text-slate-200 truncate' : 'stat-value text-white')}>
        {value}
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-6">
      <PageHeader />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="glass-card p-4 animate-pulse">
            <div className="w-8 h-8 rounded-lg bg-slate-700/50 mb-3" />
            <div className="h-3 w-20 bg-slate-700/50 rounded mb-2" />
            <div className="h-6 w-16 bg-slate-700/50 rounded" />
          </div>
        ))}
      </div>
      <div className="glass-card p-6 animate-pulse">
        <div className="h-4 w-40 bg-slate-700/50 rounded mb-4" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 bg-slate-700/30 rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}
