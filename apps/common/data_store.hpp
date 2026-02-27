#pragma once

#include <whr/match.hpp>
#include <whr/types.hpp>

#include <sqlite3.h>

#include <cstdint>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace whr_example {

struct PlayerRecord final {
  whr::PlayerId id = 0;
  std::string handle;
};

struct StoredMatch final {
  std::int64_t db_match_id = 0;
  std::string mode;
  whr::Match match;
};

inline void throw_sqlite_error(sqlite3* db, const std::string& context) {
  const char* msg = (db != nullptr) ? sqlite3_errmsg(db) : "unknown sqlite error";
  throw std::runtime_error(context + ": " + msg);
}

class SqliteDatabase final {
public:
  explicit SqliteDatabase(const std::string& path) : path_(path) {
    const int rc = sqlite3_open_v2(
        path.c_str(),
        &db_,
        SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE,
        nullptr);
    if (rc != SQLITE_OK) {
      std::string msg = "failed to open sqlite database";
      if (db_ != nullptr) msg += ": " + std::string(sqlite3_errmsg(db_));
      if (db_ != nullptr) sqlite3_close(db_);
      db_ = nullptr;
      throw std::runtime_error(msg);
    }
    exec("PRAGMA foreign_keys = ON;");
    exec("PRAGMA journal_mode = WAL;");
    const int rc_timeout = sqlite3_busy_timeout(db_, 15000);
    if (rc_timeout != SQLITE_OK) throw_sqlite_error(db_, "failed to set sqlite busy timeout");
  }

  ~SqliteDatabase() {
    if (db_ != nullptr) {
      (void)sqlite3_close(db_);
      db_ = nullptr;
    }
  }

  SqliteDatabase(const SqliteDatabase&) = delete;
  SqliteDatabase& operator=(const SqliteDatabase&) = delete;

  [[nodiscard]] sqlite3* raw() const noexcept { return db_; }
  [[nodiscard]] const std::string& path() const noexcept { return path_; }

  void exec(const std::string& sql) {
    char* err = nullptr;
    const int rc = sqlite3_exec(db_, sql.c_str(), nullptr, nullptr, &err);
    if (rc != SQLITE_OK) {
      std::string msg = err != nullptr ? err : "sqlite exec failed";
      if (err != nullptr) sqlite3_free(err);
      throw std::runtime_error("sqlite exec failed: " + msg);
    }
  }

  [[nodiscard]] std::int64_t last_insert_rowid() const noexcept {
    return static_cast<std::int64_t>(sqlite3_last_insert_rowid(db_));
  }

  [[nodiscard]] int changes() const noexcept { return sqlite3_changes(db_); }

private:
  sqlite3* db_ = nullptr;
  std::string path_;
};

class SqliteStatement final {
public:
  SqliteStatement(SqliteDatabase& db, const std::string& sql) : db_(db.raw()) {
    const int rc = sqlite3_prepare_v2(db_, sql.c_str(), -1, &stmt_, nullptr);
    if (rc != SQLITE_OK) throw_sqlite_error(db_, "sqlite prepare failed");
  }

  ~SqliteStatement() {
    if (stmt_ != nullptr) {
      (void)sqlite3_finalize(stmt_);
      stmt_ = nullptr;
    }
  }

  SqliteStatement(const SqliteStatement&) = delete;
  SqliteStatement& operator=(const SqliteStatement&) = delete;

  void reset() {
    const int rc_reset = sqlite3_reset(stmt_);
    if (rc_reset != SQLITE_OK) throw_sqlite_error(db_, "sqlite reset failed");
    const int rc_clear = sqlite3_clear_bindings(stmt_);
    if (rc_clear != SQLITE_OK) throw_sqlite_error(db_, "sqlite clear bindings failed");
  }

  void bind_int64(int index, std::int64_t value) {
    const int rc = sqlite3_bind_int64(stmt_, index, static_cast<sqlite3_int64>(value));
    if (rc != SQLITE_OK) throw_sqlite_error(db_, "sqlite bind int64 failed");
  }

  void bind_double(int index, double value) {
    const int rc = sqlite3_bind_double(stmt_, index, value);
    if (rc != SQLITE_OK) throw_sqlite_error(db_, "sqlite bind double failed");
  }

