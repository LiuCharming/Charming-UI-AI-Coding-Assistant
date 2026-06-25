import { useCallback, useRef, useEffect } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { useChatStore } from "@/store/chatStore";
import { useChatActions } from "@/hooks/useStreamingChat";
import { useI18n } from "@/i18n";
import type { ChatMessage } from "@cgui/shared";
import { MessageBubble } from "./MessageBubble";

interface ChatViewProps {
  /** Programmatic scroll-to-message index. Set to null to clear. */
  scrollToIndex?: number | null;
  /** Called after scroll completes to acknowledge the navigation. */
  onScrollComplete?: () => void;
  /** Changing this key triggers scroll-to-bottom (session switch). */
  scrollBottomKey?: string | null;
  onRegenerate?: () => void;
  onEdit?: (messageId: string, text: string) => void;
  onFork?: (messageId: string) => void;
}

export function ChatView({ scrollToIndex, onScrollComplete, scrollBottomKey, onRegenerate, onEdit, onFork }: ChatViewProps) {
  const { t, tArray } = useI18n();
  const { messages, isStreaming } = useChatStore();
  const { sendPrompt } = useChatActions();
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  // ── Render a single message ───────────────────────────
  // NOTE: deliberately reads from store inside the callback to avoid
  // recreating on every text_delta — Virtuoso's itemContent is stable.
  const renderItem = useCallback(
    (_index: number, msg: ChatMessage) => {
      const msgs = useChatStore.getState().messages;
      return (
        <div className="px-4 py-2">
          <MessageBubble
            message={msg}
            isLast={msg.id === msgs[msgs.length - 1]?.id}
            onRegenerate={onRegenerate}
            onEdit={onEdit}
            onFork={onFork}
          />
        </div>
      );
    },
    [onRegenerate, onEdit, onFork]
  );

  // ── Programmatic scroll-to-index ────────────────────
  const prevIndex = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    if (scrollToIndex != null && scrollToIndex !== prevIndex.current) {
      prevIndex.current = scrollToIndex;
      // Delay to let Virtuoso render the items first
      const timer = setTimeout(() => {
        virtuosoRef.current?.scrollToIndex({
          index: scrollToIndex,
          align: "center",
          behavior: "smooth",
        });
        onScrollComplete?.();
      }, 100);
      return () => clearTimeout(timer);
    }
    prevIndex.current = scrollToIndex;
  }, [scrollToIndex, onScrollComplete]);

  // ── Auto-scroll to bottom on session switch ──────────
  const prevScrollBottomKey = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (
      scrollBottomKey != null &&
      scrollBottomKey !== prevScrollBottomKey.current &&
      messages.length > 0
    ) {
      prevScrollBottomKey.current = scrollBottomKey;
      // Delay to let Virtuoso process the new messages first
      const timer = setTimeout(() => {
        virtuosoRef.current?.scrollToIndex({
          index: messages.length - 1,
          align: "end",
          behavior: "auto",
        });
      }, 150);
      return () => clearTimeout(timer);
    }
    prevScrollBottomKey.current = scrollBottomKey;
  }, [scrollBottomKey, messages.length]);

  // ── Empty state (shown when messages.length === 0) ─────
  const EmptyState = useCallback(
    () => (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <div className="text-5xl mb-4">🧠</div>
          <h2 className="text-xl font-semibold mb-2 text-foreground">
            {t("chat.welcome")}
          </h2>
          <p className="text-sm max-w-md">
            {t("chat.welcomeDesc")}
          </p>
          <div className="mt-6 grid grid-cols-2 gap-2 max-w-md mx-auto">
            {tArray("chat.suggestions").map((suggestion: string) => (
              <button
                key={suggestion}
                onClick={() => sendPrompt(suggestion)}
                className="text-xs text-left p-3 rounded-lg border border-border hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      </div>
    ),
    [t, tArray, sendPrompt]
  );

  // ── Streaming indicator footer ────────────────────────
  const Footer = useCallback(
    () =>
      isStreaming ? (
        <div className="px-6 py-3 flex items-center gap-2 text-xs text-muted-foreground">
          <div className="flex gap-1">
            <span
              className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce"
              style={{ animationDelay: "0ms" }}
            />
            <span
              className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce"
              style={{ animationDelay: "150ms" }}
            />
            <span
              className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce"
              style={{ animationDelay: "300ms" }}
            />
          </div>
          {t("chat.claudeThinking")}
        </div>
      ) : null,
    [isStreaming, t]
  );

  return (
    <Virtuoso
      ref={virtuosoRef}
      className="h-full"
      data={messages}
      itemContent={renderItem}
      followOutput="smooth"
      atTopThreshold={120}
      atBottomThreshold={120}
      components={{
        Footer,
        EmptyPlaceholder: EmptyState,
      }}
    />
  );
}
