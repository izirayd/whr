#include "data_store.hpp"

#include <whr/engine.hpp>

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <optional>
#include <stdexcept>
#include <string>
#include <unordered_set>
#include <vector>

namespace {

struct Options final {
  std::string db_path = "data\\whr_simulation.sqlite";
  std::size_t iterations = 80;
  double epsilon = 1e-6;
  double duel_w2_elo = 70.0;
  double duel_prior_games = 3.0;
  double duel_max_step_elo = 500.0;
  std::optional<double> team_small_w2_elo;
  std::optional<double> team_large_w2_elo;
  std::optional<std::size_t> players_limit;
  std::optional<std::size_t> matches_limit;
  std::optional<std::int64_t> job_id;
};

[[nodiscard]] whr::WhrConfig make_duel_config(const Options& options) {
  whr::WhrConfig cfg;
  // Duel timeline is presented match-by-match in UI, so we want more responsive updates.
  cfg.w2_elo = options.duel_w2_elo;
  cfg.prior_games = options.duel_prior_games;
  cfg.max_newton_step_r = whr::elo_to_r(options.duel_max_step_elo);
  return cfg;
}

[[nodiscard]] whr::WhrConfig make_team_small_config(const Options& options) {
  whr::WhrConfig cfg;
  cfg.w2_elo = options.team_small_w2_elo.value_or(options.duel_w2_elo);
  cfg.prior_games = 3.0;
  return cfg;
}

[[nodiscard]] whr::WhrConfig make_team_large_config(const Options& options) {
  whr::WhrConfig cfg;
  cfg.w2_elo = options.team_large_w2_elo.value_or(options.duel_w2_elo);
  cfg.prior_games = 3.0;
  return cfg;
}

[[nodiscard]] std::optional<std::string> arg_value(int argc, char** argv, int& i) {
  const std::string arg = argv[i];
  const std::size_t eq = arg.find('=');
  if (eq != std::string::npos) return arg.substr(eq + 1);
  if (i + 1 < argc) {
    ++i;
    return std::string(argv[i]);
  }
  return std::nullopt;
}

[[nodiscard]] std::size_t parse_positive_size(const std::string& value, const char* name) {
  try {
    const std::size_t parsed = static_cast<std::size_t>(std::stoull(value));
    if (parsed == 0) throw std::invalid_argument("must be > 0");
    return parsed;
  } catch (const std::exception&) {
    throw std::invalid_argument(std::string("invalid value for ") + name + ": " + value);
  }
}

[[nodiscard]] double parse_double(const std::string& value, const char* name) {
  try {
    return std::stod(value);
  } catch (const std::exception&) {
    throw std::invalid_argument(std::string("invalid value for ") + name + ": " + value);
  }
}

[[nodiscard]] double parse_non_negative_double(const std::string& value, const char* name) {
  const double parsed = parse_double(value, name);
  if (parsed < 0.0) {
    throw std::invalid_argument(std::string("invalid value for ") + name + " (must be >= 0): " + value);
  }
  return parsed;
}

[[nodiscard]] double parse_positive_double(const std::string& value, const char* name) {
  const double parsed = parse_double(value, name);
  if (parsed <= 0.0) {
    throw std::invalid_argument(std::string("invalid value for ") + name + " (must be > 0): " + value);
  }
  return parsed;
}

[[nodiscard]] std::int64_t parse_i64(const std::string& value, const char* name) {
  try {
    return static_cast<std::int64_t>(std::stoll(value));
  } catch (const std::exception&) {
    throw std::invalid_argument(std::string("invalid value for ") + name + ": " + value);
  }
}

void print_help() {
  std::cout
      << "whr_recalc options:\n"
      << "  --db <path>               SQLite file path (default data\\whr_simulation.sqlite)\n"
      << "  --iterations <n>          optimize_all iterations (default 80)\n"
      << "  --epsilon <x>             optimize_all epsilon (default 1e-6)\n"
      << "  --duel-w2-elo <x>         Duel WHR w2_elo coefficient (default 70)\n"
      << "  --team-small-w2-elo <x>  Team small WHR w2_elo coefficient (default duel value)\n"
      << "  --team-large-w2-elo <x>  Team large WHR w2_elo coefficient (default duel value)\n"
      << "  --duel-prior-games <x>    Duel WHR prior_games coefficient (default 3)\n"
      << "  --duel-max-step-elo <x>   Duel per-step Newton cap in Elo (default 500)\n"
      << "  --players <n>             Limit recalculation to first N players by id\n"
      << "  --matches <n>             Limit recalculation to first N matches by time\n"
      << "  --job-id <id>             recalc_jobs.id to update status for admin\n"
      << "  --full                    accepted for API compatibility\n"
      << "  --help                    Show this message\n";
}

[[nodiscard]] Options parse_options(int argc, char** argv) {
  Options out;
  for (int i = 1; i < argc; ++i) {
    const std::string arg = argv[i];
    if (arg == "--help") {
      print_help();
      std::exit(0);
    } else if (arg.rfind("--db", 0) == 0) {
      const auto value = arg_value(argc, argv, i);
      if (!value) throw std::invalid_argument("--db requires a value");
      out.db_path = *value;
    } else if (arg.rfind("--iterations", 0) == 0) {
      const auto value = arg_value(argc, argv, i);
      if (!value) throw std::invalid_argument("--iterations requires a value");
      out.iterations = parse_positive_size(*value, "--iterations");
    } else if (arg.rfind("--epsilon", 0) == 0) {
      const auto value = arg_value(argc, argv, i);
      if (!value) throw std::invalid_argument("--epsilon requires a value");
      out.epsilon = parse_double(*value, "--epsilon");
    } else if (arg.rfind("--duel-w2-elo", 0) == 0) {
      const auto value = arg_value(argc, argv, i);
      if (!value) throw std::invalid_argument("--duel-w2-elo requires a value");
      out.duel_w2_elo = parse_non_negative_double(*value, "--duel-w2-elo");
    } else if (arg.rfind("--team-small-w2-elo", 0) == 0) {
      const auto value = arg_value(argc, argv, i);
      if (!value) throw std::invalid_argument("--team-small-w2-elo requires a value");
      out.team_small_w2_elo = parse_non_negative_double(*value, "--team-small-w2-elo");
    } else if (arg.rfind("--team-large-w2-elo", 0) == 0) {
      const auto value = arg_value(argc, argv, i);
      if (!value) throw std::invalid_argument("--team-large-w2-elo requires a value");
      out.team_large_w2_elo = parse_non_negative_double(*value, "--team-large-w2-elo");
    } else if (arg.rfind("--duel-prior-games", 0) == 0) {
      const auto value = arg_value(argc, argv, i);
      if (!value) throw std::invalid_argument("--duel-prior-games requires a value");
      out.duel_prior_games = parse_non_negative_double(*value, "--duel-prior-games");
    } else if (arg.rfind("--duel-max-step-elo", 0) == 0) {
      const auto value = arg_value(argc, argv, i);
      if (!value) throw std::invalid_argument("--duel-max-step-elo requires a value");
      out.duel_max_step_elo = parse_positive_double(*value, "--duel-max-step-elo");
    } else if (arg.rfind("--players", 0) == 0) {
      const auto value = arg_value(argc, argv, i);
      if (!value) throw std::invalid_argument("--players requires a value");
      out.players_limit = parse_positive_size(*value, "--players");
    } else if (arg.rfind("--matches", 0) == 0) {
      const auto value = arg_value(argc, argv, i);
      if (!value) throw std::invalid_argument("--matches requires a value");
      out.matches_limit = parse_positive_size(*value, "--matches");
    } else if (arg.rfind("--job-id", 0) == 0) {
      const auto value = arg_value(argc, argv, i);
      if (!value) throw std::invalid_argument("--job-id requires a value");
      out.job_id = parse_i64(*value, "--job-id");
    } else if (arg == "--full") {
      // Compatibility flag: full recalculation is always performed.
    } else {
      throw std::invalid_argument("unknown option: " + arg);
    }
  }
  return out;
}

[[nodiscard]] std::optional<std::int64_t> extract_job_id_from_argv(int argc, char** argv) {
  for (int i = 1; i < argc; ++i) {
    const std::string arg = argv[i];
    if (arg.rfind("--job-id", 0) != 0) continue;

    std::optional<std::string> raw_value;
    const std::size_t eq = arg.find('=');
    if (eq != std::string::npos) {
      raw_value = arg.substr(eq + 1);
    } else if (i + 1 < argc) {
      raw_value = std::string(argv[i + 1]);
    }
    if (!raw_value || raw_value->empty()) return std::nullopt;

    try {
      return static_cast<std::int64_t>(std::stoll(*raw_value));
    } catch (const std::exception&) {
      return std::nullopt;
    }
  }
  return std::nullopt;
}

[[nodiscard]] std::vector<whr::PlayerId> extract_unique_participants(const whr::Match& match) {
  std::vector<whr::PlayerId> out;
  for (const whr::Side& side : match.sides) out.insert(out.end(), side.players.begin(), side.players.end());
  std::sort(out.begin(), out.end());
  out.erase(std::unique(out.begin(), out.end()), out.end());
  return out;
}

enum class RatingScope {
  Duel = 0,
  TeamSmall = 1,
  TeamLarge = 2,
  Ffa = 3,
};

constexpr std::size_t kScopeCount = 4;

[[nodiscard]] std::size_t scope_index(RatingScope scope) {
  return static_cast<std::size_t>(scope);
}

[[nodiscard]] const char* scope_to_text(RatingScope scope) {
  switch (scope) {
    case RatingScope::Duel:
      return "duel";
    case RatingScope::TeamSmall:
      return "team_small";
    case RatingScope::TeamLarge:
      return "team_large";
    case RatingScope::Ffa:
      return "ffa";
  }
  return "duel";
}

struct ScopeEngines final {
  whr::WhrEngine duel;
  whr::WhrEngine team_small;
  whr::WhrEngine team_large;
  whr::WhrEngine ffa;

