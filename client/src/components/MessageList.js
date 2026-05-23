import { useEffect, useMemo, useRef } from "react";

function formatTime(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function MessageList({
  messages,
  currentUserId,
  onDelete,
  onReply,
  onEdit
}) {
  const endRef = useRef(null);

  const displayItems = useMemo(() => buildDisplayItems(messages), [messages]);

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
      {displayItems.map((item) => {
        if (item.type === "day") {
          return (
            <div
              key={item.key}
              className="mx-auto rounded-full border border-white/70 bg-white/80 px-4 py-1 text-[11px] uppercase tracking-[0.3em] text-[var(--ink-soft)]"
            >
              {item.label}
            </div>
          );
        }

        const message = item.message;
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
              {!isDeleted && message.replyTo ? (
                <div className="mb-2 rounded-2xl border border-[var(--bubble-border)] bg-white/70 px-3 py-2 text-xs text-[var(--ink-soft)]">
                  <p className="font-semibold text-[var(--ink)]">
                    {message.replyTo.senderId === currentUserId ? "You" : "Them"}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{message.replyTo.text}</p>
                </div>
              ) : null}

              <p
                className={`whitespace-pre-wrap leading-relaxed ${
                  isDeleted ? "italic opacity-80" : ""
                }`}
              >
                {isDeleted ? "This message was deleted." : message.text}
              </p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] opacity-80">
                <span>
                  {formatTime(message.timestamp)}
                  {message.edited ? " • edited" : ""}
                </span>
                <div className="flex items-center gap-3">
                  {statusText ? <span>{statusText}</span> : null}
                  {!isDeleted ? (
                    <div className="flex items-center gap-3 opacity-0 transition group-hover:opacity-100">
                      {message.id ? (
                        <button type="button" onClick={() => onReply?.(message)}>
                          reply
                        </button>
                      ) : null}
                      {isMine && message.id ? (
                        <>
                          <button type="button" onClick={() => onEdit?.(message)}>
                            edit
                          </button>
                          <button type="button" onClick={() => onDelete?.(message)}>
                            delete
                          </button>
                        </>
                      ) : null}
                    </div>
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

function buildDisplayItems(messages) {
  const items = [];
  let lastDayKey = "";

  messages.forEach((message, index) => {
    const timestamp = message.timestamp || new Date().toISOString();
    const dayKey = new Date(timestamp).toDateString();
    if (dayKey !== lastDayKey) {
      items.push({
        type: "day",
        key: `${dayKey}-${index}`,
        label: formatDayLabel(new Date(timestamp))
      });
      lastDayKey = dayKey;
    }

    items.push({ type: "message", message });
  });

  return items;
}

function formatDayLabel(date) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (day.getTime() === today.getTime()) {
    return "Today";
  }
  if (day.getTime() === yesterday.getTime()) {
    return "Yesterday";
  }

  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}
