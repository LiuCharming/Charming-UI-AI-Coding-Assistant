/**
 * Global keyboard shortcuts applied at the document level.
 * Register in ChatPage once.
 */

import { useEffect } from "react";
import { useChatStore } from "@/store/chatStore";
import { useChatActions } from "@/hooks/useStreamingChat";

export interface ShortcutActions {
  /** Open the command palette */
  openCommandPalette: () => void;
  /** Close the command palette if open — returns true if it was open */
  closeCommandPaletteIfOpen: () => boolean;
  /** Create a new chat */
  newChat: () => void;
  /** Copy last assistant message to clipboard */
  copyLastReply: () => void;
  /** Open settings dialog */
  openSettings: () => void;
}

export function useGlobalShortcuts(actions: ShortcutActions) {
  const { isStreaming } = useChatStore();
  const { interrupt } = useChatActions();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey;

      // ── Escape: cancel streaming or close palette ──────
      if (e.key === "Escape") {
        if (isStreaming) {
          e.preventDefault();
          interrupt();
          return;
        }
        if (actions.closeCommandPaletteIfOpen()) {
          return;
        }
        return;
      }

      // ── Ctrl+K: command palette ────────────────────────
      if (ctrl && e.key === "k") {
        e.preventDefault();
        actions.openCommandPalette();
        return;
      }

      // ── Ctrl+N: new chat ───────────────────────────────
      if (ctrl && e.key === "n") {
        e.preventDefault();
        actions.newChat();
        return;
      }

      // ── Ctrl+Shift+C: copy last assistant reply ────────
      if (ctrl && e.shiftKey && e.key === "C") {
        e.preventDefault();
        actions.copyLastReply();
        return;
      }

      // ── Ctrl+, : open settings ─────────────────────────
      if (ctrl && e.key === ",") {
        e.preventDefault();
        actions.openSettings();
        return;
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isStreaming, interrupt, actions]);
}
