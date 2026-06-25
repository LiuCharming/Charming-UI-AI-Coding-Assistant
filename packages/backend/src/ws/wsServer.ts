/**
 * WebSocket server setup using the `ws` library.
 */

import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import type { ServerMessage, ClientMessage } from "@cgui/shared";
import { createLogger } from "../utils/logger";
import { handleMessage } from "./messageRouter";
import { stopTerminal } from "../terminal/terminalManager";

const log = createLogger("ws");

const clients = new Set<WebSocket>();

export function createWSServer(httpServer: Server) {
  const wss = new WebSocketServer({
    server: httpServer,
    path: "/ws",
  });

  wss.on("connection", (ws: WebSocket) => {
    log.info("WebSocket client connected");
    clients.add(ws);

    // Send welcome message
    sendMessage(ws, {
      type: "system",
      payload: {
        sessionId: "",
        message: "Connected to CGUI server",
      },
    });

    ws.on("message", (raw) => {
      try {
        const data = JSON.parse(raw.toString()) as ClientMessage;
        log.debug({ type: data.type }, "Received WS message");
        handleMessage(ws, data);
      } catch (err) {
        log.error({ err }, "Failed to parse WebSocket message");
        sendMessage(ws, {
          type: "error",
          payload: {
            message: "Invalid message format",
            code: "PARSE_ERROR",
          },
        });
      }
    });

    ws.on("close", () => {
      log.info("WebSocket client disconnected");
      stopTerminal(ws);
      clients.delete(ws);
    });

    ws.on("error", (err) => {
      log.error({ err }, "WebSocket error");
      clients.delete(ws);
    });
  });

  log.info("WebSocket server initialized on /ws");

  return wss;
}

export function sendMessage(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function broadcast(msg: ServerMessage): void {
  const data = JSON.stringify(msg);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}
