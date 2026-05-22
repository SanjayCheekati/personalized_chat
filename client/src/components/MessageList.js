function formatTime(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function MessageList({ messages, currentUserId }) {
  if (!messages.length) {
    return (
      <div className="rounded-3xl border border-white/70 bg-white/70 px-6 py-8 text-center text-sm text-[var(--ink-soft)]">
        Start the conversation.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {messages.map((message) => {
        const isMine = message.senderId === currentUserId;
        const statusText =
          isMine && message.status === "seen"
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
              className={`max-w-[80%] rounded-3xl px-4 py-3 text-sm shadow-glow animate-pop ${
                isMine
                  ? "bg-[var(--bubble-me)] text-white"
                  : "bg-[var(--bubble-them)] text-[var(--ink)]"
              }`}
            >
              <p className="whitespace-pre-wrap leading-relaxed">{message.text}</p>
              <div className="mt-2 flex items-center justify-between text-[11px] opacity-80">
                <span>{formatTime(message.timestamp)}</span>
                {statusText ? <span className="ml-3">{statusText}</span> : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
