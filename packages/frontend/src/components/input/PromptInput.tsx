import { useState, useRef, useEffect, useCallback, type KeyboardEvent, type DragEvent } from "react";
import { Send, Square, Paperclip, X } from "lucide-react";
import { useChatStore } from "@/store/chatStore";
import { useChatActions } from "@/hooks/useStreamingChat";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/cn";
import { toast } from "@/lib/toast";
import { ModelSelector } from "./ModelSelector";
import { AttachmentList } from "./AttachmentList";
import type { LocalAttachment } from "./types";

/** File extensions that should be read as text */
const TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".json", ".jsonc", ".json5",
  ".css", ".scss", ".less",
  ".html", ".htm", ".xml", ".svg",
  ".md", ".mdx", ".txt", ".csv",
  ".py", ".rb", ".go", ".rs", ".java", ".kt", ".swift",
  ".c", ".cpp", ".h", ".hpp",
  ".yaml", ".yml", ".toml", ".ini", ".cfg",
  ".sh", ".bash", ".zsh", ".fish",
  ".sql", ".graphql", ".gql",
  ".env", ".gitignore", ".dockerignore",
  ".prisma", ".proto",
]);

/** MIME types that should be read as text */
const TEXT_MIMES = new Set([
  "text/",
  "application/json",
  "application/xml",
  "application/javascript",
  "application/typescript",
  "application/x-httpd-php",
  "application/x-sh",
  "application/x-python-code",
]);

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

