import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Swords, TrendingUp, Hash, ChevronRight } from "lucide-react";
import { api } from "../api";
import type { PlayerListItem, MatchView } from "../types";

export function DashboardPage() {
  const navigate = useNavigate();
  const [playersTotal, setPlayersTotal] = useState(0);
  const [matchesTotal, setMatchesTotal] = useState(0);
  const [latestRunId, setLatestRunId] = useState<number | null>(null);
  const [topPlayers, setTopPlayers] = useState<PlayerListItem[]>([]);
  const [recentMatches, setRecentMatches] = useState<MatchView[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [playersData, matchesData] = await Promise.all([
          api.getPlayers(1, 10, ""),
          api.getMatches(1, 8),
        ]);
        if (cancelled) return;
        setPlayersTotal(playersData.total);
        setLatestRunId(playersData.latestRunId);
        setTopPlayers(playersData.items);
        setMatchesTotal(matchesData.total);
        setRecentMatches(matchesData.items);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="page">
        <div className="loading-screen">
          <div className="spinner" />
          <span>Загрузка данных...</span>
        </div>
      </div>
    );
  }

  const avgRating =
    topPlayers.length > 0
      ? Math.round(topPlayers.reduce((s, p) => s + p.ratingElo, 0) / topPlayers.length)
      : 0;

  return (
    <div className="page fade-in">
      <div className="page-header">
        <h1>Обзор системы</h1>
        <span className="page-header-hint">Дашборд рейтинговой системы WHR</span>
      </div>

      <div className="stats-grid">
        <div className="stat-card" data-accent="blue">
          <div className="stat-icon">
            <Users size={22} />
          </div>
          <div className="stat-body">
            <div className="stat-value">{playersTotal}</div>
            <div className="stat-label">Игроков</div>
          </div>
        </div>

        <div className="stat-card" data-accent="violet">
          <div className="stat-icon">
            <Swords size={22} />
          </div>
          <div className="stat-body">
            <div className="stat-value">{matchesTotal}</div>
            <div className="stat-label">Матчей</div>
          </div>
        </div>

        <div className="stat-card" data-accent="green">
          <div className="stat-icon">
            <TrendingUp size={22} />
          </div>
          <div className="stat-body">
            <div className="stat-value">{avgRating || "\u2014"}</div>
            <div className="stat-label">Средний рейтинг</div>
          </div>
        </div>

        <div className="stat-card" data-accent="amber">
          <div className="stat-icon">
            <Hash size={22} />
          </div>
          <div className="stat-body">
            <div className="stat-value">{latestRunId ?? "\u2014"}</div>
            <div className="stat-label">Последний Run</div>
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* Leaderboard */}
        <div className="card">
          <div className="card-head">
            <h2>Топ игроков</h2>
            <button className="btn-ghost" onClick={() => navigate("/players")}>
              Все игроки <ChevronRight size={15} />
            </button>
          </div>
          <div className="leaderboard">
            {topPlayers.map((p, idx) => (
              <div
                key={p.id}
                className="lb-row"
                onClick={() => navigate(`/players/${p.id}`)}
              >
                <span className={`lb-rank ${idx < 3 ? `top-${idx + 1}` : ""}`}>
                  {idx + 1}
                </span>
                <span className="lb-name">{p.handle}</span>
                <span className="lb-rating">
                  {p.ratingElo.toFixed(0)}
                  <small> elo</small>
                </span>
              </div>
            ))}
            {topPlayers.length === 0 && (
              <div className="empty-state">Нет данных об игроках</div>
            )}
          </div>
        </div>

        {/* Recent Matches */}
        <div className="card">
          <div className="card-head">
            <h2>Последние матчи</h2>
            <button className="btn-ghost" onClick={() => navigate("/matches")}>
              Все матчи <ChevronRight size={15} />
            </button>
          </div>
          <div className="recent-list">
            {recentMatches.map((m) => (
              <div key={m.id} className="recent-match">
                <div className="rm-top">
                  <span className={`mode-badge ${m.mode}`}>{m.mode}</span>
                  <span className="rm-id">#{m.id}</span>
                  <span className="rm-time">t={m.playedAt}</span>
                </div>
                <div className="rm-sides">
                  {m.sides.map((s) => (
                    <span
                      key={s.sideIndex}
                      className={
                        s.sideIndex === m.winnerSideIndex
                          ? "rm-winner"
                          : "rm-loser"
                      }
                    >
                      {s.players.join(", ")}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {recentMatches.length === 0 && (
              <div className="empty-state">Нет данных о матчах</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
