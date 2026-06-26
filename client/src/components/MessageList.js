import { useEffect, useMemo, useRef, useState, useCallback, Fragment } from "react";
import { groupMessagesByDate, formatDateSeparator } from "../utils/date";

function formatTime(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const isSingleEmoji = (text) => {
  if (!text) return false;
  const trimmed = text.trim();
  try {
    const segmenter = new Intl.Segmenter();
    const segments = Array.from(segmenter.segment(trimmed));
    return segments.length === 1 && /[\p{Emoji_Presentation}\p{Emoji_Modifier_Base}\p{Emoji_Component}]/u.test(trimmed);
  } catch (e) {
    return /^[\p{Emoji_Presentation}\p{Emoji_Modifier_Base}\p{Emoji_Component}\u200D\uFE0F]+$/u.test(trimmed) && trimmed.length <= 8;
  }
};

function parseTextWithLinks(text) {
  const URL_REGEX = /(?:https?:\/\/|www\.)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?|(?<![\w@])[a-zA-Z0-9-]+\.(?:com|net|org|io|dev|co|in|info|app|gov|edu|me|xyz)(?:\/[^\s]*)?/gi;

  const parts = [];
  let lastIndex = 0;
  let match;

  URL_REGEX.lastIndex = 0;

  while ((match = URL_REGEX.exec(text)) !== null) {
    let matchStr = match[0];
    let matchIndex = match.index;

    const trailingPuncRegex = /[.,!?;:)\]}]+$/;
    let trailingPuncLength = 0;
    const puncMatch = matchStr.match(trailingPuncRegex);
    if (puncMatch) {
      trailingPuncLength = puncMatch[0].length;
      matchStr = matchStr.slice(0, -trailingPuncLength);
    }

    if (matchIndex > lastIndex) {
      parts.push({ type: "text", content: text.substring(lastIndex, matchIndex) });
    }

    let href = matchStr;
    if (!/^https?:\/\//i.test(href)) {
      href = "http://" + href;
    }

    parts.push({ type: "link", content: matchStr, href });

    lastIndex = URL_REGEX.lastIndex - trailingPuncLength;
    URL_REGEX.lastIndex = lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", content: text.substring(lastIndex) });
  }

  return parts;
}

function parseEmojis(text, chunkIndex) {
  const emojiRegex = /(\p{Emoji_Presentation}|\p{Emoji_Modifier_Base}\p{Emoji_Modifier}?|\p{Emoji}\uFE0F)(?:\u200D(\p{Emoji_Presentation}|\p{Emoji_Modifier_Base}\p{Emoji_Modifier}?|\p{Emoji}\uFE0F))*/gu;
  
  const parts = [];
  let lastIndex = 0;
  let match;
  
  emojiRegex.lastIndex = 0;
  
  while ((match = emojiRegex.exec(text)) !== null) {
    const matchIndex = match.index;
    const matchStr = match[0];
    
    if (matchIndex > lastIndex) {
      parts.push(text.substring(lastIndex, matchIndex));
    }
    
    parts.push(
      <span key={`emoji-${chunkIndex}-${matchIndex}`} className="inline-block text-[1.4em] mx-[0.05em] align-middle leading-none">
        {matchStr}
      </span>
    );
    
    lastIndex = emojiRegex.lastIndex;
  }
  
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }
  
  return parts.length > 0 ? parts : text;
}

function formatMessageText(text) {
  if (!text) return "";
  
  if (isSingleEmoji(text)) {
    return <span className="text-5xl inline-block leading-none py-1 align-middle">{text}</span>;
  }
  
  const chunks = parseTextWithLinks(text);
  const result = [];
  
  chunks.forEach((chunk, index) => {
    if (chunk.type === "link") {
      result.push(
        <a
          key={`link-${index}`}
          href={chunk.href}
          target="_blank"
          rel="noopener noreferrer"
          className="chat-link"
        >
          {chunk.content}
        </a>
      );
    } else {
      const emojiParts = parseEmojis(chunk.content, index);
      if (Array.isArray(emojiParts)) {
        result.push(...emojiParts);
      } else {
        result.push(emojiParts);
      }
    }
  });
  
  return result;
}