function isTextFile(file: File): boolean {
  if (file.type && TEXT_MIMES.has(file.type)) return true;
  if (file.type.startsWith("text/")) return true;
  const ext = "." + file.name.split(".").pop()?.toLowerCase();
  if (TEXT_EXTENSIONS.has(ext)) return true;
  return false;
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

async function readFileAsAttachment(file: File): Promise<LocalAttachment> {
  const isImage = isImageFile(file);
  let content: string;

  if (isTextFile(file)) {
    content = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  } else {
    // Binary / image — read as data URL
    content = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  return {
    id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    content,
    isImage,
  };
}

async function readClipboardAsAttachments(
  items: DataTransferItemList
): Promise<LocalAttachment[]> {
  const results: LocalAttachment[] = [];
  for (const item of items) {
    if (item.kind === "file") {
      const file = item.getAsFile();
      if (file) {
        try {
          results.push(await readFileAsAttachment(file));
        } catch {
          // skip
        }
      }
    }
  }
  return results;
}

interface PromptInputProps {
  /** When set, the input is in edit mode — editing this message */
  editingMessageId?: string | null;
  /** The text of the message being edited */
  editingText?: string;
  /** Called when the user cancels edit mode */
  onCancelEdit?: () => void;
}

export function PromptInput({ editingMessageId, editingText, onCancelEdit }: PromptInputProps = {}) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isStreaming } = useChatStore();
  const { sendPrompt, interrupt } = useChatActions();

  // Are we in edit mode?
  const isEditing = !!editingMessageId;

  // Sync editing text into the input when edit mode starts
  useEffect(() => {
    if (isEditing && editingText) {
      setText(editingText);
      // Focus and position cursor at end
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      }
    }
  }, [editingMessageId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, [text]);

  const addAttachments = useCallback(async (files: FileList | File[]) => {
    const fileArr = Array.from(files);
    for (const file of fileArr) {
      if (file.size > MAX_FILE_SIZE) {
        toast.warning(`File "${file.name}" is too large. Max 20MB.`);
        continue;
      }
      try {
        const att = await readFileAsAttachment(file);
        setAttachments((prev) => [...prev, att]);
      } catch {
        toast.error(`Failed to read file "${file.name}"`);
      }
    }
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleSend = () => {
    if ((!text.trim() && attachments.length === 0) || isStreaming) return;
    sendPrompt(text.trim(), undefined, attachments, editingMessageId ?? undefined);
    setText("");
    setAttachments([]);
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    // Exit edit mode if we were editing
    if (isEditing && onCancelEdit) {
      onCancelEdit();
    }
  };

  const handleCancelEdit = () => {
    setText("");
    if (onCancelEdit) onCancelEdit();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── File input handling ──────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addAttachments(e.target.files);
      // Reset so the same file can be re-selected
      e.target.value = "";
    }
  };

  // ── Paste handling (for images) ──────────────────────────
  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    // Check if there are image items in the clipboard
    const hasFiles = Array.from(items).some((item) => item.kind === "file");
    if (hasFiles) {
      e.preventDefault();
      const pasted = await readClipboardAsAttachments(items);
      setAttachments((prev) => [...prev, ...pasted]);
    }
    // If no files, let default paste behavior handle text
  };

  // ── Drag & drop ──────────────────────────────────────────
  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addAttachments(e.dataTransfer.files);
    }
  };

  return (
    <div
      className={cn(
        "border-t border-border bg-background p-4",
        isDragOver && "bg-primary/5"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragOver && (
        <div className="text-xs text-primary text-center mb-2 animate-pulse">
          Drop files to attach
        </div>
      )}

      <div className="max-w-4xl mx-auto">
        {/* Model switcher */}
        <div className="flex items-center justify-between mb-2">
          <ModelSelector />
          <div className="text-[10px] text-muted-foreground">
            {t("chat.hintKeys")}
          </div>
        </div>

        {/* Edit mode indicator */}
        {isEditing && (
          <div className="flex items-center gap-2 mb-2 px-1">
            <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
              ✏️ {t("chat.editingMessage")}
            </span>
            <button
              onClick={handleCancelEdit}
              className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
            >
              {t("chat.cancelEdit")}
            </button>
          </div>
        )}

        {/* Attachments */}
        <AttachmentList attachments={attachments} onRemove={removeAttachment} />

        <div
          className={cn(
            "flex items-end gap-3 bg-card border border-border rounded-2xl px-4 py-3 transition-all",
            "focus-within:ring-2 focus-within:ring-ring",
            isDragOver && "border-primary ring-2 ring-primary/30"
          )}
        >
          {/* Attach button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            title={t("chat.attach")}
          >
            <Paperclip size={18} />
          </button>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileChange}
            className="hidden"
            aria-hidden="true"
          />

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={t("chat.placeholder")}
            rows={1}
            className="flex-1 bg-transparent outline-none resize-none text-sm text-foreground placeholder:text-muted-foreground min-h-[24px] max-h-[200px]"
            disabled={isStreaming}
          />

          {/* Send / Stop button */}
          {isStreaming ? (
            <button
              onClick={interrupt}
              className="p-2 rounded-xl bg-destructive text-destructive-foreground hover:opacity-90 transition-all flex-shrink-0"
              title={t("chat.stop")}
            >
              <Square size={16} fill="currentColor" />
            </button>
          ) : (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* Cancel edit button */}
              {isEditing && (
                <button
                  onClick={handleCancelEdit}
                  className="p-2 rounded-xl bg-secondary text-muted-foreground hover:text-foreground hover:bg-border transition-all"
                  title={t("chat.cancelEdit")}
                >
                  <X size={16} />
                </button>
              )}
              <button
                onClick={handleSend}
                disabled={!text.trim() && attachments.length === 0}
                className={cn(
                  "p-2 rounded-xl transition-all",
                  text.trim() || attachments.length > 0
                    ? "bg-primary text-primary-foreground hover:opacity-90"
                    : "bg-secondary text-muted-foreground cursor-not-allowed"
                )}
                title={t("chat.send")}
              >
                <Send size={16} />
              </button>
            </div>
          )}
        </div>

        <div className="text-[10px] text-muted-foreground text-center mt-2 opacity-60">
          {t("chat.hint")}
        </div>
      </div>
    </div>
  );
}