  explicit ScopeEngines(const Options& options)
      : duel(make_duel_config(options)),
        team_small(make_team_small_config(options)),
        team_large(make_team_large_config(options)),
        ffa() {}
};

[[nodiscard]] whr::WhrEngine& engine_for_scope(ScopeEngines& engines, RatingScope scope) {
  switch (scope) {
    case RatingScope::Duel:
      return engines.duel;
    case RatingScope::TeamSmall:
      return engines.team_small;
    case RatingScope::TeamLarge:
      return engines.team_large;
    case RatingScope::Ffa:
      return engines.ffa;
  }
  return engines.duel;
}

[[nodiscard]] RatingScope infer_scope(const whr_example::StoredMatch& stored) {
  std::size_t max_side_size = 0;
  for (const whr::Side& side : stored.match.sides) {
    max_side_size = (std::max)(max_side_size, side.players.size());
  }

  if (stored.mode == "duel") return RatingScope::Duel;
  if (stored.mode == "team_small") return RatingScope::TeamSmall;
  if (stored.mode == "team_large") return RatingScope::TeamLarge;
  if (stored.mode == "ffa") return RatingScope::Ffa;
  if (stored.mode == "team") return (max_side_size <= 4) ? RatingScope::TeamSmall : RatingScope::TeamLarge;

  if (stored.match.sides.size() > 2) return RatingScope::Ffa;
  if (stored.match.sides.size() == 2 && max_side_size == 1) return RatingScope::Duel;
  return (max_side_size <= 4) ? RatingScope::TeamSmall : RatingScope::TeamLarge;
}

[[nodiscard]] bool match_uses_only_players(
    const whr_example::StoredMatch& stored,
    const std::unordered_set<whr::PlayerId>& allowed_players) {
  for (const whr::Side& side : stored.match.sides) {
    for (whr::PlayerId pid : side.players) {
      if (allowed_players.find(pid) == allowed_players.end()) return false;
    }
  }
  return true;
}

void mark_failed_job_if_needed(
    const Options& options,
    int argc,
    char** argv,
    const std::string& message) {
  std::optional<std::int64_t> job_id = options.job_id;
  if (!job_id) job_id = extract_job_id_from_argv(argc, argv);
  if (!job_id) return;
  try {
    whr_example::DataStore store(options.db_path);
    store.ensure_schema();
    store.mark_recalc_job_finished(*job_id, false, message);
  } catch (...) {
  }
}

} // namespace