export default function MessageList({
  messages = [],
  currentUserId,
  isAdmin = false,
  onDelete,
  onReply,
  onEdit,
  onReact,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  firstUnreadId = null,
}) {
  const endRef = useRef(null);
  const listRef = useRef(null);
  const prevMessagesLength = useRef(0);
  const prevScrollHeight = useRef(0);
  const prevLastMessageIdRef = useRef(null);

  const filteredMessages = useMemo(() => messages.filter((m) => !m.deleted), [messages]);
  const groupedMessages = useMemo(() => groupMessagesByDate(filteredMessages), [filteredMessages]);

  useEffect(() => {
    const container = listRef.current?.parentElement;
    if (!container) {
      return;
    }

    const lastMessage = filteredMessages[filteredMessages.length - 1];
    const lastId = lastMessage ? (lastMessage.id || lastMessage.clientId) : null;

    if (filteredMessages.length > prevMessagesLength.current) {
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
    } else if (filteredMessages.length > 0 && prevMessagesLength.current === 0) {
      // Initial load
      const marker = endRef.current;
      if (marker) {
        marker.scrollIntoView({ behavior: "auto" });
      }
    }

    prevMessagesLength.current = filteredMessages.length;
    prevScrollHeight.current = container.scrollHeight;
    prevLastMessageIdRef.current = lastId;
  }, [filteredMessages]);

  return (
    <div ref={listRef} className="flex min-h-full flex-col gap-3">
      <div className="mt-auto" />
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
        const isRemember = message.kind === "remember";

        if (isRemember) {
          const senderName = message.text?.split(" Remembered")[0] || "Someone";
          const formattedTime = formatTime(message.timestamp);
          return (
            <div
              key={message.id || message.clientId || Math.random()}
              className="mx-auto rounded-full border border-[var(--panel-border)] bg-[var(--panel)] px-4 py-1 text-[11px] text-[var(--ink-soft)]"
            >
              {senderName} Remembered you at {formattedTime}
            </div>
          );
        }

        const showNewMessagesLine = message.id === firstUnreadId;

        return (
          <Fragment key={message.id || message.clientId || Math.random()}>
            {showNewMessagesLine ? (
              <div className="flex items-center gap-3 my-3 shrink-0 animate-fade-in">
                <div className="flex-1 h-[1px] bg-[var(--accent-warm)] opacity-30" />
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent-warm)] bg-[var(--panel-dark)] px-3 py-1 rounded-full border border-[var(--panel-border)] shrink-0 shadow-sm">
                  New Messages
                </span>
                <div className="flex-1 h-[1px] bg-[var(--accent-warm)] opacity-30" />
              </div>
            ) : null}
            <div
              className={`group flex animate-pop ${isMine ? "justify-end" : "justify-start"}`}
            >
              <div className="relative max-w-[80%] sm:max-w-[70%]">
                <div
                  className={`rounded-2xl border px-3 py-2 text-sm ${
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

                  <p className="whitespace-pre-wrap break-words">
                    {formatMessageText(message.text)}
                    <span className="inline-block w-4" />
                    <span className="inline-flex items-center gap-1 text-[9px] text-[var(--ink-soft)] float-right mt-1.5 select-none font-medium">
                      <span>{formatTime(message.timestamp)}</span>
                      {isMine ? <StatusTicks status={message.status} /> : null}
                    </span>
                  </p>

                  {/* Hover toolbar */}
                  <div className="absolute -top-3 right-2 hidden items-center gap-1 group-hover:flex">
                    {isAdmin ? (
                      <>
                        {onDelete ? (
                          <button
                            type="button"
                            onClick={() => onDelete(message)}
                            className="rounded-full border border-[var(--panel-border)] bg-[var(--panel)] p-1.5 text-[var(--accent-warm)] shadow-sm transition hover:text-[var(--ink)]"
                            aria-label="Delete"
                          >
                            <TrashIcon />
                          </button>
                        ) : null}
                        {onEdit ? (
                          <button
                            type="button"
                            onClick={() => onEdit(message)}
                            className="rounded-full border border-[var(--panel-border)] bg-[var(--panel)] p-1.5 text-[var(--ink-soft)] shadow-sm transition hover:text-[var(--ink)]"
                            aria-label="Edit"
                          >
                            <EditIcon />
                          </button>
                        ) : null}
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
                      </>
                    ) : (
                      <>
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
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </Fragment>
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
