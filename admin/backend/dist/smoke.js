import assert from "node:assert/strict";
import { createApiApp } from "./app.js";
import { loadConfig } from "./config.js";
import { RecalcRunner } from "./recalc-runner.js";
import { WhrRepository } from "./repository.js";
async function sleep(ms) {
    await new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
async function main() {
    const config = loadConfig();
    const repository = new WhrRepository(config.dbPath);
    const app = createApiApp({
        repository,
        recalcRunner: new RecalcRunner(config)
    });
    const server = app.listen(0);
    await new Promise((resolve) => {
        server.once("listening", () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === "string") {
        server.close();
        repository.close();
        throw new Error("Failed to bind smoke server");
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;
    try {
        const healthBefore = await fetch(`${baseUrl}/api/health`).then((r) => r.json());
        assert.equal(healthBefore.ok, true);
        const players = await fetch(`${baseUrl}/api/players?page=1&pageSize=10`).then((r) => r.json());
        assert(players.total > 0, "players list must not be empty");
        assert(players.items.length > 0, "players payload must include rows");
        const firstPlayerId = players.items[0].id;
        const profile = await fetch(`${baseUrl}/api/players/${firstPlayerId}`).then((r) => r.json());
        assert.equal(profile.player.id, firstPlayerId, "profile endpoint must return selected player");
        const startResponse = await fetch(`${baseUrl}/api/admin/recalculate`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                playersLimit: 30,
                matchesLimit: 400
            })
        }).then((r) => r.json());
        assert(startResponse.job?.id > 0, "recalculate endpoint must return job id");
        const deadlineAt = Date.now() + 180000;
        let finalJob = null;
        while (Date.now() < deadlineAt) {
            const job = await fetch(`${baseUrl}/api/admin/recalculate/${startResponse.job.id}`).then((r) => r.json());
            if (job.status === "success" || job.status === "failed") {
                finalJob = job;
                break;
            }
            await sleep(2000);
        }
        assert(finalJob, "recalculate job did not finish within timeout");
        assert.equal(finalJob?.status, "success", `recalculate job failed: ${finalJob?.message ?? "unknown error"}`);
        const healthAfter = await fetch(`${baseUrl}/api/health`).then((r) => r.json());
        assert.equal(healthAfter.ok, true);
        assert(healthAfter.latestSnapshotAt, "latestSnapshotAt should be set after recalculation");
        if (healthBefore.latestSnapshotAt) {
            assert.notEqual(healthAfter.latestSnapshotAt, healthBefore.latestSnapshotAt, "latestSnapshotAt should change after recalculation");
        }
        console.log("Backend smoke passed.");
    }
    finally {
        await new Promise((resolve) => {
            server.close(() => resolve());
        });
        repository.close();
    }
}
main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Backend smoke failed: ${message}`);
    process.exit(1);
});
