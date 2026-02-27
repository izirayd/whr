import { createApiApp } from "./app.js";
import { loadConfig } from "./config.js";
import { RecalcRunner } from "./recalc-runner.js";
import { WhrRepository } from "./repository.js";

const config = loadConfig();
const repository = new WhrRepository(config.dbPath);
const recalcRunner = new RecalcRunner(config);
const app = createApiApp({ repository, recalcRunner });

const server = app.listen(config.port, () => {
  // Keep logs concise for local development.
  console.log(`WHR admin backend listening on http://localhost:${config.port}`);
  console.log(`SQLite DB: ${config.dbPath}`);
});

function shutdown(signal: string): void {
  console.log(`Shutting down backend (${signal})...`);
  server.close(() => {
    repository.close();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

