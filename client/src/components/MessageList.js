import { useEffect, useMemo, useRef } from "react";
import { groupMessagesByDate, formatDateSeparator } from "../utils/date";

function formatTime(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function MessageList({
  messages = [],
  currentUserId,
  onDelete,
  onReply,
  onEdit,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
}) {
  const endRef = useRef(null);
  const listRef = useRef(null);
  const prevMessagesLength = useRef(messages.length);
  const prevScrollHeight = useRef(0);
  const prevLastMessageIdRef = useRef(null);

  const groupedMessages = useMemo(() => groupMessagesByDate(messages), [messages]);

  useEffect(() => {
    const container = listRef.current?.parentElement;
    if (!container) {
      return;
    }

    const lastMessage = messages[messages.length - 1];
    const lastId = lastMessage ? (lastMessage.id || lastMessage.clientId) : null;

    if (messages.length > prevMessagesLength.current) {
      if (lastId === prevLastMessageIdRef.current) {
        // Prepended older messages (history load)
        const scrollDifference = container.scrollHeight - prevScrollHeight.current;
        container.scrollTop = container.scrollTop + scrollDifference;
      } else {
        // Appended new messages (sent/received)
        const marker = endRef.current;
        if (marker) {
          marker.scrollIntoView({ behavior: "smooth" });
        }
      }
    } else if (messages.length > 0 && prevMessagesLength.current === 0) {
      // Initial load
      const marker = endRef.current;
      if (marker) {
        marker.scrollIntoView({ behavior: "auto" });
      }
    }

    prevMessagesLength.current = messages.length;
    prevScrollHeight.current = container.scrollHeight;
    prevLastMessageIdRef.current = lastId;
  }, [messages]);

  return (
    <div ref={listRef} className="flex min-h-full flex-col justify-end gap-3">
      {hasMore ? (
        <div className="flex justify-center my-2 shrink-0">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="flex items-center gap-2 rounded-full border border-[var(--panel-border)] bg-[var(--panel)] px-4 py-1.5 text-xs font-semibold text-[var(--ink)] transition-all hover:bg-[var(--panel-dark)] hover:-translate-y-0.5 disabled:opacity-50 disabled:pointer-events-none"
          >
            {loadingMore ? (
              <>
                <svg className="animate-spin h-3 w-3 text-[var(--ink)]" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Loading history...</span>
              </>
            ) : (
              <>
                <svg className="h-3 w-3 text-[var(--ink-soft)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
                <span>Load older messages</span>
              </>
            )}
          </button>
        </div>
      ) : null}
      {groupedMessages.map((item) => {
        if (item.type === "date") {
          return (
            <div
              key={item.id}
              className="mx-auto rounded-full border border-[var(--panel-border)] bg-[var(--panel)] px-4 py-1 text-[11px] uppercase tracking-[0.3em] text-[var(--ink-soft)]"
            >
              {formatDateSeparator(item.date)}
            </div>
          );
        }

        const message = item;
        const isMine = message.senderId === currentUserId;
        const isDeleted = Boolean(message.deleted);
        const isEdited = Boolean(message.edited);
        const isRemember = message.kind === "remember";

        if (isRemember) {
          return (
            <div
              key={message.id || message.clientId || Math.random()}
              className="mx-auto rounded-full border border-[var(--panel-border)] bg-[var(--panel)] px-4 py-1 text-[11px] text-[var(--ink-soft)]"
            >
              {isMine ? "You sent a reminder" : `${message.text} sent a reminder`}
            </div>
          );
        }

        return (
          <div
            key={message.id || message.clientId || Math.random()}
            className={`group flex animate-pop ${isMine ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`relative max-w-[80%] rounded-2xl border px-3 py-2 text-sm sm:max-w-[70%] ${
                isMine
                  ? "border-[var(--bubble-border)] bg-[var(--bubble-me)] text-[var(--ink)]"
                  : "border-[var(--bubble-border)] bg-[var(--bubble-them)] text-[var(--ink)]"
              }`}
            >
              {message.replyTo ? (
                <div className="mb-2 rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] px-3 py-1.5 text-xs text-[var(--ink-soft)]">
                  <p className="font-semibold text-[var(--ink)]">Reply</p>
                  <p className="mt-0.5 line-clamp-2">
                    {message.replyTo.text || ""}
                  </p>
                </div>
              ) : null}

              {isDeleted ? (
                <p className="italic text-[var(--ink-soft)]">
                  This message was deleted.
                </p>
              ) : (
                <p className="whitespace-pre-wrap break-words">{message.text}</p>
              )}

              <div className="mt-1 flex items-center justify-end gap-1.5 text-[10px] text-[var(--ink-soft)]">
                {isEdited && !isDeleted ? (
                  <span className="italic">edited</span>
                ) : null}
                <span>{formatTime(message.timestamp)}</span>
                {isMine ? <StatusTicks status={message.status} /> : null}
              </div>

              {!isDeleted ? (
                <div className="absolute -top-3 right-2 hidden items-center gap-1 group-hover:flex">
                  {onReply ? (
                    <button
                      type="button"
                      onClick={() => onReply(message)}
                      className="rounded-full border border-[var(--panel-border)] bg-[var(--panel)] p-1.5 text-[var(--ink-soft)] shadow-sm transition hover:text-[var(--ink)]"
                      aria-label="Reply"
                    >
                      <ReplyIcon />
                    </button>
                  ) : null}
                  {isMine && onEdit ? (
                    <button
                      type="button"
                      onClick={() => onEdit(message)}
                      className="rounded-full border border-[var(--panel-border)] bg-[var(--panel)] p-1.5 text-[var(--ink-soft)] shadow-sm transition hover:text-[var(--ink)]"
                      aria-label="Edit"
                    >
                      <EditIcon />
                    </button>
                  ) : null}
                  {isMine && onDelete ? (
                    <button
                      type="button"
                      onClick={() => onDelete(message)}
                      className="rounded-full border border-[var(--panel-border)] bg-[var(--panel)] p-1.5 text-[var(--accent-warm)] shadow-sm transition hover:text-[var(--ink)]"
                      aria-label="Delete"
                    >
                      <TrashIcon />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}

function StatusTicks({ status }) {
  if (!status || status === "received") {
    return null;
  }

  if (status === "sending") {
    return <span className="text-[10px]">⌛</span>;
  }

  const className =
    status === "seen" ? "text-[var(--tick-seen)]" : "text-[var(--ink-soft)]";

  return <span className={className}>✓✓</span>;
}

function ReplyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
      <path d="M10 9V5l-7 7 7 7v-4.1c6.1 0 9.9 2 12 6.1-1-5-4-10-12-12z" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
      <path d="M4 17.3V20h2.7l8-8-2.7-2.7-8 8zM20.7 7.3a1 1 0 0 0 0-1.4l-2.6-2.6a1 1 0 0 0-1.4 0l-1.7 1.7 4 4 1.7-1.7z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
      <path d="M6 7h12l-1 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 7zm3-4h6a1 1 0 0 1 1 1v2H8V4a1 1 0 0 1 1-1zm-3 2h12a1 1 0 1 1 0 2H6a1 1 0 1 1 0-2z" />
    </svg>
  );
}
