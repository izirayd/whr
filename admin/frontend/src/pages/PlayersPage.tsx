import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ChevronRight } from "lucide-react";
import { api } from "../api";
import type { PlayerListItem } from "../types";

export function PlayersPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [players, setPlayers] = useState<PlayerListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getPlayers(1, 100, search);
      setPlayers(data.items);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="page fade-in">
      <div className="page-header">
        <h1>Игроки</h1>
        <span className="page-count">{total} всего</span>
      </div>

      <div className="search-bar">
        <Search size={18} className="search-icon" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по нику..."
          className="search-input"
        />
      </div>

      {loading ? (
        <div className="loading-screen">
          <div className="spinner" />
          <span>Загрузка...</span>
        </div>
      ) : players.length === 0 ? (
        <div className="empty-state-lg">
          <Search size={40} strokeWidth={1.2} />
          <p>Игроки не найдены</p>
        </div>
      ) : (
        <div className="players-table">
          <div className="pt-header">
            <span className="pt-col-rank">#</span>
            <span className="pt-col-name">Игрок</span>
            <span className="pt-col-rating">Рейтинг</span>
            <span className="pt-col-sigma">Sigma</span>
            <span className="pt-col-arrow"></span>
          </div>
          {players.map((p, idx) => (
            <div
              key={p.id}
              className="pt-row"
              onClick={() => navigate(`/players/${p.id}`)}
            >
              <span className="pt-col-rank">{idx + 1}</span>
              <span className="pt-col-name">
                <span className="player-avatar-sm">
                  {p.handle.charAt(0).toUpperCase()}
                </span>
                {p.handle}
              </span>
              <span className="pt-col-rating">{p.ratingElo.toFixed(1)}</span>
              <span className="pt-col-sigma">&plusmn; {p.sigmaElo.toFixed(1)}</span>
              <span className="pt-col-arrow">
                <ChevronRight size={16} />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