int main(int argc, char** argv) {
  Options options;
  try {
    options = parse_options(argc, argv);

    whr_example::DataStore store(options.db_path);
    store.ensure_schema();

    if (options.job_id) store.mark_recalc_job_running(*options.job_id);

    std::vector<whr_example::PlayerRecord> players = store.load_players();
    std::vector<whr_example::StoredMatch> matches = store.load_matches_ordered();

    if (options.players_limit && players.size() > *options.players_limit) {
      players.resize(*options.players_limit);
      std::unordered_set<whr::PlayerId> allowed_players;
      allowed_players.reserve(players.size());
      for (const whr_example::PlayerRecord& player : players) allowed_players.insert(player.id);
      matches.erase(
          std::remove_if(
              matches.begin(),
              matches.end(),
              [&](const whr_example::StoredMatch& stored) {
                return !match_uses_only_players(stored, allowed_players);
              }),
          matches.end());
    }

    if (options.matches_limit && matches.size() > *options.matches_limit) {
      matches.resize(*options.matches_limit);
    }

    ScopeEngines engines(options);
    std::array<whr::TimePoint, kScopeCount> final_time_by_scope{};
    std::vector<RatingScope> match_scopes;
    match_scopes.reserve(matches.size());
    for (const whr_example::StoredMatch& stored : matches) {
      match_scopes.push_back(infer_scope(stored));
    }

    whr_example::ScopedTransaction tx(store.db());
    const double team_small_w2 = options.team_small_w2_elo.value_or(options.duel_w2_elo);
    const double team_large_w2 = options.team_large_w2_elo.value_or(options.duel_w2_elo);
    std::string run_note =
        "iterations=" + std::to_string(options.iterations) +
        ", duel_w2_elo=" + std::to_string(options.duel_w2_elo) +
        ", team_small_w2_elo=" + std::to_string(team_small_w2) +
        ", team_large_w2_elo=" + std::to_string(team_large_w2) +
        ", duel_prior_games=" + std::to_string(options.duel_prior_games) +
        ", duel_max_step_elo=" + std::to_string(options.duel_max_step_elo);
    if (options.players_limit) run_note += ", players_limit=" + std::to_string(*options.players_limit);
    if (options.matches_limit) run_note += ", matches_limit=" + std::to_string(*options.matches_limit);
    const std::int64_t run_id = store.create_rating_run("recalculate", "running", run_note);

    std::size_t history_rows = 0;
    for (std::size_t i = 0; i < matches.size(); ++i) {
      const whr_example::StoredMatch& stored = matches[i];
      const RatingScope scope = match_scopes[i];
      whr::WhrEngine& scope_engine = engine_for_scope(engines, scope);
      const whr::MatchId engine_match_id = scope_engine.add_match(stored.match);
      scope_engine.incremental_update_for_match(engine_match_id);
      final_time_by_scope[scope_index(scope)] =
          (std::max)(final_time_by_scope[scope_index(scope)], stored.match.time);
      const std::vector<whr::PlayerId> participants = extract_unique_participants(stored.match);
      for (whr::PlayerId pid : participants) {
        store.insert_rating_history(
            run_id,
            pid,
            stored.db_match_id,
            stored.match.time,
            scope_to_text(scope),
            scope_engine.rating_elo(pid, stored.match.time),
            scope_engine.sigma_elo(pid, stored.match.time),
            "recalculate");
        ++history_rows;
      }
    }

    for (const whr_example::PlayerRecord& player : players) {
      store.upsert_rating_snapshot(
          run_id,
          player.id,
          "duel",
          engines.duel.rating_elo(player.id, final_time_by_scope[scope_index(RatingScope::Duel)]),
          engines.duel.sigma_elo(player.id, final_time_by_scope[scope_index(RatingScope::Duel)]));
      store.upsert_rating_snapshot(
          run_id,
          player.id,
          "team_small",
          engines.team_small.rating_elo(player.id, final_time_by_scope[scope_index(RatingScope::TeamSmall)]),
          engines.team_small.sigma_elo(player.id, final_time_by_scope[scope_index(RatingScope::TeamSmall)]));
      store.upsert_rating_snapshot(
          run_id,
          player.id,
          "team_large",
          engines.team_large.rating_elo(player.id, final_time_by_scope[scope_index(RatingScope::TeamLarge)]),
          engines.team_large.sigma_elo(player.id, final_time_by_scope[scope_index(RatingScope::TeamLarge)]));
      store.upsert_rating_snapshot(
          run_id,
          player.id,
          "ffa",
          engines.ffa.rating_elo(player.id, final_time_by_scope[scope_index(RatingScope::Ffa)]),
          engines.ffa.sigma_elo(player.id, final_time_by_scope[scope_index(RatingScope::Ffa)]));
    }

    store.update_rating_run_status(run_id, "completed", "recalculation completed");
    tx.commit();

    if (options.job_id) {
      store.mark_recalc_job_finished(
          *options.job_id,
          true,
          "recalculated players=" + std::to_string(players.size()) + ", matches=" + std::to_string(matches.size()));
    }

    std::cout << "Recalculation complete.\n"
              << "DB: " << options.db_path << "\n"
              << "Players: " << players.size() << "\n"
              << "Matches: " << matches.size() << "\n"
              << "History rows written: " << history_rows << "\n";
    return 0;
  } catch (const std::exception& ex) {
    mark_failed_job_if_needed(options, argc, argv, ex.what());
    std::cerr << "whr_recalc failed: " << ex.what() << "\n";
    return 1;
  }
}

