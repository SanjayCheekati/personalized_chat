import { useState } from "react";

const QUICK_REPLIES = [":)", ":D", "<3", ";)", ":P"];

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
      <div className="flex flex-wrap gap-2">
        {QUICK_REPLIES.map((reply) => (
          <button
            key={reply}
            type="button"
            onClick={() => appendQuickReply(reply)}
            className="rounded-full border border-white/70 bg-white/70 px-3 py-1 text-xs text-[var(--ink)]"
          >
            {reply}
          </button>
        ))}
      </div>

      <div className="flex items-end gap-3">
        <textarea
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          rows={2}
          placeholder={disabled ? "Connecting..." : "Type a message"}
          className="min-h-[56px] flex-1 resize-none rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={submit}
          className="rounded-2xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white shadow-glow disabled:cursor-not-allowed disabled:opacity-60"
        >
          Send
        </button>
      </div>
    </div>
  );
}
