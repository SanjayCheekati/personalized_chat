import { useEffect, useRef, useState } from "react";
import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";

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
  theme = "dark",
  keepFocus = false
}) {
  const [showEmoji, setShowEmoji] = useState(false);
  const pickerRef = useRef(null);
  const toggleRef = useRef(null);
  const textareaRef = useRef(null);
  const selectionRef = useRef({ start: 0, end: 0 });

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
  };

  const submit = () => {
    if (!value.trim()) {
      return;
    }
    onSend?.(value);
    onValueChange?.("");
    onTyping?.(false);
    setShowEmoji(false);
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

  const trackSelection = () => {
    const input = textareaRef.current;
    if (!input) {
      return;
    }
    selectionRef.current = {
      start: input.selectionStart ?? 0,
      end: input.selectionEnd ?? 0
    };
  };

  const appendEmoji = (emoji) => {
    const { start, end } = selectionRef.current;
    const safeStart = Math.max(0, start);
    const safeEnd = Math.max(0, end);
    const next = `${value.slice(0, safeStart)}${emoji}${value.slice(safeEnd)}`;
    const nextCursor = safeStart + emoji.length;
    onValueChange?.(next);
    onTyping?.(true);

    requestAnimationFrame(() => {
      const input = textareaRef.current;
      if (!input) {
        return;
      }
      input.focus();
      input.setSelectionRange(nextCursor, nextCursor);
      selectionRef.current = { start: nextCursor, end: nextCursor };
    });
  };

  useEffect(() => {
    if (!showEmoji) {
      return;
    }

    const handleOutside = (event) => {
      const target = event.target;
      if (pickerRef.current?.contains(target) || toggleRef.current?.contains(target)) {
        return;
      }
      setShowEmoji(false);
    };

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [showEmoji]);

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
        <p className="mb-3 text-xs text-[var(--ink-soft)]">{typingPreview}</p>
      ) : null}

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <button
            type="button"
            ref={toggleRef}
            onClick={() => setShowEmoji((prev) => !prev)}
            disabled={disabled}
            className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full text-sm text-[var(--ink-soft)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            🙂
          </button>

          {showEmoji ? (
            <div
              ref={pickerRef}
              className="absolute bottom-[3.3rem] left-0 z-10 w-[320px] overflow-hidden rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] shadow-glow"
            >
              <Picker
                data={data}
                theme={theme}
                onEmojiSelect={(emoji) => appendEmoji(emoji.native || "")}
                previewPosition="none"
                navPosition="top"
                searchPosition="sticky"
                skinTonePosition="search"
                perLine={8}
                emojiSize={20}
              />
            </div>
          ) : null}

          <textarea
            ref={textareaRef}
            autoFocus={keepFocus}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onClick={trackSelection}
            onKeyUp={trackSelection}
            onSelect={trackSelection}
            onFocus={trackSelection}
            onBlur={handleBlur}
            rows={1}
            placeholder={disabled ? "Connecting..." : "Type a message"}
            className="min-h-[44px] w-full resize-none rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] py-2 pl-10 pr-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
          />
        </div>

        <button
          type="button"
          disabled={disabled}
          onClick={submit}
          className="flex h-[44px] w-[44px] items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-glow transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-current">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
