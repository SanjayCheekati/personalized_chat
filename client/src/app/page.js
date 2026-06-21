"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ChatShell from "../components/ChatShell";
import AdminDashboard from "../components/AdminDashboard";
import MessageInput from "../components/MessageInput";
import MessageList from "../components/MessageList";
import { createSocket } from "../socket/client";
import {
  fetchConversation,
  fetchMessages,
  loginWithPassword,
  requestPasswordReset,
  signUp
} from "../services/api";
import {
  checkSubscriptionState,
  subscribeUser,
  unsubscribeUser,
  registerServiceWorker
} from "../utils/pushSubscription";

const AUTH_KEY = "flashchat.auth";
const DEFAULT_PEER = {
  id: null,
  name: "Arjun",
  online: false,
  typing: false,
  lastSeen: null
};

export default function Home() {
  const router = useRouter();
  const [auth, setAuth] = useState(null);
  const [messages, setMessages] = useState([]);
  const [peer, setPeer] = useState(DEFAULT_PEER);
  const [draft, setDraft] = useState("");
  const [replyTarget, setReplyTarget] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme] = useState("dark");
  const [authMode, setAuthMode] = useState("login");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loginForm, setLoginForm] = useState({
    username: "",
    password: ""
  });
  const [signupForm, setSignupForm] = useState({
    username: "",
    password: "",
    confirmPassword: ""
  });
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotForm, setForgotForm] = useState({ username: "", message: "" });
  const [forgotStatus, setForgotStatus] = useState({ loading: false, error: "", done: false });
  const [status, setStatus] = useState({
    connecting: false,
    connected: false,
    error: ""
  });
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [firstUnreadId, setFirstUnreadId] = useState(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const socketRef = useRef(null);
  const typingRef = useRef({ active: false, timeoutId: null });
  const isAdmin = auth?.user?.role === "admin";

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
    registerServiceWorker().catch((err) => console.error("SW registration error:", err));

    checkSubscriptionState().then((subscribed) => {
      setNotificationsEnabled(subscribed);
    });
  }, [auth]);

  useEffect(() => {
    document.body.dataset.theme = "dark";
  }, []);

  useEffect(() => {
    if (!auth?.user) {
      return;
    }
    if (isAdmin) {
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
    setHasMore(false);

    fetchMessages(auth.token, auth.roomId)
      .then((data) => {
        if (!ignore) {
          const fetched = data.messages || [];
          const nextMessages = normalizeMessages(fetched, auth.user.id);
          setMessages(nextMessages);
          setHasMore(fetched.length >= 50);

          const firstUnseen = fetched.find(
            (m) => m.senderId !== auth.user.id && !m.seen
          );
          setFirstUnreadId(firstUnseen ? firstUnseen.id : null);
        }
      })
      .catch((error) => {
        console.error("Failed to fetch messages:", error);
        setStatus((prev) => ({ ...prev, error: "Failed to load messages." }));
      });

    return () => {
      ignore = true;
    };
  }, [auth]);

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore || !auth || !auth.roomId) {
      return;
    }

    setLoadingMore(true);
    const oldestMessage = messages[0];
    const before = oldestMessage ? oldestMessage.timestamp : null;

    if (!before) {
      setHasMore(false);
      setLoadingMore(false);
      return;
    }

    try {
      const data = await fetchMessages(auth.token, auth.roomId, { before, limit: 50 });
      const fetched = data.messages || [];
      if (fetched.length === 0) {
        setHasMore(false);
      } else {
        const normalized = normalizeMessages(fetched, auth.user.id);
        setMessages((prev) => [...normalized, ...prev]);
        setHasMore(fetched.length >= 50);
      }
    } catch (error) {
      console.error("Failed to load older messages:", error);
    } finally {
      setLoadingMore(false);
    }
  };

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

  useEffect(() => {
    if (auth && !isAdmin) {
      const unread = messages.filter((m) => m.senderId !== auth.user.id && !m.seen).length;
      document.title = unread > 0 ? `(${unread}) FlashChat` : "FlashChat";
    } else {
      document.title = "FlashChat";
    }
    return () => {
      document.title = "FlashChat";
    };
  }, [messages, auth, isAdmin]);

  const promptNotifications = (token) => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return;
    }
    setTimeout(async () => {
      try {
        await subscribeUser(token);
        setNotificationsEnabled(true);
      } catch (error) {
        console.log("Auto-notifications prompt failed or was dismissed:", error);
      }
    }, 800);
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setStatus((prev) => ({ ...prev, error: "" }));

    try {
      const data = await loginWithPassword(loginForm.username, loginForm.password);

      const nextAuth = {
        token: data.token,
        user: data.user,
        roomId: data.roomId,
        peer: data.peer || null
      };

      localStorage.setItem(AUTH_KEY, JSON.stringify(nextAuth));
      setAuth(nextAuth);
      setPeer(DEFAULT_PEER);
      promptNotifications(data.token);
    } catch (error) {
      setStatus((prev) => ({ ...prev, error: error?.message || "login_failed" }));
    }
  };

  const handleSignup = async (event) => {
    event.preventDefault();
    setStatus((prev) => ({ ...prev, error: "" }));

    if (signupForm.password !== signupForm.confirmPassword) {
      setStatus((prev) => ({ ...prev, error: "passwords_do_not_match" }));
      return;
    }

    try {
      const data = await signUp(signupForm.username, signupForm.password);

      const nextAuth = {
        token: data.token,
        user: data.user,
        roomId: data.roomId,
        peer: data.peer || null
      };

      localStorage.setItem(AUTH_KEY, JSON.stringify(nextAuth));
      setAuth(nextAuth);
      setPeer(DEFAULT_PEER);
      setSignupForm({ username: "", password: "", confirmPassword: "" });
      promptNotifications(data.token);
    } catch (error) {
      setStatus((prev) => ({ ...prev, error: error?.message || "signup_failed" }));
    }
  };

  const handleLogout = () => {
    if (auth && notificationsEnabled) {
      unsubscribeUser(auth.token).catch(() => {});
    }
    localStorage.removeItem(AUTH_KEY);
    setAuth(null);
    setMessages([]);
    setPeer(DEFAULT_PEER);
    setDraft("");
    setReplyTarget(null);
    setEditingMessage(null);
    setStatus({ connecting: false, connected: false, error: "" });
    setNotificationsEnabled(false);
  };

  const handleToggleNotifications = async () => {
    if (!auth) {
      return;
    }
    try {
      if (notificationsEnabled) {
        await unsubscribeUser(auth.token);
        setNotificationsEnabled(false);
      } else {
        await subscribeUser(auth.token);
        setNotificationsEnabled(true);
      }
    } catch (error) {
      console.error("Failed to toggle notifications:", error);
      alert(error.message || "Failed to toggle notifications.");
    }
  };

  const handleForgotPassword = async (event) => {
    event.preventDefault();
    setForgotStatus({ loading: true, error: "", done: false });

    try {
      await requestPasswordReset(forgotForm.username, forgotForm.message);
      setForgotStatus({ loading: false, error: "", done: true });
      setForgotForm({ username: "", message: "" });
    } catch (error) {
      setForgotStatus({
        loading: false,
        error: error?.message || "request_failed",
        done: false
      });
    }
  };

  const handleSend = (text) => {
    if (!auth || !socketRef.current) {
      return;
    }

    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    setFirstUnreadId(null);

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

  const handleRemember = () => {
    if (!socketRef.current || !auth?.roomId) {
      return;
    }

    const clientId = makeClientId();
    socketRef.current.emit("remember_admin", { clientId }, (ack) => {
      if (!ack?.ok) {
        setStatus((prev) => ({ ...prev, error: "remember_failed" }));
      }
    });
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

          <div className="mb-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAuthMode("login")}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                authMode === "login"
                  ? "bg-[var(--accent)] text-white"
                  : "border border-[var(--panel-border)] text-[var(--ink)]"
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => setAuthMode("signup")}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                authMode === "signup"
                  ? "bg-[var(--accent)] text-white"
                  : "border border-[var(--panel-border)] text-[var(--ink)]"
              }`}
            >
              Sign up
            </button>
          </div>

          {authMode === "login" ? (
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
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={loginForm.password}
                  onChange={(event) =>
                    setLoginForm((prev) => ({ ...prev, password: event.target.value }))
                  }
                  placeholder="Password"
                  className="w-full rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] px-4 py-3 pr-12 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--ink-soft)]"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>

              <button
                type="submit"
                className="w-full rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white shadow-glow transition hover:-translate-y-0.5"
              >
                Sign in
              </button>

              <button
                type="button"
                onClick={() => setForgotOpen((prev) => !prev)}
                className="w-full rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] px-4 py-2 text-xs font-semibold text-[var(--ink)]"
              >
                Forgot password?
              </button>

              {status.error ? (
                <p className="text-sm text-[var(--accent-warm)]">{status.error}</p>
              ) : null}
            </form>
          ) : (
            <form onSubmit={handleSignup} className="space-y-4">
              <input
                type="text"
                required
                value={signupForm.username}
                onChange={(event) =>
                  setSignupForm((prev) => ({ ...prev, username: event.target.value }))
                }
                placeholder="Username"
                className="w-full rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
              />
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={signupForm.password}
                  onChange={(event) =>
                    setSignupForm((prev) => ({ ...prev, password: event.target.value }))
                  }
                  placeholder="Password"
                  className="w-full rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] px-4 py-3 pr-12 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--ink-soft)]"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  required
                  value={signupForm.confirmPassword}
                  onChange={(event) =>
                    setSignupForm((prev) => ({ ...prev, confirmPassword: event.target.value }))
                  }
                  placeholder="Confirm password"
                  className="w-full rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] px-4 py-3 pr-12 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--ink-soft)]"
                >
                  {showConfirmPassword ? "Hide" : "Show"}
                </button>
              </div>

              <button
                type="submit"
                className="w-full rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white shadow-glow transition hover:-translate-y-0.5"
              >
                Create account
              </button>

              {status.error ? (
                <p className="text-sm text-[var(--accent-warm)]">{status.error}</p>
              ) : null}
            </form>
          )}

          {forgotOpen ? (
            <form onSubmit={handleForgotPassword} className="mt-6 space-y-3">
              <input
                type="text"
                required
                value={forgotForm.username}
                onChange={(event) =>
                  setForgotForm((prev) => ({ ...prev, username: event.target.value }))
                }
                placeholder="Username"
                className="w-full rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
              />
              <textarea
                required
                value={forgotForm.message}
                onChange={(event) =>
                  setForgotForm((prev) => ({ ...prev, message: event.target.value }))
                }
                placeholder="Describe the issue"
                rows={3}
                className="w-full rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
              />
              <button
                type="submit"
                disabled={forgotStatus.loading}
                className="w-full rounded-2xl bg-[var(--accent)] px-4 py-3 text-xs font-semibold text-white shadow-glow"
              >
                {forgotStatus.loading ? "Sending..." : "Send request"}
              </button>
              {forgotStatus.error ? (
                <p className="text-xs text-[var(--accent-warm)]">{forgotStatus.error}</p>
              ) : null}
              {forgotStatus.done ? (
                <p className="text-xs text-[var(--ink-soft)]">
                  Request submitted. Arjun will review it soon.
                </p>
              ) : null}
            </form>
          ) : null}
        </div>
      </div>
    );
  }

  if (isAdmin) {
    return (
      <AdminDashboard
        auth={auth}
        theme={theme}
        onLogout={handleLogout}
        notificationsEnabled={notificationsEnabled}
        onToggleNotifications={handleToggleNotifications}
      />
    );
  }

  const seenAtMessage = findLatestSeenMessage(messages, auth.user.id);
  const typingPreview = peer.typing ? `${peer.name} is typing...` : "";
  const headerStatus = peer.typing
    ? "typing..."
    : peer.online
    ? "online"
    : peer.lastSeen
    ? `last seen ${formatLastSeen(peer.lastSeen)}`
    : "offline";

  return (
    <div className="page-shell chat-fixed">
      <ChatShell
        header={
          <div className="flex w-full flex-nowrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-sm text-[#ef4b5f]">
                ❤️
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--ink)]">{peer.name}</p>
                <p className="text-xs text-[var(--ink-soft)]">{headerStatus}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={handleRemember}
                className="rounded-full bg-[var(--accent)] px-3 py-2 text-[10px] font-semibold text-white transition hover:-translate-y-0.5"
              >
                Remember
              </button>
              <button
                type="button"
                onClick={handleToggleNotifications}
                className="rounded-full border border-[var(--panel-border)] bg-[var(--panel-dark)] p-2 transition hover:-translate-y-0.5"
                aria-label="Toggle notifications"
              >
                <BellIcon enabled={notificationsEnabled} />
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-full border border-[var(--panel-border)] bg-[var(--panel-dark)] px-3 py-2 text-xs font-semibold text-[var(--ink)] transition hover:-translate-y-0.5"
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
            theme={theme}
            keepFocus
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
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={handleLoadMore}
          firstUnreadId={firstUnreadId}
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

function formatLastSeen(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isToday) {
    return formatTime(value);
  }

  return `${date.toLocaleDateString([], { month: "short", day: "numeric" })} ${formatTime(value)}`;
}

function BellIcon({ enabled }) {
  if (enabled) {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current text-[var(--accent)]" aria-hidden="true">
        <path d="M12 22a2.01 2.01 0 0 0 2-2h-4a2.01 2.01 0 0 0 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current text-[var(--ink-soft)]" aria-hidden="true">
      <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z" />
    </svg>
  );
}

