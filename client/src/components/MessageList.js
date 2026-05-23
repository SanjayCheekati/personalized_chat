import { useEffect, useRef } from "react";

function formatTime(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function MessageList({ messages, currentUserId, onDelete }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (!messages.length) {
    return (
      <div className="rounded-3xl border border-white/70 bg-white/70 px-6 py-8 text-center text-sm text-[var(--ink-soft)]">
        Start your love story.
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col justify-end gap-3">
      {messages.map((message) => {
        const isMine = message.senderId === currentUserId;
        const isDeleted = Boolean(message.deleted);
        const statusText =
          isDeleted
            ? "deleted"
            : isMine && message.status === "seen"
            ? "seen"
            : isMine && message.status === "delivered"
            ? "delivered"
            : isMine && message.status === "sending"
            ? "sending"
            : "";

        return (
          <div
            key={message.id || message.clientId}
            className={`flex ${isMine ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`group max-w-[82%] rounded-3xl px-4 py-3 text-sm shadow-glow animate-pop ${
                isMine
                  ? "bg-[var(--bubble-me)] text-white"
                  : "bg-[var(--bubble-them)] text-[var(--ink)]"
              }`}
            >
              <p
                className={`whitespace-pre-wrap leading-relaxed ${
                  isDeleted ? "italic opacity-80" : ""
                }`}
              >
                {isDeleted ? "This message was deleted." : message.text}
              </p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] opacity-80">
                <span>{formatTime(message.timestamp)}</span>
                <div className="flex items-center gap-3">
                  {statusText ? <span>{statusText}</span> : null}
                  {isMine && !isDeleted && message.id ? (
                    <button
                      type="button"
                      onClick={() => onDelete?.(message)}
                      className="opacity-0 transition group-hover:opacity-100"
                    >
                      delete
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
