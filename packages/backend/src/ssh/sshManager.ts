/**
 * SSH connection manager — pool of persistent SSH connections.
 * Handles connect, disconnect, SFTP, exec, and shell for remote projects.
 */

import { Client, type ClientChannel, type ConnectConfig } from "ssh2";
import type { SSHConnectionConfig } from "@cgui/shared";

interface SSHConnection {
  client: Client;
  config: SSHConnectionConfig;
  lastUsed: number;
}

const connections = new Map<string, SSHConnection>();

function connectionKey(config: SSHConnectionConfig): string {
  return `${config.username}@${config.host}:${config.port}`;
}

function buildConnectConfig(config: SSHConnectionConfig): ConnectConfig {
  const cfg: ConnectConfig = {
    host: config.host,
    port: config.port || 22,
    username: config.username,
    readyTimeout: 10000,
    keepaliveInterval: 30000,
  };
  if (config.privateKey) {
    cfg.privateKey = config.privateKey;
  } else if (config.password) {
    cfg.password = config.password;
  }
  return cfg;
}

/** Get or create an SSH connection. */
function getConnection(config: SSHConnectionConfig): Promise<Client> {
  const key = connectionKey(config);
  const existing = connections.get(key);
  if (existing && existing.client.readyState === "open") {
    existing.lastUsed = Date.now();
    return Promise.resolve(existing.client);
  }

  // Clean up stale connection
  if (existing) {
    existing.client.end();
    connections.delete(key);
  }

  return new Promise((resolve, reject) => {
    const client = new Client();
    const connectConfig = buildConnectConfig(config);

    client.on("ready", () => {
      connections.set(key, { client, config, lastUsed: Date.now() });
      resolve(client);
    });

    client.on("error", (err) => {
      client.end();
      reject(err);
    });

    client.on("close", () => {
      connections.delete(key);
    });

    client.connect(connectConfig);
  });
}

/** Test SSH connection — resolves on success, rejects with error message. */
export async function testSSHConnection(config: SSHConnectionConfig): Promise<void> {
  const client = await getConnection(config);
  // Verify we can access the remote path
  await execCommand(client, `test -d "${config.remotePath}" && echo OK || echo MISSING`);
  // Don't keep the test connection alive
  disconnect(config);
}

/** Execute a command on the remote and return stdout. */
export function execCommand(client: Client, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    client.exec(command, (err, stream) => {
      if (err) return reject(err);
      let stdout = "";
      let stderr = "";
      stream.on("data", (data: Buffer) => { stdout += data.toString(); });
      stream.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });
      stream.on("close", (code: number | null) => {
        if (code !== 0 && stderr) {
          reject(new Error(stderr.trim()));
        } else {
          resolve(stdout.trim());
        }
      });
    });
  });
}

/** List directory contents on the remote. */
export async function listRemoteDir(config: SSHConnectionConfig, dirPath: string): Promise<{ name: string; isDirectory: boolean; size: number; mtime: number }[]> {
  const client = await getConnection(config);
  return new Promise((resolve, reject) => {
    client.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.readdir(dirPath, (err, entries) => {
        if (err) return reject(err);
        const result = entries.map((e) => ({
          name: e.filename,
          isDirectory: e.attrs.isDirectory(),
          size: e.attrs.size || 0,
          mtime: e.attrs.mtime || 0,
        }));
        resolve(result);
      });
    });
  });
}

/** Read a text file from the remote. Max 200KB. */
export async function readRemoteFile(config: SSHConnectionConfig, filePath: string): Promise<string> {
  const client = await getConnection(config);
  return new Promise((resolve, reject) => {
    client.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.open(filePath, "r", (err, handle) => {
        if (err) return reject(err);
        sftp.fstat(handle, (err, stats) => {
          if (err) return reject(err);
          const size = Math.min(stats.size, 200 * 1024);
          const buf = Buffer.alloc(size);
          sftp.read(handle, buf, 0, size, 0, (err) => {
            if (err) return reject(err);
            sftp.close(handle, () => {});
            resolve(buf.toString("utf-8"));
          });
        });
      });
    });
  });
}

/** Create an SSH shell session (for terminal). */
export function createRemoteShell(
  config: SSHConnectionConfig,
  onData: (data: string) => void,
  onClose: (code: number | null) => void,
): Promise<{ stream: ClientChannel; setWindow: (cols: number, rows: number) => void }> {
  return getConnection(config).then((client) => {
    return new Promise((resolve, reject) => {
      client.shell(
        { term: "xterm-256color", cols: 120, rows: 40 },
        (err, stream) => {
          if (err) return reject(err);
          stream.on("data", (data: Buffer) => onData(data.toString()));
          stream.on("close", () => onClose(stream.exitCode ?? null));
          resolve({
            stream,
            setWindow: (cols: number, rows: number) => {
              stream.setWindow(rows, cols, 0, 0);
            },
          });
        },
      );
    });
  });
}

/** Disconnect and remove a connection. */
export function disconnect(config: SSHConnectionConfig): void {
  const key = connectionKey(config);
  const entry = connections.get(key);
  if (entry) {
    entry.client.end();
    connections.delete(key);
  }
}

/** Disconnect all connections. */
export function disconnectAll(): void {
  connections.forEach((entry) => {
    entry.client.end();
  });
  connections.clear();
}

/** Clean up idle connections (older than 5 minutes). */
setInterval(() => {
  const now = Date.now();
  connections.forEach((entry, key) => {
    if (now - entry.lastUsed > 5 * 60_000) {
      entry.client.end();
      connections.delete(key);
    }
  });
}, 60_000);
