import cors from "cors";
import express from "express";
function isSqliteBusyError(error) {
    if (!error || typeof error !== "object")
        return false;
    const candidate = error;
    return candidate.code === "SQLITE_BUSY";
}
function parsePositiveInt(raw, fallback, maxValue) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0)
        return fallback;
    return Math.min(Math.floor(value), maxValue);
}
function parseOptionalInt(raw) {
    if (raw === undefined || raw === null || raw === "")
        return undefined;
    const value = Number(raw);
    if (!Number.isFinite(value))
        return undefined;
    return Math.floor(value);
}
function parseOptionalBool(raw) {
    if (typeof raw !== "string")
        return undefined;
    const lowered = raw.trim().toLowerCase();
    if (lowered === "1" || lowered === "true" || lowered === "yes")
        return true;
    if (lowered === "0" || lowered === "false" || lowered === "no")
        return false;
    return undefined;
}
function parseScope(raw) {
    if (raw === "duel" || raw === "team_small" || raw === "team_large" || raw === "ffa")
        return raw;
    return undefined;
}
function parseMode(raw) {
    return parseScope(raw);
}
function parseOptionalNonNegativeNumber(raw, fieldName) {
    if (raw === undefined || raw === null || raw === "")
        return undefined;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
        throw new Error(`${fieldName} must be a non-negative number`);
    }
    return value;
}
function parseOptionalPositiveNumber(raw, fieldName) {
    if (raw === undefined || raw === null || raw === "")
        return undefined;
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${fieldName} must be a positive number`);
    }
    return value;
}
function parseOptionalPositiveInteger(raw, fieldName) {
    if (raw === undefined || raw === null || raw === "")
        return undefined;
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
        throw new Error(`${fieldName} must be a positive integer`);
    }
    return value;
}
function parseRequiredPositiveInteger(raw, fieldName) {
    if (raw === undefined || raw === null || raw === "") {
        throw new Error(`${fieldName} is required`);
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
        throw new Error(`${fieldName} must be a positive integer`);
    }
    return value;
}
function parseOptionalNonNegativeInteger(raw, fieldName) {
    if (raw === undefined || raw === null || raw === "")
        return undefined;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
        throw new Error(`${fieldName} must be a non-negative integer`);
    }
    return value;
}
function parseRecalcLaunchOptions(raw) {
    if (raw === undefined || raw === null)
        return {};
    if (typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error("Request body must be a JSON object");
    }
    const payload = raw;
    return {
        duelW2Elo: parseOptionalNonNegativeNumber(payload.duelW2Elo, "duelW2Elo"),
        teamSmallW2Elo: parseOptionalNonNegativeNumber(payload.teamSmallW2Elo, "teamSmallW2Elo"),
        teamLargeW2Elo: parseOptionalNonNegativeNumber(payload.teamLargeW2Elo, "teamLargeW2Elo"),
        duelPriorGames: parseOptionalNonNegativeNumber(payload.duelPriorGames, "duelPriorGames"),
        duelMaxStepElo: parseOptionalPositiveNumber(payload.duelMaxStepElo, "duelMaxStepElo"),
        optimizeInterval: parseOptionalNonNegativeInteger(payload.optimizeInterval, "optimizeInterval"),
        finalOptimizeIterations: parseOptionalNonNegativeInteger(payload.finalOptimizeIterations, "finalOptimizeIterations"),
        playersLimit: parseOptionalPositiveInteger(payload.playersLimit, "playersLimit"),
        matchesLimit: parseOptionalPositiveInteger(payload.matchesLimit, "matchesLimit")
    };
}
function parseCreateDuelPayload(raw) {
    if (raw === undefined || raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error("Request body must be a JSON object");
    }
    const payload = raw;
    const playerAId = parseRequiredPositiveInteger(payload.playerAId, "playerAId");
    const playerBId = parseRequiredPositiveInteger(payload.playerBId, "playerBId");
    const winnerPlayerId = parseRequiredPositiveInteger(payload.winnerPlayerId, "winnerPlayerId");
    const playedAt = parseOptionalNonNegativeInteger(payload.playedAt, "playedAt");
    if (playerAId === playerBId) {
        throw new Error("playerAId and playerBId must be different");
    }
    if (winnerPlayerId !== playerAId && winnerPlayerId !== playerBId) {
        throw new Error("winnerPlayerId must match one of selected players");
    }
    return {
        duelInput: {
            playerAId,
            playerBId,
            winnerPlayerId,
            playedAt
        },
        recalcOptions: parseRecalcLaunchOptions(payload.recalcOptions)
    };
}
export function createApiApp(services) {
    const app = express();
    app.use(cors());
    app.use(express.json());
    app.get("/api/health", (_req, res) => {
        try {
            res.json({
                ok: true,
                latestSnapshotAt: services.repository.getLatestSnapshotTimestamp()
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error("[health]", message);
            res.status(500).json({ error: message });
        }
    });
    app.get("/api/players", (req, res) => {
        try {
            const page = parsePositiveInt(req.query.page, 1, 1000000);
            const pageSize = parsePositiveInt(req.query.pageSize, 25, 200);
            const search = typeof req.query.search === "string" ? req.query.search : "";
            const scope = parseScope(req.query.scope) ?? "duel";
            const latestRunOnly = parseOptionalBool(req.query.latestRunOnly) ?? true;
            const payload = services.repository.listPlayers(search, page, pageSize, scope, latestRunOnly);
            res.json({
                page,
                pageSize,
                scope,
                latestRunOnly,
                ...payload
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error("[players]", message);
            res.status(500).json({ error: message });
        }
    });
    app.get("/api/players/:id", (req, res) => {
        try {
            const playerId = Number(req.params.id);
            if (!Number.isFinite(playerId) || playerId <= 0) {
                res.status(400).json({ error: "Invalid player id" });
                return;
            }
            const historyLimit = parsePositiveInt(req.query.historyLimit, 300, 5000);
            const matchesLimit = parsePositiveInt(req.query.matchesLimit, 50, 1000000);
            const scope = parseScope(req.query.scope) ?? "duel";
            const profile = services.repository.getPlayerProfile(playerId, historyLimit, matchesLimit, scope);
            if (!profile) {
                res.status(404).json({ error: "Player not found" });
                return;
            }
            res.json(profile);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error("[player profile]", message);
            res.status(500).json({ error: message });
        }
    });
    app.get("/api/matches", (req, res) => {
        try {
            const page = parsePositiveInt(req.query.page, 1, 1000000);
            const pageSize = parsePositiveInt(req.query.pageSize, 40, 200);
            const latestRunOnly = parseOptionalBool(req.query.latestRunOnly) ?? false;
            const payload = services.repository.listMatches({
                mode: parseMode(req.query.mode),
                playerId: parseOptionalInt(req.query.playerId),
                fromTime: parseOptionalInt(req.query.fromTime),
                toTime: parseOptionalInt(req.query.toTime),
                latestRunOnly,
                page,
                pageSize
            });
            res.json({
                page,
                pageSize,
                latestRunOnly,
                ...payload
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error("[matches]", message);
            res.status(500).json({ error: message });
        }
    });
    app.post("/api/admin/duels", (req, res) => {
        let payload;
        try {
            payload = parseCreateDuelPayload(req.body);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            res.status(400).json({ error: message });
            return;
        }
        const activeJob = services.repository.getLatestActiveRecalcJob();
        if (activeJob) {
            res.status(409).json({
                error: "Re-simulation is already running. Please wait until it finishes.",
                job: activeJob
            });
            return;
        }
        let match;
        try {
            match = services.repository.createDuelMatch(payload.duelInput);
        }
        catch (error) {
            if (isSqliteBusyError(error)) {
                res.status(503).json({
                    error: "Database is busy. Please retry in a moment."
                });
                return;
            }
            const message = error instanceof Error ? error.message : String(error);
            if (message.startsWith("Players not found:")) {
                res.status(404).json({ error: message });
                return;
            }
            res.status(400).json({ error: message });
            return;
        }
        let job;
        try {
            job = services.repository.createRecalcJob();
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error("[create duel recalc job]", message);
            res.status(500).json({
                error: "Duel was recorded, but failed to create recalculation job",
                details: message,
                match
            });
            return;
        }
        try {
            const executable = services.recalcRunner.startRecalc(job.id, payload.recalcOptions);
            res.status(202).json({
                match,
                job,
                executable,
                launchOptions: payload.recalcOptions
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            services.repository.markRecalcJobFailed(job.id, message);
            res.status(500).json({
                error: "Duel recorded, but failed to start re-simulation",
                details: message,
                match,
                job
            });
        }
    });
    app.post("/api/admin/recalculate", (req, res) => {
        let launchOptions;
        try {
            launchOptions = parseRecalcLaunchOptions(req.body);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            res.status(400).json({ error: message });
            return;
        }
        let job;
        try {
            job = services.repository.createRecalcJob();
        }
        catch (error) {
            if (isSqliteBusyError(error)) {
                const activeJob = services.repository.getLatestActiveRecalcJob();
                if (activeJob) {
                    res.status(202).json({
                        job: activeJob,
                        executable: null,
                        launchOptions,
                        alreadyRunning: true
                    });
                    return;
                }
                res.status(503).json({
                    error: "Database is busy. Re-simulation is already running; please retry later."
                });
                return;
            }
            const message = error instanceof Error ? error.message : String(error);
            console.error("[recalculate]", message);
            res.status(500).json({ error: message });
            return;
        }
        try {
            const executable = services.recalcRunner.start(job.id, launchOptions);
            res.status(202).json({
                job,
                executable,
                launchOptions
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            services.repository.markRecalcJobFailed(job.id, message);
            res.status(500).json({
                error: "Failed to start re-simulation",
                details: message
            });
        }
    });
    app.get("/api/admin/recalculate/:jobId", (req, res) => {
        try {
            const jobId = Number(req.params.jobId);
            if (!Number.isFinite(jobId) || jobId <= 0) {
                res.status(400).json({ error: "Invalid job id" });
                return;
            }
            const job = services.repository.getRecalcJob(jobId);
            if (!job) {
                res.status(404).json({ error: "Job not found" });
                return;
            }
            res.json(job);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error("[recalculate status]", message);
            res.status(500).json({ error: message });
        }
    });
    return app;
}
