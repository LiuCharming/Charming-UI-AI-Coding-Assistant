/**
 * Terminal manager — manages PTY instances per WebSocket connection.
 * Each connection can have one active PTY shell at a time.
 */

import { spawn, IPty } from "node-pty";
import type { WebSocket } from "ws";
import { sendMessage } from "../ws/wsServer";
import { createLogger } from "../utils/logger";

const log = createLogger("terminal");

interface TerminalSession {
  pty: IPty;
  ws: WebSocket;
  cwd: string;
}

const terminals = new Map<WebSocket, TerminalSession>();

export function startTerminal(
  ws: WebSocket,
  cwd: string,
  shell?: string,
  condaEnv?: string
): void {
  // Kill existing terminal for this connection if any
  stopTerminal(ws);

  const shellPath =
    shell ||
    process.env.SHELL ||
    (process.platform === "win32" ? "powershell.exe" : "/bin/sh");

  const shellArgs: string[] = [];

  log.info({ cwd, shell: shellPath, condaEnv }, "Starting PTY");

  const pty = spawn(shellPath, shellArgs, {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd: cwd || process.cwd(),
    env: { ...process.env, TERM: "xterm-256color" } as { [key: string]: string },
  });

  // Forward PTY output to client
  pty.onData((data: string) => {
    sendMessage(ws, { type: "terminal_output", payload: { data } });
  });

  // Handle PTY exit
  pty.onExit(({ exitCode, signal }) => {
    log.info({ exitCode, signal }, "PTY process exited");
    sendMessage(ws, {
      type: "terminal_exit",
      payload: { exitCode },
    });
    terminals.delete(ws);
  });

  terminals.set(ws, { pty, ws, cwd });

  // ── Auto-activate conda environment if requested ──
  if (condaEnv) {
    // Allow the shell to initialise, then inject conda activate
    setTimeout(() => {
      pty.write(`conda activate ${condaEnv}\r`);
    }, 400);
  }
}

export function writeToTerminal(ws: WebSocket, data: string): void {
  const session = terminals.get(ws);
  if (session) {
    session.pty.write(data);
  }
}

export function resizeTerminal(
  ws: WebSocket,
  cols: number,
  rows: number
): void {
  const session = terminals.get(ws);
  if (session) {
    session.pty.resize(cols, rows);
  }
}

export function stopTerminal(ws: WebSocket): void {
  const session = terminals.get(ws);
  if (session) {
    session.pty.kill();
    terminals.delete(ws);
    log.info("PTY stopped");
  }
}

export function getActiveTerminal(
  ws: WebSocket
): TerminalSession | undefined {
  return terminals.get(ws);
}
