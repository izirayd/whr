import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Trophy,
  Target,
  TrendingUp,
  Activity,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { api } from "../api";
import type { PlayerProfile, MatchView } from "../types";

interface ChartPoint {
  time: number;
  rating: number;
  sigma: number;
  source: string;
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <div className="ct-row">
        <span className="ct-label">Период</span>
        <span className="ct-value">{d.time}</span>
      </div>
      <div className="ct-row">
        <span className="ct-label">Рейтинг</span>
        <span className="ct-value ct-accent">{d.rating.toFixed(2)}</span>
      </div>
      <div className="ct-row">
        <span className="ct-label">Sigma</span>
        <span className="ct-value">&plusmn;{d.sigma.toFixed(2)}</span>
      </div>
      <div className="ct-row">
        <span className="ct-label">Источник</span>
        <span className="ct-value">{d.source}</span>
      </div>
    </div>
  );
}

function MatchCard({
  match,
  highlightPlayer,
}: {
  match: MatchView;
  highlightPlayer?: boolean;
}) {
  return (
    <div className="match-card">
      <div className="mc-head">
        <span className={`mode-badge ${match.mode}`}>{match.mode}</span>
        <span className="mc-id">#{match.id}</span>
        <span className="mc-time">t={match.playedAt}</span>
      </div>
      <div className="mc-sides">
        {match.sides.map((side) => {
          const isWinner = side.sideIndex === match.winnerSideIndex;
          const isPlayer =
            highlightPlayer && side.sideIndex === match.playerSideIndex;
          return (
            <div
              key={side.sideIndex}
              className={`mc-side${isWinner ? " winner" : " loser"}${isPlayer ? " highlight" : ""}`}
            >
              <span className="mc-side-tag">{isWinner ? "WIN" : "LOSE"}</span>
              <span className="mc-side-players">
                {side.players.join(", ")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PlayerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getPlayerProfile(Number(id));
      setProfile(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="page">
        <div className="loading-screen">
          <div className="spinner" />
          <span>Загрузка профиля...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <div className="error-state">{error}</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="page">
        <div className="empty-state-lg">
          <p>Игрок не найден</p>
        </div>
      </div>
    );
  }

  const { player, ratingHistory, recentMatches } = profile;

  const chartData: ChartPoint[] = ratingHistory.map((p) => ({
    time: p.playedAt,
    rating: p.ratingElo,
    sigma: p.sigmaElo,
    source: p.source,
  }));

  const totalMatches = recentMatches.length;
  const wins = recentMatches.filter(
    (m) =>
      m.playerSideIndex !== undefined &&
      m.playerSideIndex === m.winnerSideIndex
  ).length;
  const winRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : null;

  const ratingDelta =
    chartData.length >= 2
      ? chartData[chartData.length - 1].rating - chartData[0].rating
      : 0;

  return (
    <div className="page fade-in">
      <button className="btn-back" onClick={() => navigate("/players")}>
        <ArrowLeft size={18} />
        <span>Назад к списку</span>
      </button>

      {/* Profile Header */}
      <div className="profile-header">
        <div className="profile-avatar">
          {player.handle.charAt(0).toUpperCase()}
        </div>
        <div className="profile-info">
          <h1 className="profile-name">{player.handle}</h1>
          <span className="profile-id">Player ID: {player.id}</span>
        </div>
      </div>

      {/* Profile Stats */}
      <div className="profile-stats">
        <div className="ps-item">
          <TrendingUp size={18} className="ps-icon blue" />
          <div className="ps-data">
            <span className="ps-value">{player.ratingElo.toFixed(1)}</span>
            <span className="ps-label">Рейтинг</span>
          </div>
        </div>
        <div className="ps-item">
          <Activity size={18} className="ps-icon violet" />
          <div className="ps-data">
            <span className="ps-value">
              &plusmn; {player.sigmaElo.toFixed(1)}
            </span>
            <span className="ps-label">Sigma</span>
          </div>
        </div>
        <div className="ps-item">
          <Trophy size={18} className="ps-icon amber" />
          <div className="ps-data">
            <span className="ps-value">
              {winRate !== null ? `${winRate}%` : "\u2014"}
            </span>
            <span className="ps-label">Винрейт</span>
          </div>
        </div>
        <div className="ps-item">
          <Target size={18} className="ps-icon green" />
          <div className="ps-data">
            <span className="ps-value">{totalMatches}</span>
            <span className="ps-label">Матчей</span>
          </div>
        </div>
      </div>

      {/* Rating Chart */}
      <div className="card">
        <div className="card-head">
          <h2>Динамика рейтинга</h2>
          {ratingDelta !== 0 && (
            <span
              className={`delta-badge ${ratingDelta > 0 ? "positive" : "negative"}`}
            >
              {ratingDelta > 0 ? "+" : ""}
              {ratingDelta.toFixed(1)}
            </span>
          )}
        </div>
        {chartData.length > 1 ? (
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={340}>
              <AreaChart
                data={chartData}
                margin={{ top: 10, right: 16, left: -10, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id="ratingFill"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.04)"
                  vertical={false}
                />
                <XAxis
                  dataKey="time"
                  stroke="#4a5068"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#4a5068"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  domain={["auto", "auto"]}
                />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="rating"
                  stroke="#6366f1"
                  strokeWidth={2.5}
                  fill="url(#ratingFill)"
                  dot={false}
                  activeDot={{
                    r: 5,
                    stroke: "#6366f1",
                    strokeWidth: 2,
                    fill: "#1a1e2e",
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="empty-state">Недостаточно данных для построения графика</div>
        )}
      </div>

      {/* Matches */}
      <div className="card">
        <div className="card-head">
          <h2>Последние матчи</h2>
          <span className="card-counter">{totalMatches}</span>
        </div>
        <div className="match-list">
          {recentMatches.length === 0 ? (
            <div className="empty-state">У игрока ещё нет матчей</div>
          ) : (
            recentMatches.map((match) => (
              <MatchCard key={match.id} match={match} highlightPlayer />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
