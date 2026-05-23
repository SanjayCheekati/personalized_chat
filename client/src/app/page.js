"use client";

import { useEffect, useRef, useState } from "react";
import ChatShell from "../components/ChatShell";
import MessageInput from "../components/MessageInput";
import MessageList from "../components/MessageList";
import { createSocket } from "../socket/client";
import { fetchMessages, loginWithPassword } from "../services/api";

const AUTH_KEY = "flashchat.auth";
const DEFAULT_PEER = {
  id: null,
  name: "Partner",
  online: false,
  typing: false
};

export default function Home() {
  const [auth, setAuth] = useState(null);
  const [messages, setMessages] = useState([]);
  const [peer, setPeer] = useState(DEFAULT_PEER);
  const [draft, setDraft] = useState("");
  const [replyTarget, setReplyTarget] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [loginForm, setLoginForm] = useState({
    username: "",
    password: ""
  });
  const [status, setStatus] = useState({
    connecting: false,
    connected: false,
    error: ""
  });
  const socketRef = useRef(null);
  const typingRef = useRef({ active: false, timeoutId: null });

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
    if (!auth?.user?.username) {
      return;
    }

    const username = auth.user.username.toLowerCase();
    const name = username === "saba" ? "Arjun" : username === "arjun" ? "Saba" : DEFAULT_PEER.name;
    setPeer((prev) => ({ ...prev, name }));
  }, [auth]);

  useEffect(() => {
    if (!auth) {
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
    if (!auth) {
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

    socket.on("connect_error", (error) => {
      setStatus({ connecting: false, connected: false, error: error?.message || "connect_error" });
    });

    socket.on("room_full", () => {
      setStatus({ connecting: false, connected: false, error: "room_full" });
      socket.disconnect();
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
        online: true
      }));
    });

    socket.on("user_offline", (payload) => {
      setPeer((prev) => ({
        ...prev,
        id: payload?.userId || prev.id,
        online: false,
        typing: false
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

  const handleLogin = async (event) => {
    event.preventDefault();
    setStatus((prev) => ({ ...prev, error: "" }));

    try {
      const data = await loginWithPassword(loginForm.username, loginForm.password);

      const nextAuth = {
        token: data.token,
        user: data.user,
        roomId: data.roomId
      };

      localStorage.setItem(AUTH_KEY, JSON.stringify(nextAuth));
      setAuth(nextAuth);
      setPeer(DEFAULT_PEER);
    } catch (error) {
      setStatus((prev) => ({ ...prev, error: error?.message || "login_failed" }));
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(AUTH_KEY);
    setAuth(null);
    setMessages([]);
    setPeer(DEFAULT_PEER);
    setDraft("");
    setReplyTarget(null);
    setEditingMessage(null);
    setStatus({ connecting: false, connected: false, error: "" });
  };

  const handleSend = (text) => {
    if (!auth || !socketRef.current) {
      return;
    }

    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    if (editingMessage?.id) {
      const editedAt = new Date().toISOString();
      setMessages((prev) => markMessageEdited(prev, editingMessage.id, trimmed, editedAt));
      socketRef.current.emit(
        "edit_message",
        { messageId: editingMessage.id, text: trimmed },
        (ack) => {
          if (!ack?.ok || !ack?.message) {
            setStatus((prev) => ({ ...prev, error: "edit_failed" }));
            return;
          }
          setMessages((prev) => upsertMessage(prev, ack.message, auth.user.id));
        }
      );
      setEditingMessage(null);
      setReplyTarget(null);
      setDraft("");
      return;
    }

    const clientId = makeClientId();
    const replyTo = replyTarget
      ? {
          id: replyTarget.id,
          text: replyTarget.text,
          senderId: replyTarget.senderId
        }
      : null;
    const optimistic = {
      id: null,
      clientId,
      roomId: auth.roomId,
      senderId: auth.user.id,
      receiverId: null,
      text: trimmed,
      replyTo,
      timestamp: new Date().toISOString(),
      seen: false,
      deleted: false,
      edited: false,
      status: "sending"
    };

    setMessages((prev) => [...prev, optimistic]);

    socketRef.current.emit(
      "send_message",
      { text: trimmed, clientId, replyTo },
      (ack) => {
        if (!ack?.message) {
          return;
        }
        setMessages((prev) => upsertMessage(prev, ack.message, auth.user.id));
      }
    );

    setReplyTarget(null);
    setDraft("");
  };

  const handleDelete = (message) => {
    if (!auth || !socketRef.current || !message?.id) {
      return;
    }

    if (!window.confirm("Delete this message for both of you?")) {
      return;
    }

    setMessages((prev) => markMessageDeleted(prev, message.id, auth.user.id));
    socketRef.current.emit("delete_message", { messageId: message.id }, (ack) => {
      if (!ack?.ok) {
        setStatus((prev) => ({ ...prev, error: "delete_failed" }));
      }
    });
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

  if (!auth) {
    return (
      <div className="page-shell flex items-center justify-center">
        <div className="w-full max-w-md rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-dark)] p-8 shadow-glow animate-fade-in">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.4em] text-[var(--accent)]">FlashChat</p>
            <h1 className="mt-3 text-2xl font-semibold text-[var(--ink)]">Sign in</h1>
            <p className="mt-2 text-sm text-[var(--ink-soft)]">
              Use your username and password.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="text"
              required
              value={loginForm.username}
              onChange={(event) =>
                setLoginForm((prev) => ({ ...prev, username: event.target.value }))
              }
              placeholder="Username"
              className="w-full rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
            />
            <input
              type="password"
              required
              value={loginForm.password}
              onChange={(event) =>
                setLoginForm((prev) => ({ ...prev, password: event.target.value }))
              }
              placeholder="Password"
              className="w-full rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
            />

            <button
              type="submit"
              className="w-full rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white shadow-glow transition hover:-translate-y-0.5"
            >
              Sign in
            </button>

            {status.error ? (
              <p className="text-sm text-[var(--accent-warm)]">{status.error}</p>
            ) : null}
          </form>
        </div>
      </div>
    );
  }

  const seenAtMessage = findLatestSeenMessage(messages, auth.user.id);
  const typingPreview = peer.typing ? `${peer.name} is typing...` : "";
  const headerStatus = peer.typing
    ? "typing..."
    : peer.online
    ? "online"
    : "offline";

  return (
    <div className="page-shell">
      <ChatShell
        header={
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bubble-me)] text-sm font-semibold text-white">
                {peer.name?.slice(0, 1) || "?"}
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--ink)]">{peer.name}</p>
                <p className="text-xs text-[var(--ink-soft)]">{headerStatus}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-full border border-[var(--panel-border)] bg-[var(--panel-dark)] p-2 text-[var(--ink-soft)]"
                aria-label="Search"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                  <path d="M15.5 14h-.79l-.28-.27A6 6 0 1 0 14 15.5l.27.28v.79L20 21.5 21.5 20zm-6 0A4.5 4.5 0 1 1 10 5a4.5 4.5 0 0 1-.5 9z" />
                </svg>
              </button>
              <button
                type="button"
                className="rounded-full border border-[var(--panel-border)] bg-[var(--panel-dark)] p-2 text-[var(--ink-soft)]"
                aria-label="Menu"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                  <path d="M12 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 7a2 2 0 1 0-.001-3.999A2 2 0 0 0 12 14zm0 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-full border border-[var(--panel-border)] bg-[var(--panel-dark)] px-3 py-2 text-xs font-semibold text-[var(--ink)]"
              >
                Sign out
              </button>
            </div>
          </div>
        }
        footer={
          <MessageInput
            disabled={!status.connected}
            value={draft}
            onValueChange={setDraft}
            onSend={handleSend}
            onTyping={handleTyping}
            replyTarget={replyTarget}
            onCancelReply={() => setReplyTarget(null)}
            editingMessage={editingMessage}
            onCancelEdit={() => {
              setEditingMessage(null);
              setDraft("");
            }}
            typingPreview={typingPreview}
          />
        }
      >
        <MessageList
          messages={messages}
          currentUserId={auth.user.id}
          onDelete={handleDelete}
          onReply={(message) => {
            if (message.deleted) {
              return;
            }
            setReplyTarget(message);
            setEditingMessage(null);
          }}
          onEdit={(message) => {
            if (message.deleted || !message.id) {
              return;
            }
            setEditingMessage({ id: message.id, text: message.text });
            setDraft(message.text || "");
            setReplyTarget(null);
          }}
        />
        {seenAtMessage ? (
          <p className="mt-3 text-right text-xs text-[var(--ink-soft)]">
            Seen at {formatTime(seenAtMessage.seenAt || seenAtMessage.timestamp)}
          </p>
        ) : null}
      </ChatShell>
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

function markMessageEdited(list, messageId, text, editedAt) {
  return list.map((message) =>
    message.id === messageId
      ? { ...message, text, edited: true, editedAt, status: message.status }
      : message
  );
}

function findLatestSeenMessage(list, currentUserId) {
  const seenMessages = list.filter(
    (message) => message.senderId === currentUserId && message.seen
  );
  if (seenMessages.length === 0) {
    return null;
  }

  return seenMessages.reduce((latest, message) => {
    const latestTime = new Date(latest.seenAt || latest.timestamp).getTime();
    const messageTime = new Date(message.seenAt || message.timestamp).getTime();
    return messageTime > latestTime ? message : latest;
  });
}

function formatTime(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
