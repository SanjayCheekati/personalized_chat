import { useEffect, useRef, useState } from "react";

export default function MessageInput({
  disabled,
  value = "",
  onValueChange,
  onSend,
  onTyping,
  replyTarget,
  onCancelReply,
  editingMessage,
  onCancelEdit,
  typingPreview,
  keepFocus = false
}) {
  const textareaRef = useRef(null);
  const [isPulsing, setIsPulsing] = useState(false);

  const focusInput = () => {
    if (disabled) {
      return;
    }
    const input = textareaRef.current;
    if (!input) {
      return;
    }
    input.focus();
  };

  const handleChange = (event) => {
    const next = event.target.value;
    onValueChange?.(next);
    onTyping?.(next.length > 0);

    // Auto-grow: reset to auto first so shrinking works correctly,
    // then expand to scrollHeight capped at ~4 lines.
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }
  };

  const submit = () => {
    if (!value.trim()) {
      return;
    }
    setIsPulsing(true);
    setTimeout(() => setIsPulsing(false), 300);

    onSend?.(value);
    onValueChange?.("");
    onTyping?.(false);
    // Reset height after clearing
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
    }
    requestAnimationFrame(() => {
      focusInput();
    });
  };

  const handleBlur = () => {
    if (!keepFocus || disabled) {
      return;
    }
    requestAnimationFrame(() => {
      focusInput();
    });
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  useEffect(() => {
    focusInput();
  }, [disabled]);

  return (
    <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-dark)] p-2">
      {(replyTarget || editingMessage) && (
        <div className="mb-3 rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] px-3 py-2 text-xs text-[var(--ink-soft)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              {editingMessage ? (
                <p className="font-semibold text-[var(--ink)]">Editing message</p>
              ) : (
                <p className="font-semibold text-[var(--ink)]">Replying</p>
              )}
              <p className="mt-1">
                {editingMessage ? editingMessage.text : replyTarget?.text}
              </p>
            </div>
            <button
              type="button"
              onClick={editingMessage ? onCancelEdit : onCancelReply}
              className="text-[var(--accent)]"
            >
              cancel
            </button>
          </div>
        </div>
      )}

      {typingPreview ? (
        <div className="flex items-center gap-2 mb-3 animate-fade-in">
          <p className="text-xs text-[var(--ink-soft)]">{typingPreview}</p>
          <div className="typing-indicator select-none">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <textarea
          ref={textareaRef}
          autoFocus={keepFocus}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          rows={1}
          placeholder={disabled ? "Connecting..." : "Type a message"}
          className="min-h-[44px] w-full resize-none rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] px-4 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)] transition-[height] duration-100"
          style={{ overflow: "hidden" }}
        />

        <button
          type="button"
          disabled={disabled}
          onPointerDown={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={submit}
          className={`flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full send-btn-gradient text-white shadow-glow transition hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 ${
            isPulsing ? "send-btn-pulse" : ""
          }`}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-current">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

