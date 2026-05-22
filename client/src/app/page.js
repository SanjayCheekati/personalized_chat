"use client";

import { useEffect, useRef, useState } from "react";
import ChatShell from "../components/ChatShell";
import MessageInput from "../components/MessageInput";
import MessageList from "../components/MessageList";
import PresencePill from "../components/PresencePill";
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
      setMessages((prev) => markMessagesSeen(prev, payload.messageIds));
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

    socketRef.current.emit("seen_message", { messageIds: unseen });
    setMessages((prev) => markMessagesSeen(prev, unseen));
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
      status: "sending"
    };

    setMessages((prev) => [...prev, optimistic]);

    socketRef.current.emit(
      "send_message",
      { text: trimmed, clientId },
      (ack) => {
        if (!ack?.message) {
          return;
        }
        setMessages((prev) => upsertMessage(prev, ack.message, auth.user.id));
      }
    );
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
        <div className="w-full max-w-md rounded-3xl border border-white/70 bg-[var(--panel)] p-8 shadow-glow backdrop-blur animate-fade-in">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--accent)]">FlashChat</p>
            <h1 className="mt-3 text-3xl font-semibold text-[var(--ink)]">Instant 1-to-1 chat</h1>
            <p className="mt-2 text-sm text-[var(--ink-soft)]">
              Sign in with your username and password.
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
              className="w-full rounded-2xl border border-white/70 bg-white/70 px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
            />
            <input
              type="password"
              required
              value={loginForm.password}
              onChange={(event) =>
                setLoginForm((prev) => ({ ...prev, password: event.target.value }))
              }
              placeholder="Password"
              className="w-full rounded-2xl border border-white/70 bg-white/70 px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
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

  return (
    <div className="page-shell">
      <ChatShell
        header={
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--accent)]">FlashChat</p>
              <h2 className="mt-1 text-xl font-semibold text-[var(--ink)]">Chat room</h2>
              <p className="text-xs text-[var(--ink-soft)]">Room: {auth.roomId}</p>
            </div>
            <div className="flex items-center gap-3">
              <PresencePill online={peer.online} typing={peer.typing} />
              <div className="text-xs text-[var(--ink-soft)]">
                {status.connected ? "connected" : status.connecting ? "connecting" : "offline"}
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-full border border-[var(--accent)] px-4 py-1.5 text-xs font-semibold text-[var(--accent)]"
              >
                Sign out
              </button>
            </div>
          </div>
        }
        footer={
          <MessageInput
            disabled={!status.connected}
            onSend={handleSend}
            onTyping={handleTyping}
          />
        }
      >
        <MessageList messages={messages} currentUserId={auth.user.id} />
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
    status: resolveStatus(message, currentUserId)
  }));
}

function resolveStatus(message, currentUserId) {
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

function markMessagesSeen(list, ids) {
  if (!ids || ids.length === 0) {
    return list;
  }

  return list.map((message) =>
    ids.includes(message.id)
      ? { ...message, seen: true, status: "seen" }
      : message
  );
}
