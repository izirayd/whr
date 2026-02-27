import fs from "node:fs";
import { spawn } from "node:child_process";
export class RecalcRunner {
    config;
    constructor(config) {
        this.config = config;
    }
    start(jobId, options = {}) {
        return this.startWithExecutable(this.resolveExecutable(this.config.simulationExecutableCandidates, "whr_simulate"), jobId, options, true);
    }
    startRecalc(jobId, options = {}) {
        return this.startWithExecutable(this.resolveExecutable(this.config.recalcExecutableCandidates, "whr_recalc"), jobId, options, false);
    }
    startWithExecutable(executable, jobId, options = {}, includeSimulationOptimizeArgs) {
        const args = ["--db", this.config.dbPath, "--job-id", String(jobId)];
        if (options.duelW2Elo !== undefined)
            args.push("--duel-w2-elo", String(options.duelW2Elo));
        if (options.teamSmallW2Elo !== undefined) {
            args.push("--team-small-w2-elo", String(options.teamSmallW2Elo));
        }
        if (options.teamLargeW2Elo !== undefined) {
            args.push("--team-large-w2-elo", String(options.teamLargeW2Elo));
        }
        if (options.duelPriorGames !== undefined)
            args.push("--duel-prior-games", String(options.duelPriorGames));
        if (options.duelMaxStepElo !== undefined) {
            args.push("--duel-max-step-elo", String(options.duelMaxStepElo));
        }
        if (options.playersLimit !== undefined)
            args.push("--players", String(options.playersLimit));
        if (options.matchesLimit !== undefined)
            args.push("--matches", String(options.matchesLimit));
        if (includeSimulationOptimizeArgs) {
            if (options.optimizeInterval !== undefined) {
                args.push("--optimize-interval", String(options.optimizeInterval));
            }
            if (options.finalOptimizeIterations !== undefined) {
                args.push("--final-optimize-iterations", String(options.finalOptimizeIterations));
            }
        }
        const child = spawn(executable, args, {
            cwd: this.config.repoRoot,
            detached: true,
            stdio: "ignore",
            windowsHide: true
        });
        child.once("error", () => {
            // Prevent unhandled child process errors from crashing backend.
        });
        if (!child.pid) {
            throw new Error("Failed to start whr_simulate process");
        }
        child.unref();
        return executable;
    }
    resolveExecutable(candidates, executableName) {
        for (const candidate of candidates) {
            if (fs.existsSync(candidate))
                return candidate;
        }
        throw new Error(`${executableName} executable not found. Checked: ${candidates.join(", ")}`);
    }
}
