#include "data_store.hpp"

#include <whr/engine.hpp>
#include <whr/matchmaking.hpp>
#include <whr/math.hpp>

#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <filesystem>
#include <iostream>
#include <optional>
#include <random>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

namespace {

struct Options final {
  std::string db_path = "data\\whr_simulation.sqlite";
  std::size_t players = 100;
  std::size_t matches = 20000;
  std::uint64_t seed = 1337;
  // 0 keeps match history strictly causal (no mid-run full optimize rewrites).
  std::size_t optimize_interval = 0;
  // 0 disables final global optimize to keep snapshots consistent with history rows.
  std::size_t final_optimize_iterations = 0;
  bool reset_db = true;
  double duel_w2_elo = 70.0;
  double duel_prior_games = 3.0;
  double duel_max_step_elo = 500.0;
  std::optional<double> team_small_w2_elo;
  std::optional<double> team_large_w2_elo;
  std::optional<std::int64_t> job_id;
};

[[nodiscard]] whr::WhrConfig make_duel_config(const Options& options) {
  whr::WhrConfig cfg;
  // Duel mode benefits from snappier visible per-match movement.
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

[[nodiscard]] int parse_int(const std::string& value, const char* name) {
  try {
    const int parsed = std::stoi(value);
    if (parsed <= 0) throw std::invalid_argument("must be positive");
    return parsed;
  } catch (const std::exception&) {
    throw std::invalid_argument(std::string("invalid value for ") + name + ": " + value);
  }
}

[[nodiscard]] std::uint64_t parse_u64(const std::string& value, const char* name) {
  try {
    return static_cast<std::uint64_t>(std::stoull(value));
  } catch (const std::exception&) {
    throw std::invalid_argument(std::string("invalid value for ") + name + ": " + value);
  }
}

[[nodiscard]] std::size_t parse_non_negative_size(const std::string& value, const char* name) {
  try {
    return static_cast<std::size_t>(std::stoull(value));
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

void print_help() {
  std::cout
      << "whr_simulate options:\n"
      << "  --db <path>                  SQLite file path (default data\\whr_simulation.sqlite)\n"
      << "  --players <n>                Number of generated players (default 100)\n"
      << "  --matches <n>                Number of generated matches (default 20000)\n"
      << "  --duel-w2-elo <x>            Duel WHR w2_elo coefficient (default 70)\n"
      << "  --team-small-w2-elo <x>      Team small WHR w2_elo coefficient (default duel value)\n"
      << "  --team-large-w2-elo <x>      Team large WHR w2_elo coefficient (default duel value)\n"
      << "  --duel-prior-games <x>       Duel WHR prior_games coefficient (default 3)\n"
      << "  --duel-max-step-elo <x>      Duel per-step Newton cap in Elo (default 500)\n"
      << "  --seed <n>                   RNG seed (default 1337)\n"
      << "  --optimize-interval <n>      Full optimize cadence (default 0, disabled)\n"
      << "  --final-optimize-iterations <n>  Final full optimize iterations (default 0)\n"
      << "  --job-id <id>                recalc_jobs.id to update status for admin\n"
      << "  --full                       accepted for API compatibility\n"
      << "  --no-reset                   Keep existing DB rows and append\n"
      << "  --help                       Show this message\n";
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
    } else if (arg.rfind("--players", 0) == 0) {
      const auto value = arg_value(argc, argv, i);
      if (!value) throw std::invalid_argument("--players requires a value");
      out.players = static_cast<std::size_t>(parse_int(*value, "--players"));
    } else if (arg.rfind("--matches", 0) == 0) {
      const auto value = arg_value(argc, argv, i);
      if (!value) throw std::invalid_argument("--matches requires a value");
      out.matches = static_cast<std::size_t>(parse_int(*value, "--matches"));
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
    } else if (arg.rfind("--seed", 0) == 0) {
      const auto value = arg_value(argc, argv, i);
      if (!value) throw std::invalid_argument("--seed requires a value");
      out.seed = parse_u64(*value, "--seed");
    } else if (arg.rfind("--optimize-interval", 0) == 0) {
      const auto value = arg_value(argc, argv, i);
      if (!value) throw std::invalid_argument("--optimize-interval requires a value");
      out.optimize_interval = parse_non_negative_size(*value, "--optimize-interval");
    } else if (arg.rfind("--final-optimize-iterations", 0) == 0) {
      const auto value = arg_value(argc, argv, i);
      if (!value) throw std::invalid_argument("--final-optimize-iterations requires a value");
      out.final_optimize_iterations =
          parse_non_negative_size(*value, "--final-optimize-iterations");
    } else if (arg.rfind("--job-id", 0) == 0) {
      const auto value = arg_value(argc, argv, i);
      if (!value) throw std::invalid_argument("--job-id requires a value");
      out.job_id = parse_i64(*value, "--job-id");
    } else if (arg == "--full") {
      // Compatibility flag used by older admin launcher.
    } else if (arg == "--no-reset") {
      out.reset_db = false;
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

void reset_data_for_resimulation(whr_example::DataStore& store, bool preserve_recalc_jobs) {
  if (!preserve_recalc_jobs) {
    store.clear_all_data();
    return;
  }

  // Keep recalc_jobs rows so admin polling by job id does not break.
  store.db().exec(R"SQL(
DELETE FROM player_rating_history;
DELETE FROM rating_snapshots;
DELETE FROM rating_runs;
DELETE FROM side_players;
DELETE FROM match_sides;
DELETE FROM matches;
DELETE FROM players;
DELETE FROM sqlite_sequence
WHERE name IN ('matches', 'match_sides', 'player_rating_history', 'rating_runs');
)SQL");
}

[[nodiscard]] std::vector<std::string> generate_handles(std::size_t count) {
  const std::vector<std::string> first = {
      "Ash",     "Blitz",  "Cipher", "Drift",  "Echo",   "Flux",   "Gale",   "Hex",
      "Iris",    "Jolt",   "Kron",   "Lumen",  "Mako",   "Nova",   "Onyx",   "Pyre",
      "Quill",   "Rift",   "Strix",  "Talon",  "Umbra",  "Vex",    "Warden", "Xeno",
      "Ymir",    "Zephyr", "Astra",  "Brisk",  "Cinder", "Dusk"};
  const std::vector<std::string> second = {
      "Fox",      "Fang",     "Shard",   "Pulse",  "Rider", "Forge",   "Shade",  "Spark",
      "Viper",    "Crane",    "Knight",  "Anchor", "Ghost", "Beacon",  "Hunter", "Cyclone",
      "Storm",    "Sentinel", "Nomad",   "Pioneer", "Orbit", "Falcon", "Hammer", "Wraith",
      "Atlas",    "Reaper",   "Voyager", "Titan",  "Comet", "Monsoon"};

  std::vector<std::string> out;
  out.reserve(count);
  for (std::size_t i = 0; i < count; ++i) {
    const std::string base = first[i % first.size()] + second[(i / first.size()) % second.size()];
    if (i < first.size() * second.size()) {
      out.push_back(base);
    } else {
      out.push_back(base + "_" + std::to_string(i + 1));
    }
  }
  return out;
}

template <typename TRng>
[[nodiscard]] std::vector<whr::PlayerId> sample_unique_players(
    const std::vector<whr::PlayerId>& all_ids,
    std::size_t count,
    TRng& rng) {
  std::vector<whr::PlayerId> picked = all_ids;
  std::shuffle(picked.begin(), picked.end(), rng);
  picked.resize(count);
  return picked;
}

[[nodiscard]] double side_true_strength(
    const whr::Side& side,
    const std::unordered_map<whr::PlayerId, double>& true_skill_r) {
  double out = 0.0;
  for (whr::PlayerId pid : side.players) {
    const auto it = true_skill_r.find(pid);
    if (it != true_skill_r.end()) out += it->second;
  }
  return out;
}

template <typename TRng>
[[nodiscard]] std::size_t sample_index_from_weights(const std::vector<double>& weights, TRng& rng) {
  std::discrete_distribution<std::size_t> dist(weights.begin(), weights.end());
  return dist(rng);
}

enum class MatchMode {
  Duel,
  TeamSmall,
  TeamLarge,
  Ffa,
};

[[nodiscard]] const char* mode_to_text(MatchMode mode) {
  switch (mode) {
    case MatchMode::Duel:
      return "duel";
    case MatchMode::TeamSmall:
      return "team_small";
    case MatchMode::TeamLarge:
      return "team_large";
    case MatchMode::Ffa:
      return "ffa";
  }
  return "duel";
}

template <typename TRng>
[[nodiscard]] MatchMode sample_mode(TRng& rng) {
  std::discrete_distribution<int> dist({35, 30, 20, 15});
  return static_cast<MatchMode>(dist(rng));
}

struct ModeEngines final {
  whr::WhrEngine duel;
  whr::WhrEngine team_small;
  whr::WhrEngine team_large;
  whr::WhrEngine ffa;

  explicit ModeEngines(const Options& options)
      : duel(make_duel_config(options)),
        team_small(make_team_small_config(options)),
        team_large(make_team_large_config(options)),
        ffa() {}
};

[[nodiscard]] whr::WhrEngine& engine_for_mode(ModeEngines& engines, MatchMode mode) {
  switch (mode) {
    case MatchMode::Duel:
      return engines.duel;
    case MatchMode::TeamSmall:
      return engines.team_small;
    case MatchMode::TeamLarge:
      return engines.team_large;
    case MatchMode::Ffa:
      return engines.ffa;
  }
  return engines.duel;
}

template <typename TRng>
[[nodiscard]] whr::Match build_match(
    MatchMode mode,
    whr::TimePoint time,
    const std::vector<whr::PlayerId>& all_ids,
    const whr::WhrEngine& engine,
    TRng& rng) {
  whr::Match match;
  match.time = time;

  if (mode == MatchMode::Duel) {
    const auto picked = sample_unique_players(all_ids, 2, rng);
    match.sides = {whr::Side{{picked[0]}}, whr::Side{{picked[1]}}};
    return match;
  }

  if (mode == MatchMode::TeamSmall || mode == MatchMode::TeamLarge) {
    const std::size_t hard_max = (std::max)(static_cast<std::size_t>(1), all_ids.size() / 2);
    const std::size_t desired_min = (mode == MatchMode::TeamSmall) ? 2 : 5;
    const std::size_t desired_max = (mode == MatchMode::TeamSmall) ? 4 : 8;
    const std::size_t min_team = (std::min)(desired_min, hard_max);
    const std::size_t max_team = (std::min)(desired_max, hard_max);
    std::uniform_int_distribution<std::size_t> team_size_dist(min_team, max_team);
    const std::size_t team_size = team_size_dist(rng);
    const auto picked = sample_unique_players(all_ids, team_size * 2, rng);
    whr::matchmaking::TeamBalancer balancer(engine);
    const auto balanced = balancer.balance_2_teams(picked, team_size, time);
    match.sides = {whr::Side{balanced.teamA}, whr::Side{balanced.teamB}};
    return match;
  }

  std::uniform_int_distribution<std::size_t> side_count_dist(3, (std::min)(all_ids.size(), static_cast<std::size_t>(8)));
  const std::size_t side_count = side_count_dist(rng);
  const auto picked = sample_unique_players(all_ids, side_count, rng);
  match.sides.reserve(side_count);
  for (whr::PlayerId pid : picked) match.sides.push_back(whr::Side{{pid}});
  return match;
}

template <typename TRng>
[[nodiscard]] std::size_t pick_winner(
    whr::Match& match,
    const whr::WhrEngine& engine,
    const std::unordered_map<whr::PlayerId, double>& true_skill_r,
    TRng& rng) {
  if (match.sides.size() == 2) {
    const double p_engine = engine.predict_win_probability(match.sides[0].players, match.sides[1].players, match.time);
    const double s0 = side_true_strength(match.sides[0], true_skill_r);
    const double s1 = side_true_strength(match.sides[1], true_skill_r);
    const double p_true = whr::sigmoid(s0 - s1);
    const double mixed = (std::max)(0.01, (std::min)(0.99, 0.55 * p_engine + 0.45 * p_true));
    std::bernoulli_distribution pick_first(mixed);
    return pick_first(rng) ? 0 : 1;
  }

  const std::vector<double> p_engine = engine.predict_winner_probabilities(match.sides, match.time);
  std::vector<double> true_strength;
  true_strength.reserve(match.sides.size());
  for (const whr::Side& side : match.sides) true_strength.push_back(side_true_strength(side, true_skill_r));

  const double true_log_z = whr::log_sum_exp(true_strength.begin(), true_strength.end());
  std::vector<double> mixed;
  mixed.reserve(match.sides.size());
  double sum = 0.0;
  for (std::size_t i = 0; i < match.sides.size(); ++i) {
    const double p_true = std::exp(true_strength[i] - true_log_z);
    const double p = 0.55 * p_engine[i] + 0.45 * p_true;
    mixed.push_back(p);
    sum += p;
  }
  for (double& value : mixed) value /= sum;
  return sample_index_from_weights(mixed, rng);
}

[[nodiscard]] std::vector<whr::PlayerId> extract_unique_participants(const whr::Match& match) {
  std::vector<whr::PlayerId> out;
  for (const whr::Side& side : match.sides) {
    out.insert(out.end(), side.players.begin(), side.players.end());
  }
  std::sort(out.begin(), out.end());
  out.erase(std::unique(out.begin(), out.end()), out.end());
  return out;
}

} // namespace

int main(int argc, char** argv) {
  Options options;
  try {
    options = parse_options(argc, argv);
    if (options.players < 10) {
      throw std::invalid_argument(
          "players must be at least 10 to build stable duel/team_small/team_large/ffa samples");
    }
    if (options.matches < 1) throw std::invalid_argument("matches must be positive");

    const std::filesystem::path db_path(options.db_path);
    if (db_path.has_parent_path()) std::filesystem::create_directories(db_path.parent_path());
    if (options.reset_db && !options.job_id && std::filesystem::exists(db_path)) {
      std::filesystem::remove(db_path);
    }

    whr_example::DataStore store(options.db_path);
    store.ensure_schema();
    if (options.job_id) store.mark_recalc_job_running(*options.job_id);

    std::mt19937_64 rng(options.seed);
    std::normal_distribution<double> skill_dist(0.0, 1.1);

    const std::vector<std::string> handles = generate_handles(options.players);
    std::vector<whr_example::PlayerRecord> players;
    players.reserve(options.players);
    std::vector<whr::PlayerId> all_ids;
    all_ids.reserve(options.players);
    std::unordered_map<whr::PlayerId, double> true_skill_r;

    for (std::size_t i = 0; i < options.players; ++i) {
      const whr::PlayerId pid = static_cast<whr::PlayerId>(i + 1);
      players.push_back(whr_example::PlayerRecord{pid, handles[i]});
      all_ids.push_back(pid);
      true_skill_r.emplace(pid, skill_dist(rng));
    }

    ModeEngines engines(options);
    whr::TimePoint current_time = 0;
    std::size_t duel_count = 0;
    std::size_t team_small_count = 0;
    std::size_t team_large_count = 0;
    std::size_t ffa_count = 0;

    whr_example::ScopedTransaction tx(store.db());
    if (options.reset_db) reset_data_for_resimulation(store, options.job_id.has_value());
    store.insert_players(players);

    const double team_small_w2 = options.team_small_w2_elo.value_or(options.duel_w2_elo);
    const double team_large_w2 = options.team_large_w2_elo.value_or(options.duel_w2_elo);
    const std::string run_note =
        "seed=" + std::to_string(options.seed) +
        ", players=" + std::to_string(options.players) +
        ", matches=" + std::to_string(options.matches) +
        ", optimize_interval=" + std::to_string(options.optimize_interval) +
        ", final_optimize_iterations=" + std::to_string(options.final_optimize_iterations) +
        ", duel_w2_elo=" + std::to_string(options.duel_w2_elo) +
        ", team_small_w2_elo=" + std::to_string(team_small_w2) +
        ", team_large_w2_elo=" + std::to_string(team_large_w2) +
        ", duel_prior_games=" + std::to_string(options.duel_prior_games) +
        ", duel_max_step_elo=" + std::to_string(options.duel_max_step_elo);
    const std::int64_t run_id = store.create_rating_run(
        "simulation",
        "running",
        run_note);

    for (std::size_t i = 0; i < options.matches; ++i) {
      current_time += 1;
      const MatchMode mode = sample_mode(rng);
      whr::WhrEngine& mode_engine = engine_for_mode(engines, mode);
      whr::Match match = build_match(mode, current_time, all_ids, mode_engine, rng);
      match.winner_side_index = pick_winner(match, mode_engine, true_skill_r, rng);

      const std::int64_t db_match_id = store.insert_match(mode_to_text(mode), match);
      const whr::MatchId engine_match_id = mode_engine.add_match(match);
      mode_engine.incremental_update_for_match(engine_match_id);

      const std::vector<whr::PlayerId> participants = extract_unique_participants(match);
      for (whr::PlayerId pid : participants) {
        store.insert_rating_history(
            run_id,
            pid,
            db_match_id,
            match.time,
            mode_to_text(mode),
            mode_engine.rating_elo(pid, match.time),
            mode_engine.sigma_elo(pid, match.time),
            "simulation");
      }

      if (options.optimize_interval > 0 && (i + 1) % options.optimize_interval == 0) {
        engines.duel.optimize_all(8, 1e-6);
        engines.team_small.optimize_all(8, 1e-6);
        engines.team_large.optimize_all(8, 1e-6);
        engines.ffa.optimize_all(8, 1e-6);
      }

      if (mode == MatchMode::Duel) {
        ++duel_count;
      } else if (mode == MatchMode::TeamSmall) {
        ++team_small_count;
      } else if (mode == MatchMode::TeamLarge) {
        ++team_large_count;
      } else {
        ++ffa_count;
      }
    }

    if (options.final_optimize_iterations > 0) {
      engines.duel.optimize_all(options.final_optimize_iterations, 1e-6);
      engines.team_small.optimize_all(options.final_optimize_iterations, 1e-6);
      engines.team_large.optimize_all(options.final_optimize_iterations, 1e-6);
      engines.ffa.optimize_all(options.final_optimize_iterations, 1e-6);
    }
    for (whr::PlayerId pid : all_ids) {
      store.upsert_rating_snapshot(
          run_id,
          pid,
          "duel",
          engines.duel.rating_elo(pid, current_time),
          engines.duel.sigma_elo(pid, current_time));
      store.upsert_rating_snapshot(
          run_id,
          pid,
          "team_small",
          engines.team_small.rating_elo(pid, current_time),
          engines.team_small.sigma_elo(pid, current_time));
      store.upsert_rating_snapshot(
          run_id,
          pid,
          "team_large",
          engines.team_large.rating_elo(pid, current_time),
          engines.team_large.sigma_elo(pid, current_time));
      store.upsert_rating_snapshot(
          run_id,
          pid,
          "ffa",
          engines.ffa.rating_elo(pid, current_time),
          engines.ffa.sigma_elo(pid, current_time));
    }
    store.update_rating_run_status(run_id, "completed", "simulation completed");
    tx.commit();

    if (options.job_id) {
      store.mark_recalc_job_finished(
          *options.job_id,
          true,
          "resimulated players=" + std::to_string(options.players) +
              ", matches=" + std::to_string(options.matches));
    }

    std::cout << "Simulation complete.\n"
              << "DB: " << options.db_path << "\n"
              << "Players: " << options.players << "\n"
              << "Matches: " << options.matches << "\n"
              << "duel/team_small/team_large/ffa: " << duel_count << "/" << team_small_count << "/"
              << team_large_count << "/" << ffa_count << "\n";
    return 0;
  } catch (const std::exception& ex) {
    mark_failed_job_if_needed(options, argc, argv, ex.what());
    std::cerr << "whr_simulate failed: " << ex.what() << "\n";
    return 1;
  }
}