  void bind_text(int index, const std::string& value) {
    const int rc = sqlite3_bind_text(stmt_, index, value.c_str(), -1, SQLITE_TRANSIENT);
    if (rc != SQLITE_OK) throw_sqlite_error(db_, "sqlite bind text failed");
  }

  void bind_null(int index) {
    const int rc = sqlite3_bind_null(stmt_, index);
    if (rc != SQLITE_OK) throw_sqlite_error(db_, "sqlite bind null failed");
  }

  [[nodiscard]] bool step_row() {
    const int rc = sqlite3_step(stmt_);
    if (rc == SQLITE_ROW) return true;
    if (rc == SQLITE_DONE) return false;
    throw_sqlite_error(db_, "sqlite step row failed");
    return false;
  }

  void step_done() {
    const int rc = sqlite3_step(stmt_);
    if (rc != SQLITE_DONE) throw_sqlite_error(db_, "sqlite step done failed");
  }

  [[nodiscard]] std::int64_t column_int64(int index) const {
    return static_cast<std::int64_t>(sqlite3_column_int64(stmt_, index));
  }

  [[nodiscard]] double column_double(int index) const { return sqlite3_column_double(stmt_, index); }

  [[nodiscard]] std::string column_text(int index) const {
    const unsigned char* p = sqlite3_column_text(stmt_, index);
    return p != nullptr ? reinterpret_cast<const char*>(p) : std::string();
  }

private:
  sqlite3* db_ = nullptr;
  sqlite3_stmt* stmt_ = nullptr;
};

class ScopedTransaction final {
public:
  explicit ScopedTransaction(SqliteDatabase& db) : db_(db) { db_.exec("BEGIN IMMEDIATE TRANSACTION;"); }

  ~ScopedTransaction() {
    if (!completed_) {
      try {
        db_.exec("ROLLBACK;");
      } catch (...) {
      }
    }
  }

  void commit() {
    if (completed_) return;
    db_.exec("COMMIT;");
    completed_ = true;
  }

  ScopedTransaction(const ScopedTransaction&) = delete;
  ScopedTransaction& operator=(const ScopedTransaction&) = delete;

private:
  SqliteDatabase& db_;
  bool completed_ = false;
};

class DataStore final {
public:
  explicit DataStore(const std::string& db_path) : db_(db_path) {}

  [[nodiscard]] SqliteDatabase& db() noexcept { return db_; }
  [[nodiscard]] const SqliteDatabase& db() const noexcept { return db_; }

