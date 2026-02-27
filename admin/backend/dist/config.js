import path from "node:path";
import { fileURLToPath } from "node:url";
function parsePort(raw, fallback) {
    if (!raw)
        return fallback;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}
export function loadConfig() {
    const srcDir = fileURLToPath(new URL(".", import.meta.url));
    const backendRoot = path.resolve(srcDir, "..");
    const repoRoot = path.resolve(backendRoot, "..", "..");
    const dbPath = process.env.WHR_DB_PATH ?? path.join(repoRoot, "data", "whr_simulation.sqlite");
    const simulationExecutableCandidates = [
        process.env.WHR_SIMULATE_EXE,
        path.join(repoRoot, "build", "bin", "whr_simulate.exe"),
        path.join(repoRoot, "build", "bin", "Debug", "whr_simulate.exe"),
        path.join(repoRoot, "build", "Debug", "whr_simulate.exe"),
        path.join(repoRoot, "build", "whr_simulate.exe")
    ].filter((entry) => Boolean(entry && entry.trim().length > 0));
    const recalcExecutableCandidates = [
        process.env.WHR_RECALC_EXE,
        path.join(repoRoot, "build", "bin", "whr_recalc.exe"),
        path.join(repoRoot, "build", "bin", "Debug", "whr_recalc.exe"),
        path.join(repoRoot, "build", "Debug", "whr_recalc.exe"),
        path.join(repoRoot, "build", "whr_recalc.exe")
    ].filter((entry) => Boolean(entry && entry.trim().length > 0));
    return {
        repoRoot,
        dbPath,
        simulationExecutableCandidates,
        recalcExecutableCandidates,
        port: parsePort(process.env.WHR_ADMIN_PORT, 3001)
    };
}
