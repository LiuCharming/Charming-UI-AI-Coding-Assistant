import { useState, memo } from "react";
import type { ChatMessage } from "@cgui/shared";
import { cn } from "@/lib/cn";
import { useI18n } from "@/i18n";
import { StreamingText } from "./StreamingText";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolCallCard } from "./ToolCallCard";
import { User, Bot, RefreshCw, Pencil, GitFork, ChevronDown, ChevronRight, Wrench } from "lucide-react";

interface MessageBubbleProps {
  message: ChatMessage;
  isLast: boolean;
  onRegenerate?: () => void;
  onEdit?: (messageId: string, text: string) => void;
  onFork?: (messageId: string) => void;
}

export const MessageBubble = memo(function MessageBubble({ message, isLast, onRegenerate, onEdit, onFork }: MessageBubbleProps) {
  const { t } = useI18n();
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const hasToolCalls = message.toolCalls && message.toolCalls.length > 0;
  const [toolsExpanded, setToolsExpanded] = useState(false);

  return (
    <div
      className={cn(
        "flex gap-3 group",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      {/* Avatar */}
      {isAssistant && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mt-1">
          <Bot size={18} className="text-primary" />
        </div>
      )}

      <div
        className={cn(
          "max-w-[75%] min-w-0",
          isUser && "order-first"
        )}
      >
        {/* Role label */}
        <div
          className={cn(
            "text-xs font-medium mb-1",
            isUser ? "text-right text-muted-foreground" : "text-primary"
          )}
        >
          {isUser ? t("chat.you") : t("chat.claude")}
        </div>

        {/* Thinking block (collapsible reasoning) */}
        {message.thinking && (
          <ThinkingBlock content={message.thinking} />
        )}

        {/* Message content — only render bubble when there's actual text */}
        {message.content && (
          <div
            className={cn(
              "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
              isUser
                ? "bg-primary text-primary-foreground rounded-br-md"
                : "bg-card border border-border text-card-foreground rounded-bl-md"
            )}
          >
            {isAssistant && message.isStreaming && isLast ? (
              <StreamingText content={message.content} isStreaming />
            ) : (
              <div className="markdown-body prose prose-sm dark:prose-invert max-w-none">
                <StreamingText content={message.content} />
              </div>
            )}
          </div>
        )}

        {/* Tool calls — collapsible group */}
        {hasToolCalls && (
          <div className={cn(message.content ? "mt-2" : "mt-1")}>
            {/* Collapse toggle header */}
            <button
              onClick={() => setToolsExpanded(!toolsExpanded)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-1"
            >
              {toolsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <Wrench size={14} />
              <span>
                {message.toolCalls!.length} tool{message.toolCalls!.length > 1 ? "s" : ""} used
              </span>
              {!toolsExpanded && (
                <span className="text-muted-foreground/60 truncate max-w-[300px]">
                  : {message.toolCalls!.map((tc) => tc.toolName).join(", ")}
                </span>
              )}
            </button>
            {/* Tool call cards */}
            {toolsExpanded && (
              <div className="space-y-2">
                {message.toolCalls!.map((tc) => (
                  <ToolCallCard key={tc.toolUseId} toolCall={tc} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Timestamp + action buttons */}
        <div
          className={cn(
            "text-xs text-muted-foreground mt-1 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity",
            isUser ? "justify-end" : "justify-start"
          )}
        >
          <span>{new Date(message.timestamp).toLocaleTimeString()}</span>

          {/* Regenerate button — only on last assistant message when not streaming */}
          {isAssistant && isLast && !message.isStreaming && onRegenerate && (
            <button
              onClick={onRegenerate}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              title="Regenerate response"
            >
              <RefreshCw size={12} />
              <span>Regenerate</span>
            </button>
          )}

          {/* Edit button — on user messages when not streaming */}
          {isUser && !message.isStreaming && onEdit && (
            <button
              onClick={() => onEdit(message.id, message.content)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              title="Edit message"
            >
              <Pencil size={12} />
              <span>Edit</span>
            </button>
          )}

          {/* Fork button — creates a new session with messages up to this point */}
          {!message.isStreaming && onFork && (
            <button
              onClick={() => onFork(message.id)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-amber-500/10 text-muted-foreground hover:text-amber-500 transition-colors"
              title="Branch a new conversation from this point — copies all messages up to here into a new session"
            >
              <GitFork size={12} />
              <span>Fork</span>
            </button>
          )}
        </div>
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary flex items-center justify-center mt-1">
          <User size={18} className="text-foreground" />
        </div>
      )}
    </div>
  );
});