  void ensure_schema() {
    db_.exec(R"SQL(
CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mode TEXT NOT NULL,
  played_at INTEGER NOT NULL,
  winner_side_index INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS match_sides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  side_index INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS side_players (
  side_id INTEGER NOT NULL REFERENCES match_sides(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  PRIMARY KEY (side_id, player_id)
);

CREATE TABLE IF NOT EXISTS rating_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_type TEXT NOT NULL,
  status TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rating_snapshots (
  run_id INTEGER NOT NULL REFERENCES rating_runs(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  rating_scope TEXT NOT NULL DEFAULT 'duel',
  rating_elo REAL NOT NULL,
  sigma_elo REAL NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (run_id, player_id, rating_scope)
);

CREATE TABLE IF NOT EXISTS player_rating_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES rating_runs(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  match_id INTEGER REFERENCES matches(id) ON DELETE SET NULL,
  played_at INTEGER NOT NULL,
  rating_scope TEXT NOT NULL DEFAULT 'duel',
  rating_elo REAL NOT NULL,
  sigma_elo REAL NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recalc_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL,
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  finished_at TEXT,
  message TEXT
);

CREATE INDEX IF NOT EXISTS idx_matches_order ON matches(played_at, id);
CREATE INDEX IF NOT EXISTS idx_match_sides_match ON match_sides(match_id, side_index);
CREATE INDEX IF NOT EXISTS idx_side_players_player ON side_players(player_id, side_id);
CREATE INDEX IF NOT EXISTS idx_recalc_jobs_status ON recalc_jobs(status, id);
)SQL");
    migrate_legacy_rating_schema_();
    db_.exec(R"SQL(
CREATE INDEX IF NOT EXISTS idx_rating_snapshots_player_scope_run
  ON rating_snapshots(player_id, rating_scope, run_id);
CREATE INDEX IF NOT EXISTS idx_history_player_scope_time
  ON player_rating_history(player_id, rating_scope, played_at, id);
)SQL");
  }

  void clear_all_data() {
    db_.exec(R"SQL(
DELETE FROM player_rating_history;
DELETE FROM rating_snapshots;
DELETE FROM rating_runs;
DELETE FROM side_players;
DELETE FROM match_sides;
DELETE FROM matches;
DELETE FROM recalc_jobs;
DELETE FROM players;
DELETE FROM sqlite_sequence;
)SQL");
  }

  void insert_players(const std::vector<PlayerRecord>& players) {
    SqliteStatement insert_player(
        db_,
        R"SQL(
INSERT INTO players(id, handle)
VALUES(?1, ?2)
ON CONFLICT(id) DO UPDATE SET
  handle = excluded.handle;
)SQL");
    for (const PlayerRecord& p : players) {
      insert_player.reset();
      insert_player.bind_int64(1, static_cast<std::int64_t>(p.id));
      insert_player.bind_text(2, p.handle);
      insert_player.step_done();
    }
  }

  [[nodiscard]] std::int64_t insert_match(const std::string& mode, const whr::Match& match) {
    SqliteStatement insert_match_stmt(
        db_,
        "INSERT INTO matches(mode, played_at, winner_side_index) VALUES(?1, ?2, ?3);");
    insert_match_stmt.bind_text(1, mode);
    insert_match_stmt.bind_int64(2, static_cast<std::int64_t>(match.time));
    insert_match_stmt.bind_int64(3, static_cast<std::int64_t>(match.winner_side_index));
    insert_match_stmt.step_done();
    const std::int64_t match_id = db_.last_insert_rowid();

    SqliteStatement insert_side_stmt(
        db_,
        "INSERT INTO match_sides(match_id, side_index) VALUES(?1, ?2);");
    SqliteStatement insert_player_stmt(
        db_,
        "INSERT INTO side_players(side_id, player_id) VALUES(?1, ?2);");

    for (std::size_t side_index = 0; side_index < match.sides.size(); ++side_index) {
      insert_side_stmt.reset();
      insert_side_stmt.bind_int64(1, match_id);
      insert_side_stmt.bind_int64(2, static_cast<std::int64_t>(side_index));
      insert_side_stmt.step_done();
      const std::int64_t side_id = db_.last_insert_rowid();

      for (whr::PlayerId pid : match.sides[side_index].players) {
        insert_player_stmt.reset();
        insert_player_stmt.bind_int64(1, side_id);
        insert_player_stmt.bind_int64(2, static_cast<std::int64_t>(pid));
        insert_player_stmt.step_done();
      }
    }

    return match_id;
  }

  [[nodiscard]] std::int64_t create_rating_run(
      const std::string& run_type,
      const std::string& status,
      const std::string& note) {
    SqliteStatement stmt(
        db_,
        "INSERT INTO rating_runs(run_type, status, note) VALUES(?1, ?2, ?3);");
    stmt.bind_text(1, run_type);
    stmt.bind_text(2, status);
    stmt.bind_text(3, note);
    stmt.step_done();
    return db_.last_insert_rowid();
  }

  void update_rating_run_status(std::int64_t run_id, const std::string& status, const std::string& note) {
    SqliteStatement stmt(
        db_,
        "UPDATE rating_runs SET status = ?2, note = ?3 WHERE id = ?1;");
    stmt.bind_int64(1, run_id);
    stmt.bind_text(2, status);
    stmt.bind_text(3, note);
    stmt.step_done();
  }

  void upsert_rating_snapshot(
      std::int64_t run_id,
      whr::PlayerId player_id,
      const std::string& rating_scope,
      double rating_elo,
      double sigma_elo) {
    SqliteStatement stmt(
        db_,
        R"SQL(
INSERT INTO rating_snapshots(run_id, player_id, rating_scope, rating_elo, sigma_elo)
VALUES (?1, ?2, ?3, ?4, ?5)
ON CONFLICT(run_id, player_id, rating_scope) DO UPDATE
SET rating_elo = excluded.rating_elo,
    sigma_elo = excluded.sigma_elo,
    updated_at = CURRENT_TIMESTAMP;
)SQL");
    stmt.bind_int64(1, run_id);
    stmt.bind_int64(2, static_cast<std::int64_t>(player_id));
    stmt.bind_text(3, rating_scope);
    stmt.bind_double(4, rating_elo);
    stmt.bind_double(5, sigma_elo);
    stmt.step_done();
  }

  void insert_rating_history(
      std::int64_t run_id,
      whr::PlayerId player_id,
      std::int64_t match_id,
      whr::TimePoint played_at,
      const std::string& rating_scope,
      double rating_elo,
      double sigma_elo,
      const std::string& source) {
    SqliteStatement stmt(
        db_,
        R"SQL(
INSERT INTO player_rating_history(
  run_id,
  player_id,
  match_id,
  played_at,
  rating_scope,
  rating_elo,
  sigma_elo,
  source
)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8);
)SQL");
    stmt.bind_int64(1, run_id);
    stmt.bind_int64(2, static_cast<std::int64_t>(player_id));
    stmt.bind_int64(3, match_id);
    stmt.bind_int64(4, static_cast<std::int64_t>(played_at));
    stmt.bind_text(5, rating_scope);
    stmt.bind_double(6, rating_elo);
    stmt.bind_double(7, sigma_elo);
    stmt.bind_text(8, source);
    stmt.step_done();
  }

  void mark_recalc_job_running(std::int64_t job_id) {
    SqliteStatement stmt(
        db_,
        R"SQL(
UPDATE recalc_jobs
SET status = 'running',
    started_at = CURRENT_TIMESTAMP,
    message = NULL
WHERE id = ?1;
)SQL");
    stmt.bind_int64(1, job_id);
    stmt.step_done();
  }

  void mark_recalc_job_finished(std::int64_t job_id, bool success, const std::string& message) {
    SqliteStatement stmt(
        db_,
        R"SQL(
UPDATE recalc_jobs
SET status = ?2,
    finished_at = CURRENT_TIMESTAMP,
    message = ?3
WHERE id = ?1;
)SQL");
    stmt.bind_int64(1, job_id);
    stmt.bind_text(2, success ? "success" : "failed");
    stmt.bind_text(3, message);
    stmt.step_done();
  }

  [[nodiscard]] std::vector<PlayerRecord> load_players() {
    SqliteStatement stmt(
        db_,
        "SELECT id, handle FROM players ORDER BY id ASC;");
    std::vector<PlayerRecord> out;
    while (stmt.step_row()) {
      PlayerRecord rec;
      rec.id = static_cast<whr::PlayerId>(stmt.column_int64(0));
      rec.handle = stmt.column_text(1);
      out.push_back(std::move(rec));
    }
    return out;
  }

  [[nodiscard]] std::vector<StoredMatch> load_matches_ordered() {
    SqliteStatement stmt(
        db_,
        R"SQL(
SELECT
  m.id,
  m.mode,
  m.played_at,
  m.winner_side_index,
  ms.side_index,
  sp.player_id
FROM matches AS m
JOIN match_sides AS ms
  ON ms.match_id = m.id
JOIN side_players AS sp
  ON sp.side_id = ms.id
ORDER BY m.played_at ASC, m.id ASC, ms.side_index ASC, sp.player_id ASC;
)SQL");

    std::vector<StoredMatch> out;
    std::int64_t current_match_id = -1;
    whr::TimePoint current_time = 0;
    std::size_t current_winner = 0;
    std::string current_mode;
    std::vector<whr::Side> current_sides;

    auto flush_current = [&]() {
      if (current_match_id < 0) return;
      StoredMatch sm;
      sm.db_match_id = current_match_id;
      sm.mode = current_mode;
      sm.match.time = current_time;
      sm.match.winner_side_index = current_winner;
      sm.match.sides = current_sides;
      out.push_back(std::move(sm));
    };

    while (stmt.step_row()) {
      const std::int64_t db_match_id = stmt.column_int64(0);
      const std::string mode = stmt.column_text(1);
      const whr::TimePoint played_at = static_cast<whr::TimePoint>(stmt.column_int64(2));
      const std::size_t winner_side = static_cast<std::size_t>(stmt.column_int64(3));
      const std::size_t side_index = static_cast<std::size_t>(stmt.column_int64(4));
      const whr::PlayerId pid = static_cast<whr::PlayerId>(stmt.column_int64(5));

      if (current_match_id != db_match_id) {
        flush_current();
        current_match_id = db_match_id;
        current_mode = mode;
        current_time = played_at;
        current_winner = winner_side;
        current_sides.clear();
      }

      if (current_sides.size() <= side_index) current_sides.resize(side_index + 1);
      current_sides[side_index].players.push_back(pid);
    }

    flush_current();
    return out;
  }

private:
  [[nodiscard]] bool table_has_column_(const std::string& table, const std::string& column) {
    SqliteStatement stmt(db_, "PRAGMA table_info(" + table + ");");
    while (stmt.step_row()) {
      if (stmt.column_text(1) == column) return true;
    }
    return false;
  }

  [[nodiscard]] bool rating_snapshots_pk_has_scope_() {
    SqliteStatement stmt(db_, "PRAGMA table_info(rating_snapshots);");
    bool run_pk = false;
    bool player_pk = false;
    bool scope_pk = false;
    while (stmt.step_row()) {
      const std::string name = stmt.column_text(1);
      const std::int64_t pk_order = stmt.column_int64(5);
      if (name == "run_id" && pk_order > 0) run_pk = true;
      if (name == "player_id" && pk_order > 0) player_pk = true;
      if (name == "rating_scope" && pk_order > 0) scope_pk = true;
    }
    return run_pk && player_pk && scope_pk;
  }

  void migrate_legacy_rating_schema_() {
    const bool snapshots_has_scope = table_has_column_("rating_snapshots", "rating_scope");
    const bool snapshots_pk_has_scope = rating_snapshots_pk_has_scope_();

    if (!snapshots_has_scope || !snapshots_pk_has_scope) {
      db_.exec("ALTER TABLE rating_snapshots RENAME TO rating_snapshots_legacy;");
      db_.exec(R"SQL(
CREATE TABLE rating_snapshots (
  run_id INTEGER NOT NULL REFERENCES rating_runs(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  rating_scope TEXT NOT NULL DEFAULT 'duel',
  rating_elo REAL NOT NULL,
  sigma_elo REAL NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (run_id, player_id, rating_scope)
);
)SQL");

      if (snapshots_has_scope) {
        db_.exec(R"SQL(
INSERT INTO rating_snapshots(run_id, player_id, rating_scope, rating_elo, sigma_elo, updated_at)
SELECT
  run_id,
  player_id,
  COALESCE(NULLIF(rating_scope, ''), 'duel'),
  rating_elo,
  sigma_elo,
  updated_at
FROM rating_snapshots_legacy;
)SQL");
      } else {
        db_.exec(R"SQL(
INSERT INTO rating_snapshots(run_id, player_id, rating_scope, rating_elo, sigma_elo, updated_at)
SELECT
  run_id,
  player_id,
  'duel',
  rating_elo,
  sigma_elo,
  updated_at
FROM rating_snapshots_legacy;
)SQL");
      }
      db_.exec("DROP TABLE rating_snapshots_legacy;");
    } else {
      db_.exec(R"SQL(
UPDATE rating_snapshots
SET rating_scope = 'duel'
WHERE rating_scope IS NULL OR rating_scope = '';
)SQL");
    }

    if (!table_has_column_("player_rating_history", "rating_scope")) {
      db_.exec("ALTER TABLE player_rating_history ADD COLUMN rating_scope TEXT NOT NULL DEFAULT 'duel';");
    }
    db_.exec(R"SQL(
UPDATE player_rating_history
SET rating_scope = 'duel'
WHERE rating_scope IS NULL OR rating_scope = '';
)SQL");
  }

  SqliteDatabase db_;
};

} // namespace whr_example

