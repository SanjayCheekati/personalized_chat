import { useState } from "react";

const EMOJIS = ["😍", "🥰", "😘", "❤️", "💌", "✨", "🌹", "😊"];

export default function MessageInput({ disabled, onSend, onTyping }) {
  const [value, setValue] = useState("");

  const handleChange = (event) => {
    const next = event.target.value;
    setValue(next);
    onTyping?.(next.length > 0);
  };

  const submit = () => {
    if (!value.trim()) {
      return;
    }
    onSend?.(value);
    setValue("");
    onTyping?.(false);
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const appendQuickReply = (chunk) => {
    setValue((prev) => `${prev}${chunk}`);
    onTyping?.(true);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-3xl border border-white/70 bg-white/70 p-4 shadow-rose">
        <textarea
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          rows={2}
          placeholder={disabled ? "Connecting..." : "Write a sweet message"}
          className="min-h-[64px] w-full resize-none rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
        />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => appendQuickReply(emoji)}
                className="rounded-full border border-white/70 bg-white/80 px-3 py-1 text-sm text-[var(--ink)] transition hover:-translate-y-0.5"
              >
                {emoji}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={disabled}
            onClick={submit}
            className="rounded-2xl bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white shadow-glow transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
