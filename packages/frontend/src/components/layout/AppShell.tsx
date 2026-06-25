/**
 * App layout shell with optional resizable right panel and bottom panel.
 * sidebar (left) | main content | resize handle | right panel
 *                                        bottom panel + resize handle
 */
import { useState, useCallback, useRef, useEffect, type ReactNode } from "react";
import { cn } from "@/lib/cn";

const MIN_PANEL = 240;
const MAX_PANEL_RATIO = 0.5;
const DEFAULT_PANEL = 320;

const MIN_BOTTOM = 100;
const MAX_BOTTOM_RATIO = 0.5;
const DEFAULT_BOTTOM = 280;

interface AppShellProps {
  sidebar: ReactNode;
  header: ReactNode;
  children: ReactNode;
  rightPanel?: ReactNode;
  sidebarCollapsed?: boolean;
  rightPanelOpen?: boolean;
  panelWidth?: number;
  onPanelWidthChange?: (w: number) => void;
  // Bottom panel (terminal)
  bottomPanel?: ReactNode;
  bottomPanelOpen?: boolean;
  bottomPanelHeight?: number;
  onBottomPanelHeightChange?: (h: number) => void;
}

export function AppShell({
  sidebar,
  header,
  children,
  rightPanel,
  sidebarCollapsed = false,
  rightPanelOpen = false,
  panelWidth = DEFAULT_PANEL,
  onPanelWidthChange,
  bottomPanel,
  bottomPanelOpen = false,
  bottomPanelHeight = DEFAULT_BOTTOM,
  onBottomPanelHeightChange,
}: AppShellProps) {
  // ── Right panel horizontal resize ──
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const clamp = useCallback((w: number) => {
    const max = Math.round(window.innerWidth * MAX_PANEL_RATIO);
    return Math.max(MIN_PANEL, Math.min(w, max));
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = panelWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [panelWidth]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = startX.current - e.clientX;
      onPanelWidthChange?.(clamp(startWidth.current + delta));
    };
    const onMouseUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [clamp, onPanelWidthChange]);

  // ── Bottom panel vertical resize ──
  const bottomDragging = useRef(false);
  const bottomStartY = useRef(0);
  const bottomStartHeight = useRef(0);

  const clampBottom = useCallback((h: number) => {
    const max = Math.round(window.innerHeight * MAX_BOTTOM_RATIO);
    return Math.max(MIN_BOTTOM, Math.min(h, max));
  }, []);

  const onBottomMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    bottomDragging.current = true;
    bottomStartY.current = e.clientY;
    bottomStartHeight.current = bottomPanelHeight;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }, [bottomPanelHeight]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!bottomDragging.current) return;
      const delta = bottomStartY.current - e.clientY;
      onBottomPanelHeightChange?.(clampBottom(bottomStartHeight.current + delta));
    };
    const onMouseUp = () => {
      if (!bottomDragging.current) return;
      bottomDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [clampBottom, onBottomPanelHeightChange]);

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-background">
      {/* Left sidebar */}
      <aside
        className={cn(
          "h-full flex-shrink-0 border-r border-border bg-sidebar transition-all duration-200",
          sidebarCollapsed ? "w-0 overflow-hidden" : "w-64"
        )}
      >
        {sidebar}
      </aside>

      {/* Main content column */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-12 flex-shrink-0 border-b border-border bg-background/80 backdrop-blur-sm">
          {header}
        </header>
        <main className="flex-1 min-h-0 overflow-hidden">
          {children}
        </main>

        {/* Bottom resize handle */}
        {bottomPanel && bottomPanelOpen && (
          <div
            onMouseDown={onBottomMouseDown}
            className="h-1.5 flex-shrink-0 cursor-row-resize hover:bg-primary/30 active:bg-primary/50 transition-colors group relative"
          >
            <div className="absolute inset-x-0 -top-1 -bottom-1" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-0.5 rounded-full bg-border group-hover:bg-primary/50 transition-colors" />
          </div>
        )}

        {/* Bottom panel */}
        {bottomPanel && (
          <div
            className={cn(
              "flex-shrink-0 border-t border-border bg-[#0d1117] transition-[height] duration-0 overflow-hidden"
            )}
            style={{ height: bottomPanelOpen ? bottomPanelHeight : 0 }}
          >
            {bottomPanel}
          </div>
        )}
      </div>

      {/* Resize handle + right panel */}
      {rightPanel && (
        <>
          {/* Handle — only visible when panel is open */}
          {rightPanelOpen && (
            <div
              onMouseDown={onMouseDown}
              className="w-1.5 flex-shrink-0 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors group relative"
            >
              <div className="absolute inset-y-0 -left-1 -right-1" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0.5 h-8 rounded-full bg-border group-hover:bg-primary/50 transition-colors" />
            </div>
          )}
          <aside
            className={cn(
              "h-full flex-shrink-0 border-l border-border bg-sidebar transition-[width] duration-0 overflow-hidden"
            )}
            style={{ width: rightPanelOpen ? panelWidth : 0 }}
          >
            {rightPanel}
          </aside>
        </>
      )}
    </div>
  );
}
