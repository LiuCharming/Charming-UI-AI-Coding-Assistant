/**
 * Terminal panel — xterm.js-based PTY terminal.
 * Supports shell environment selection and conda environment activation.
 */

import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { ChevronDown } from "lucide-react";
import "@xterm/xterm/css/xterm.css";
import { wsClient } from "@/api/wsClient";
import { useProjectStore } from "@/store/projectStore";
import { useSessionStore } from "@/store/sessionStore";
import { useTerminalStore } from "@/store/terminalStore";

export function TerminalPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const { activeProjectId, projects } = useProjectStore();
  const {
    setRunning,
    selectedShell,
    availableShells,
    setSelectedShell,
    selectedCondaEnv,
    availableCondaEnvs,
    loadCondaEnvs,
    setSelectedCondaEnv,
  } = useTerminalStore();

  // ── Fetch conda envs on first open ──
  const hasLoadedConda = useRef(false);
  useEffect(() => {
    if (!hasLoadedConda.current) {
      hasLoadedConda.current = true;
      loadCondaEnvs();
    }
  }, [loadCondaEnvs]);

  // ── Create and manage the xterm instance ──
  useEffect(() => {
    const terminal = new Terminal({
      fontSize: 13,
      fontFamily:
        "'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace",
      theme: {
        background: "#0d1117",
        foreground: "#c9d1d9",
        cursor: "#c9d1d9",
        selectionBackground: "#264f78",
      },
      cursorBlink: true,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    if (containerRef.current) {
      terminal.open(containerRef.current);
      requestAnimationFrame(() => fitAddon.fit());
    }

    // ── Forward user input to backend ──
    const inputDisposable = terminal.onData((data) => {
      wsClient.send({ type: "terminal_input", payload: { data } });
    });

    // ── Handle container resize ──
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      const { cols, rows } = terminal;
      if (cols > 0 && rows > 0) {
        wsClient.send({ type: "terminal_resize", payload: { cols, rows } });
      }
    });
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // ── Start the PTY on the backend ──
    const activeProject = projects.find((p) => p.id === activeProjectId);
    const cwd = activeProject?.path || ".";
    const sessionId =
      useSessionStore.getState().activeSessionId || `session_${Date.now()}`;

    wsClient.send({
      type: "terminal_start",
      payload: {
        sessionId,
        cwd,
        shell: selectedShell,
        condaEnv: selectedCondaEnv || undefined,
      },
    });
    setRunning(true);

    // ── Handle server → client terminal messages ──
    const unsub = wsClient.onMessage((msg) => {
      if (msg.type === "terminal_output") {
        terminal.write(msg.payload.data);
      } else if (msg.type === "terminal_exit") {
        setRunning(false);
        terminal.writeln(
          `\r\n\n\x1b[33m[Process exited with code ${msg.payload.exitCode}]\x1b[0m`
        );
      }
    });

    return () => {
      resizeObserver.disconnect();
      inputDisposable.dispose();
      unsub();
      terminal.dispose();
      wsClient.send({ type: "terminal_stop" });
      setRunning(false);
    };
    // Recreate when project, shell, or conda env changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId, projects, selectedShell, selectedCondaEnv]);

  const handleShellChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setSelectedShell(e.target.value);
    },
    [setSelectedShell]
  );

  const handleCondaChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setSelectedCondaEnv(e.target.value);
    },
    [setSelectedCondaEnv]
  );

  return (
    <div className="h-full w-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between h-8 px-3 flex-shrink-0 bg-[#161b22] border-b border-[#30363d] select-none">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
          <span className="text-[11px] text-[#8b949e] font-medium tracking-wide">
            TERMINAL
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Conda environment selector */}
          {availableCondaEnvs.length > 0 && (
            <div className="relative">
              <select
                value={selectedCondaEnv}
                onChange={handleCondaChange}
                className="appearance-none bg-transparent text-[11px] text-[#58a6ff] pl-2 pr-5 py-0.5 rounded border border-[#1f6feb]/30 hover:border-[#58a6ff] focus:outline-none focus:border-[#58a6ff] cursor-pointer transition-colors max-w-[160px] truncate"
                title="Select conda environment"
              >
                <option value="">(base)</option>
                {availableCondaEnvs.map((env) => (
                  <option key={env.name} value={env.name}>
                    {env.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={10}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#8b949e] pointer-events-none"
              />
            </div>
          )}
          {/* Shell selector */}
          <div className="relative">
            <select
              value={selectedShell}
              onChange={handleShellChange}
              className="appearance-none bg-transparent text-[11px] text-[#c9d1d9] pl-2 pr-5 py-0.5 rounded border border-[#30363d] hover:border-[#58a6ff] focus:outline-none focus:border-[#58a6ff] cursor-pointer transition-colors"
              title="Select shell environment"
            >
              {availableShells.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={10}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#8b949e] pointer-events-none"
            />
          </div>
        </div>
      </div>

      {/* Terminal viewport */}
      <div
        ref={containerRef}
        className="flex-1"
        style={{ overflow: "hidden" }}
      />
    </div>
  );
}
