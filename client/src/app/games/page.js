"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import MessageInput from "../../components/MessageInput";
import MessageList from "../../components/MessageList";
import { createSocket } from "../../socket/client";
import { fetchConversation, fetchMessages } from "../../services/api";

const AUTH_KEY = "flashchat.auth";
const DEFAULT_PEER = {
  id: null,
  name: "Arjun",
  online: false,
  typing: false,
  lastSeen: null
};

const GAMES = [
  {
    title: "TikTok Toy",
    subtitle: "Fast reflex multiplayer",
    status: "Coming soon"
  },
  {
    title: "Emoji Dash",
    subtitle: "Race to match emojis",
    status: "Coming soon"
  },
  {
    title: "Love Dice",
    subtitle: "Roll and play together",
    status: "Coming soon"
  },
  {
    title: "Word Duel",
    subtitle: "Quick word battles",
    status: "Coming soon"
  },
  {
    title: "Memory Flip",
    subtitle: "Match cards, score points",
    status: "Coming soon"
  },
  {
    title: "Pixel Pong",
    subtitle: "Classic pong for two",
    status: "Coming soon"
  }
];

export default function GamesPage() {
  const router = useRouter();
  const [auth, setAuth] = useState(null);
  const [messages, setMessages] = useState([]);
  const [peer, setPeer] = useState(DEFAULT_PEER);
  const [status, setStatus] = useState({ connecting: false, connected: false, error: "" });
  const [draft, setDraft] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const socketRef = useRef(null);
  const typingRef = useRef({ active: false, timeoutId: null });
  const isAdmin =
    auth?.user?.role === "admin" || auth?.user?.username?.toLowerCase() === "arjun";

  useEffect(() => {
    const stored = localStorage.getItem(AUTH_KEY);
    if (!stored) {
      return;
    }

    try {
      setAuth(JSON.parse(stored));
    } catch {
      localStorage.removeItem(AUTH_KEY);
    }
  }, []);

  useEffect(() => {
    if (!auth?.user) {
      return;
    }

    if (auth.peer) {
      setPeer({
        ...DEFAULT_PEER,
        id: auth.peer.id || null,
        name: auth.peer.name || DEFAULT_PEER.name
      });
      return;
    }

    setPeer((prev) => ({ ...prev, name: DEFAULT_PEER.name }));
  }, [auth]);

  useEffect(() => {
    if (!auth || !auth.roomId) {
      return;
    }

    let ignore = false;

    fetchMessages(auth.token, auth.roomId)
      .then((data) => {
        if (!ignore) {
          const nextMessages = normalizeMessages(data.messages || [], auth.user.id);
          setMessages(nextMessages);
        }
      })
      .catch(() => {});

    return () => {
      ignore = true;
    };
  }, [auth]);

  useEffect(() => {
    if (!auth || isAdmin) {
      return;
    }

    if (auth.roomId && auth.peer) {
      return;
    }

    fetchConversation(auth.token)
      .then((data) => {
        if (!data?.conversation) {
          return;
        }
        const nextAuth = {
          ...auth,
          roomId: data.conversation.id,
          peer: data.peer || auth.peer
        };
        localStorage.setItem(AUTH_KEY, JSON.stringify(nextAuth));
        setAuth(nextAuth);
      })
      .catch(() => {});
  }, [auth]);

  useEffect(() => {
    if (!auth || !auth.roomId) {
      return;
    }

    const socket = createSocket({ token: auth.token, roomId: auth.roomId });
    socketRef.current = socket;
    setStatus((prev) => ({ ...prev, connecting: true, error: "" }));
    socket.connect();

    socket.on("connect", () => {
      setStatus({ connecting: false, connected: true, error: "" });
    });

    socket.on("disconnect", () => {
      setStatus((prev) => ({ ...prev, connected: false }));
    });

    socket.on("receive_message", (message) => {
      setMessages((prev) => upsertMessage(prev, message, auth.user.id));
    });

    socket.on("message_seen", (payload) => {
      if (!payload?.messageIds) {
        return;
      }
      setMessages((prev) => markMessagesSeen(prev, payload.messageIds, payload.seenAt));
    });

    socket.on("message_deleted", (payload) => {
      if (!payload?.messageId) {
        return;
      }
      setMessages((prev) => markMessageDeleted(prev, payload.messageId, payload.deletedBy));
    });

    socket.on("message_edited", (payload) => {
      if (!payload?.message) {
        return;
      }
      setMessages((prev) => upsertMessage(prev, payload.message, auth.user.id));
    });

    socket.on("user_online", (payload) => {
      setPeer((prev) => ({
        ...prev,
        id: payload?.userId || prev.id,
        online: true,
        lastSeen: null
      }));
    });

    socket.on("user_offline", (payload) => {
      setPeer((prev) => ({
        ...prev,
        id: payload?.userId || prev.id,
        online: false,
        typing: false,
        lastSeen: payload?.lastSeen || new Date().toISOString()
      }));
    });

    socket.on("user_typing", (payload) => {
      setPeer((prev) => ({
        ...prev,
        id: payload?.userId || prev.id,
        typing: Boolean(payload?.typing)
      }));
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [auth]);

  useEffect(() => {
    if (!auth || !socketRef.current) {
      return;
    }

    const unseen = messages
      .filter((message) => message.senderId !== auth.user.id && !message.seen)
      .map((message) => message.id)
      .filter(Boolean);

    if (unseen.length === 0) {
      return;
    }

    const seenAt = new Date().toISOString();
    socketRef.current.emit("seen_message", { messageIds: unseen, seenAt });
    setMessages((prev) => markMessagesSeen(prev, unseen, seenAt));
  }, [messages, auth]);

  const handleSend = (text) => {
    if (!auth || !socketRef.current) {
      return;
    }

    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    const clientId = makeClientId();
    const optimistic = {
      id: null,
      clientId,
      roomId: auth.roomId,
      senderId: auth.user.id,
      receiverId: null,
      text: trimmed,
      timestamp: new Date().toISOString(),
      seen: false,
      deleted: false,
      edited: false,
      status: "sending"
    };

    setMessages((prev) => [...prev, optimistic]);

    socketRef.current.emit("send_message", { text: trimmed, clientId }, (ack) => {
      if (!ack?.message) {
        return;
      }
      setMessages((prev) => upsertMessage(prev, ack.message, auth.user.id));
    });

    setDraft("");
  };

  const handleTyping = (hasText) => {
    const socket = socketRef.current;
    if (!auth || !socket) {
      return;
    }

    if (hasText && !typingRef.current.active) {
      socket.emit("typing");
      typingRef.current.active = true;
    }

    if (!hasText && typingRef.current.active) {
      socket.emit("stop_typing");
      typingRef.current.active = false;
    }

    if (typingRef.current.timeoutId) {
      clearTimeout(typingRef.current.timeoutId);
    }

    if (hasText) {
      typingRef.current.timeoutId = setTimeout(() => {
        socket.emit("stop_typing");
        typingRef.current.active = false;
      }, 1200);
    }
  };

  const typingPreview = peer.typing ? `${peer.name} is typing...` : "";

  return (
    <div className="page-shell">
      <div className="flex min-h-screen w-full flex-col bg-[var(--bg)] px-4 py-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-[var(--accent)]">FlashChat</p>
            <h1 className="mt-2 text-2xl font-semibold text-[var(--ink)]">Games</h1>
            <p className="text-sm text-[var(--ink-soft)]">Multiplayer games for two.</p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="rounded-full border border-[var(--panel-border)] bg-[var(--panel-dark)] px-4 py-2 text-xs font-semibold text-[var(--ink)]"
          >
            Back to chat
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {GAMES.map((game) => (
            <div
              key={game.title}
              className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-dark)] p-4"
            >
              <p className="text-sm font-semibold text-[var(--ink)]">{game.title}</p>
              <p className="mt-1 text-xs text-[var(--ink-soft)]">{game.subtitle}</p>
              <span className="mt-3 inline-flex rounded-full border border-[var(--panel-border)] bg-[var(--panel)] px-3 py-1 text-[11px] text-[var(--ink-soft)]">
                {game.status}
              </span>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setChatOpen((prev) => !prev)}
          className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-glow"
          aria-label="Chat"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
            <path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2z" />
          </svg>
        </button>

        {chatOpen ? (
          <div className="fixed bottom-20 right-4 z-40 flex w-[320px] max-w-[90vw] flex-col overflow-hidden rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-dark)] shadow-glow">
            <div className="flex items-center justify-between border-b border-[var(--panel-border)] bg-[var(--panel)] px-3 py-2">
              <div>
                <p className="text-sm font-semibold text-[var(--ink)]">{peer.name}</p>
                <p className="text-xs text-[var(--ink-soft)]">
                  {status.connected ? "online" : status.connecting ? "connecting" : "offline"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setChatOpen(false)}
                className="text-lg text-[var(--ink-soft)]"
                aria-label="Close chat"
              >
                ×
              </button>
            </div>
            <div className="chat-scroll max-h-[280px] overflow-y-auto px-3 py-3">
              <MessageList messages={messages} currentUserId={auth?.user?.id || ""} />
            </div>
            <div className="border-t border-[var(--panel-border)] bg-[var(--panel)] px-2 py-2">
              <MessageInput
                disabled={!status.connected}
                value={draft}
                onValueChange={setDraft}
                onSend={handleSend}
                onTyping={handleTyping}
                replyTarget={null}
                editingMessage={null}
                typingPreview={typingPreview}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function makeClientId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeMessages(list, currentUserId) {
  return list.map((message) => ({
    ...message,
    deleted: Boolean(message.deleted),
    edited: Boolean(message.edited),
    seenAt: message.seenAt || null,
    status: resolveStatus(message, currentUserId)
  }));
}

function resolveStatus(message, currentUserId) {
  if (message.deleted) {
    return "deleted";
  }
  if (message.senderId === currentUserId) {
    if (message.seen) {
      return "seen";
    }
    return "delivered";
  }
  return "received";
}

function upsertMessage(list, message, currentUserId) {
  const nextStatus = resolveStatus(message, currentUserId);
  const nextMessage = { ...message, status: nextStatus };

  const index = list.findIndex((item) =>
    item.id ? item.id === nextMessage.id : item.clientId && item.clientId === nextMessage.clientId
  );

  if (index === -1) {
    return [...list, nextMessage];
  }

  const updated = [...list];
  updated[index] = { ...updated[index], ...nextMessage };
  return updated;
}

function markMessagesSeen(list, ids, seenAt) {
  if (!ids || ids.length === 0) {
    return list;
  }

  return list.map((message) =>
    ids.includes(message.id)
      ? { ...message, seen: true, seenAt: seenAt || message.seenAt, status: "seen" }
      : message
  );
}

function markMessageDeleted(list, messageId, deletedBy) {
  return list.map((message) =>
    message.id === messageId
      ? { ...message, deleted: true, deletedBy, status: "deleted" }
      : message
  );
}
