/**
 * Charming UI Backend — Entry point.
 * Boots Express + WebSocket server.
 */

import http from "http";
import { createApp } from "./app";
import { createWSServer } from "./ws/wsServer";
import { config } from "./utils/config";
import { createLogger } from "./utils/logger";

const log = createLogger("server");

async function main() {
  // Check for API key
  if (!config.anthropicApiKey) {
    log.warn(
      "ANTHROPIC_API_KEY not set. Set it in .env or environment variables."
    );
    log.warn(
      "The server will start, but Claude agent queries will fail until an API key is configured."
    );
  }

  const app = createApp();
  const server = http.createServer(app);

  // Attach WebSocket server to the same HTTP server
  createWSServer(server);

  server.listen(config.port, () => {
    log.info("╔══════════════════════════════════════╗");
    log.info("║     Charming UI Backend Server        ║");
    log.info("╠══════════════════════════════════════╣");
    log.info({ port: config.port }, "║ HTTP + WS server listening");
    log.info({ url: config.frontendUrl }, "║ Frontend origin");
    log.info({ home: config.cguiHome }, "║ Data directory");
    log.info("╚══════════════════════════════════════╝");
  });

  // Graceful shutdown
  const shutdown = () => {
    log.info("Shutting down gracefully...");
    server.close(() => {
      log.info("Server closed");
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  log.error({ err }, "Failed to start server");
  process.exit(1);
});
