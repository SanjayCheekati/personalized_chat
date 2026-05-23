import { useState } from "react";

const EMOJIS = [
  "😀",
  "😂",
  "❤️",
  "😍",
  "😭",
  "🥺",
  "😘",
  "😉",
  "👍",
  "🙏",
  "🔥",
  "🎉",
  "😅",
  "😎",
  "🥲",
  "🤍",
  "😴",
  "🤔"
];

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
  typingPreview
}) {
  const [showEmoji, setShowEmoji] = useState(false);

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
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const appendEmoji = (emoji) => {
    const next = `${value}${emoji}`;
    onValueChange?.(next);
    onTyping?.(true);
  };

  return (
    <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-dark)] p-3">
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowEmoji((prev) => !prev)}
            disabled={disabled}
            className="rounded-full border border-[var(--panel-border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            🙂
          </button>

          {showEmoji ? (
            <div className="absolute bottom-[3.4rem] left-0 z-10 grid w-56 grid-cols-9 gap-2 rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] p-3 shadow-glow">
              {EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => appendEmoji(emoji)}
                  className="text-lg"
                >
                  {emoji}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <textarea
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          rows={2}
          placeholder={disabled ? "Connecting..." : "Type a message"}
          className="min-h-[46px] w-full flex-1 resize-none rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
        />

        <button
          type="button"
          disabled={disabled}
          onClick={submit}
          className="flex h-[46px] w-[46px] items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-glow transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-current">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
