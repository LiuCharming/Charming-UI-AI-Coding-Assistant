/**
 * Terminal store — manages the bottom terminal panel state.
 */

import { create } from "zustand";
import { rest } from "@/api/restClient";

const STORAGE_KEY = "charming-terminal-height";
const SHELL_KEY = "charming-terminal-shell";
const CONDA_KEY = "charming-terminal-conda";

export interface ShellOption {
  label: string;
  value: string; // path to the shell executable
}

export interface CondaEnvOption {
  name: string;
  path: string;
}

// Ordered list of shells to try on each platform
const WINDOWS_SHELLS: ShellOption[] = [
  { label: "PowerShell", value: "powershell.exe" },
  { label: "PowerShell 7", value: "pwsh.exe" },
  { label: "CMD", value: "cmd.exe" },
  { label: "Git Bash", value: "C:\\Program Files\\Git\\bin\\bash.exe" },
  { label: "WSL", value: "wsl.exe" },
];

const UNIX_SHELLS: ShellOption[] = [
  { label: "bash", value: "/bin/bash" },
  { label: "zsh", value: "/bin/zsh" },
  { label: "fish", value: "/bin/fish" },
  { label: "sh", value: "/bin/sh" },
];

function getPlatformShells(): ShellOption[] {
  const ua = navigator.userAgent || "";
  const pf = navigator.platform || "";
  const isWin = ua.includes("Windows") || pf.startsWith("Win");
  return isWin ? WINDOWS_SHELLS : UNIX_SHELLS;
}

function getDefaultShell(): string {
  const shells = getPlatformShells();
  const saved = (() => {
    try { return localStorage.getItem(SHELL_KEY); } catch { return null; }
  })();
  if (saved && shells.some((s) => s.value === saved)) return saved;
  return shells[0]?.value || "powershell.exe";
}

function getSavedCondaEnv(): string {
  try {
    return localStorage.getItem(CONDA_KEY) || "";
  } catch {
    return "";
  }
}

interface TerminalState {
  isOpen: boolean;
  height: number;
  isRunning: boolean;
  selectedShell: string;
  availableShells: ShellOption[];
  // Conda
  availableCondaEnvs: CondaEnvOption[];
  selectedCondaEnv: string;
  condaLoading: boolean;

  toggle: () => void;
  setOpen: (open: boolean) => void;
  setHeight: (h: number) => void;
  setRunning: (running: boolean) => void;
  setSelectedShell: (shell: string) => void;
  loadCondaEnvs: () => Promise<void>;
  setSelectedCondaEnv: (name: string) => void;
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  isOpen: false,
  height: (() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? Number(saved) : 280;
    } catch {
      return 280;
    }
  })(),
  isRunning: false,
  availableShells: getPlatformShells(),
  selectedShell: getDefaultShell(),
  availableCondaEnvs: [],
  selectedCondaEnv: getSavedCondaEnv(),
  condaLoading: false,

  toggle: () => {
    const next = !get().isOpen;
    set({ isOpen: next });
  },
  setOpen: (open) => set({ isOpen: open }),
  setHeight: (h) => {
    set({ height: h });
    try { localStorage.setItem(STORAGE_KEY, String(h)); } catch {}
  },
  setRunning: (running) => set({ isRunning: running }),
  setSelectedShell: (shell) => {
    set({ selectedShell: shell });
    try { localStorage.setItem(SHELL_KEY, shell); } catch {}
  },

  loadCondaEnvs: async () => {
    set({ condaLoading: true });
    try {
      const data = await rest.get<{ envs: CondaEnvOption[] }>("/conda-envs");
      set({ availableCondaEnvs: data.envs });
    } catch {
      // conda not installed or endpoint unreachable — silently ignore
      set({ availableCondaEnvs: [] });
    } finally {
      set({ condaLoading: false });
    }
  },

  setSelectedCondaEnv: (name) => {
    set({ selectedCondaEnv: name });
    try { localStorage.setItem(CONDA_KEY, name); } catch {}
  },
}));
