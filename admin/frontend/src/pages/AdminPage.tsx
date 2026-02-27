import { useCallback, useState } from "react";
import {
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { api, sleep } from "../api";
import type { RecalcJob } from "../types";

export function AdminPage() {
  const [recalcJob, setRecalcJob] = useState<RecalcJob | null>(null);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startRecalculation = useCallback(async () => {
    setIsRecalculating(true);
    setError(null);
    try {
      const { job } = await api.startRecalculation();
      setRecalcJob(job);

      const deadline = Date.now() + 180_000;
      let status = job.status;

      while (
        Date.now() < deadline &&
        status !== "success" &&
        status !== "failed"
      ) {
        await sleep(1500);
        const current = await api.getRecalcJob(job.id);
        setRecalcJob(current);
        status = current.status;
      }

      if (status !== "success") {
        throw new Error("Пересчёт не завершился успешно в отведённое время");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRecalculating(false);
    }
  }, []);

  const statusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle size={18} className="icon-green" />;
      case "failed":
        return <XCircle size={18} className="icon-red" />;
      case "running":
        return <RefreshCw size={18} className="icon-blue spinning" />;
      default:
        return <Clock size={18} className="icon-amber" />;
    }
  };

  return (
    <div className="page fade-in">
      <div className="page-header">
        <h1>Управление</h1>
        <span className="page-header-hint">Инструменты администрирования</span>
      </div>

      <div className="card admin-card">
        <div className="card-head">
          <h2>Пересчёт рейтингов</h2>
        </div>
        <p className="card-desc">
          Запускает полный пересчёт рейтингов WHR для всех игроков на основе
          всей истории матчей. Процесс может занять от нескольких секунд до
          нескольких минут в зависимости от объёма данных.
        </p>

        <button
          className="btn-primary btn-lg"
          onClick={startRecalculation}
          disabled={isRecalculating}
        >
          <RefreshCw
            size={18}
            className={isRecalculating ? "spinning" : ""}
          />
          <span>
            {isRecalculating
              ? "Выполняется пересчёт..."
              : "Запустить полный пересчёт"}
          </span>
        </button>

        {error && (
          <div className="alert alert-error">
            <AlertTriangle size={18} />
            <span>{error}</span>
          </div>
        )}

        {recalcJob && (
          <div className="job-card">
            <div className="job-header">
              {statusIcon(recalcJob.status)}
              <span className="job-title">Job #{recalcJob.id}</span>
              <span className={`job-badge ${recalcJob.status}`}>
                {recalcJob.status}
              </span>
            </div>
            <div className="job-details">
              <div className="job-row">
                <span className="job-label">Запрошен</span>
                <span className="job-val">{recalcJob.requestedAt}</span>
              </div>
              {recalcJob.startedAt && (
                <div className="job-row">
                  <span className="job-label">Начат</span>
                  <span className="job-val">{recalcJob.startedAt}</span>
                </div>
              )}
              {recalcJob.finishedAt && (
                <div className="job-row">
                  <span className="job-label">Завершён</span>
                  <span className="job-val">{recalcJob.finishedAt}</span>
                </div>
              )}
              {recalcJob.message && (
                <div className="job-row">
                  <span className="job-label">Сообщение</span>
                  <span className="job-val">{recalcJob.message}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
