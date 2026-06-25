import { useState, useEffect, useRef } from "react";
import { Cpu, ChevronDown, Check, Brain, Eye, Zap } from "lucide-react";
import { cn } from "@/lib/cn";
import { rest } from "@/api/restClient";
import type { ProviderConfig, ProviderModel } from "@cgui/shared";

interface ModelSelectorProps {
  className?: string;
}

export function ModelSelector({ className }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [activeProviderId, setActiveProviderId] = useState(
    () => localStorage.getItem("charming-provider") || "anthropic"
  );
  const [activeModelId, setActiveModelId] = useState(
    () => localStorage.getItem("charming-model") || ""
  );
  const containerRef = useRef<HTMLDivElement>(null);

  // Load providers
  useEffect(() => {
    rest.get<{ providers?: ProviderConfig[] }>("/settings")
      .then((s) => {
        if (s.providers) {
          setProviders(s.providers);
          const enabledProviders = s.providers.filter((p) => p.enabled && p.models.length > 0);

          // Check if current selection is still valid
          const currentProvider = s.providers.find((p) => p.id === activeProviderId);
          const currentModelValid =
            currentProvider?.enabled &&
            currentProvider.models.some((m) => m.id === activeModelId);

          if (!currentModelValid && enabledProviders.length > 0) {
            // Auto-switch to first enabled provider/model
            const first = enabledProviders[0];
            setActiveProviderId(first.id);
            setActiveModelId(first.models[0].id);
            localStorage.setItem("charming-provider", first.id);
            localStorage.setItem("charming-model", first.models[0].id);
          }
        }
      })
      .catch(() => {});
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const enabledProviders = providers.filter((p) => p.enabled && p.models.length > 0);

  const activeProvider = enabledProviders.find((p) => p.id === activeProviderId);
  const activeModel = activeProvider?.models.find((m) => m.id === activeModelId);

  // If current selection is invalid (provider disabled or removed), auto-fallback
  if (!activeModel && enabledProviders.length > 0) {
    const first = enabledProviders[0];
    if (activeProviderId !== first.id || activeModelId !== first.models[0].id) {
      // Defer state update to avoid render-loop
      setTimeout(() => {
        setActiveProviderId(first.id);
        setActiveModelId(first.models[0].id);
        localStorage.setItem("charming-provider", first.id);
        localStorage.setItem("charming-model", first.models[0].id);
      }, 0);
    }
  }

  const selectModel = (providerId: string, modelId: string) => {
    setActiveProviderId(providerId);
    setActiveModelId(modelId);
    localStorage.setItem("charming-provider", providerId);
    localStorage.setItem("charming-model", modelId);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Trigger button — pills style */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-all",
          "border border-border bg-secondary/60 hover:bg-secondary",
          "text-foreground",
          open && "ring-1 ring-ring border-primary/50"
        )}
        title="Ctrl+/ to switch model"
      >
        <Cpu size={12} className="text-primary flex-shrink-0" />
        <span className="truncate max-w-[120px]">
          {activeModel?.name || "Select model"}
        </span>
        <ChevronDown
          size={12}
          className={cn("flex-shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-72 bg-popover border border-border rounded-xl shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="px-3 py-2 border-b border-border bg-secondary/30">
            <div className="text-xs font-medium text-foreground">Switch Model</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              Select a model to use for the next prompt
            </div>
          </div>

          {/* Model list grouped by provider */}
          <div className="max-h-64 overflow-y-auto py-1">
            {enabledProviders.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                No models available. Configure providers in Settings.
              </div>
            ) : (
              enabledProviders.map((provider) => (
                <div key={provider.id}>
                  {/* Provider header */}
                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                    {provider.name}
                  </div>
                  {/* Provider models */}
                  {provider.models.map((model) => {
                    const isActive = provider.id === activeProviderId && model.id === activeModelId;
                    return (
                      <button
                        key={model.id}
                        onClick={() => selectModel(provider.id, model.id)}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-2 text-left transition-colors",
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "hover:bg-secondary text-foreground"
                        )}
                      >
                        {/* Check mark for active */}
                        <div className="w-4 flex-shrink-0">
                          {isActive && <Check size={14} />}
                        </div>

                        {/* Model info */}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{model.name}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] font-mono text-muted-foreground truncate">
                              {model.id}
                            </span>
                            {/* Capability badges */}
                            {model.supportsThinking && (
                              <span className="text-[9px] px-1 py-0.5 rounded bg-purple-500/10 text-purple-500 font-medium">
                                <Brain size={9} className="inline mr-0.5" />
                                Thinking
                              </span>
                            )}
                            {model.supportsVision && (
                              <span className="text-[9px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-400 font-medium">
                                <Eye size={9} className="inline mr-0.5" />
                                Vision
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Price */}
                        {model.inputCostPer1M != null && (
                          <div className="text-[10px] text-muted-foreground flex-shrink-0 text-right leading-tight">
                            <div>${model.inputCostPer1M}/M</div>
                            <div>${model.outputCostPer1M}/M</div>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Footer hint */}
          <div className="px-3 py-2 border-t border-border bg-secondary/30 text-[10px] text-muted-foreground flex items-center gap-1">
            <Zap size={10} />
            Press <kbd className="px-1 py-0.5 rounded bg-secondary text-[10px] font-mono">Ctrl+/</kbd> to toggle
          </div>
        </div>
      )}
    </div>
  );
}
