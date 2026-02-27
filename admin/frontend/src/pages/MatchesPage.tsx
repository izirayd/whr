import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { MatchMode, MatchView } from "../types";

const modes: Array<{ value: "all" | MatchMode; label: string }> = [
  { value: "all", label: "Все" },
  { value: "duel", label: "Duel" },
  { value: "team", label: "Team" },
  { value: "ffa", label: "FFA" },
];

export function MatchesPage() {
  const [modeFilter, setModeFilter] = useState<"all" | MatchMode>("all");
  const [matches, setMatches] = useState<MatchView[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const mode = modeFilter === "all" ? undefined : modeFilter;
      const data = await api.getMatches(1, 50, mode);
      setMatches(data.items);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, [modeFilter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="page fade-in">
      <div className="page-header">
        <h1>Журнал матчей</h1>
        <span className="page-count">{total} всего</span>
      </div>

      <div className="mode-tabs">
        {modes.map((m) => (
          <button
            key={m.value}
            className={`mode-tab${modeFilter === m.value ? " active" : ""}`}
            onClick={() => setModeFilter(m.value)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading-screen">
          <div className="spinner" />
          <span>Загрузка матчей...</span>
        </div>
      ) : matches.length === 0 ? (
        <div className="empty-state-lg">
          <p>Матчи не найдены</p>
        </div>
      ) : (
        <div className="match-list">
          {matches.map((match) => (
            <div key={match.id} className="match-card">
              <div className="mc-head">
                <span className={`mode-badge ${match.mode}`}>
                  {match.mode}
                </span>
                <span className="mc-id">#{match.id}</span>
                <span className="mc-time">t={match.playedAt}</span>
              </div>
              <div className="mc-sides">
                {match.sides.map((side) => {
                  const isWinner = side.sideIndex === match.winnerSideIndex;
                  return (
                    <div
                      key={side.sideIndex}
                      className={`mc-side${isWinner ? " winner" : " loser"}`}
                    >
                      <span className="mc-side-tag">
                        {isWinner ? "WIN" : "LOSE"}
                      </span>
                      <span className="mc-side-players">
                        {side.players.join(", ")}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
