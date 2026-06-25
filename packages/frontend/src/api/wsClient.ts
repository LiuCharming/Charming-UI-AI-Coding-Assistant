/**
 * WebSocket client singleton with automatic reconnection.
 */

import type { ClientMessage, ServerMessage } from "@cgui/shared";
import { toast as sonner } from "sonner";

type MessageHandler = (msg: ServerMessage) => void;
type StatusHandler = (status: "connecting" | "connected" | "disconnected") => void;

class WSClient {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers: Set<MessageHandler> = new Set();
  private statusHandlers: Set<StatusHandler> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private shouldReconnect = true;

  constructor() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    this.url = `${protocol}//${window.location.host}/ws`;
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.notifyStatus("connecting");

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.notifyStatus("connected");
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as ServerMessage;
          this.handlers.forEach((handler) => {
            try {
              handler(msg);
            } catch (err) {
              sonner.error("Internal message error");
            }
          });
        } catch {
          sonner.error("Connection error: invalid message received");
        }
      };

      this.ws.onclose = () => {
        this.notifyStatus("disconnected");
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        sonner.error("WebSocket connection error");
      };
    } catch {
      sonner.error("Failed to connect to server");
      this.scheduleReconnect();
    }
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  send(msg: ClientMessage): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      sonner.warning("Reconnecting to server...");
      this.connect();
      return false;
    }
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  onStatusChange(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  get status(): "connecting" | "connected" | "disconnected" {
    if (!this.ws) return "disconnected";
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return "connecting";
      case WebSocket.OPEN:
        return "connected";
      default:
        return "disconnected";
    }
  }

  private scheduleReconnect() {
    if (!this.shouldReconnect) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      sonner.error("Connection lost — max retries reached");
      return;
    }

    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts) + Math.random() * 1000,
      30_000
    );
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private notifyStatus(status: "connecting" | "connected" | "disconnected") {
    this.statusHandlers.forEach((h) => {
      try {
        h(status);
      } catch {}
    });
  }
}

export const wsClient = new WSClient();
