"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import MessageInput from "./MessageInput";
import MessageList from "./MessageList";
import { createSocket } from "../socket/client";
import {
  fetchAdminConversations,
  fetchAdminUsers,
  fetchMessages,
  resetUserPassword,
  deleteUser
} from "../services/api";

const DEFAULT_STATUS = { connecting: false, connected: false, error: "" };

export default function AdminDashboard({
  auth,
  theme,
  onLogout,
  notificationsEnabled,
  onToggleNotifications
}) {
  const router = useRouter();
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [replyTarget, setReplyTarget] = useState(null);
  const [status, setStatus] = useState(DEFAULT_STATUS);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [firstUnreadId, setFirstUnreadId] = useState(null);
  const [sidebarQuery, setSidebarQuery] = useState("");
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [userQuery, setUserQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [typingByConversation, setTypingByConversation] = useState({});
  const [passwordDrafts, setPasswordDrafts] = useState({});
  const socketRef = useRef(null);
  const typingRef = useRef({ active: false, timeoutId: null });
  const activeConversationRef = useRef(null);

  const totalUnreadCount = useMemo(() => {
    return conversations.reduce((total, conv) => total + (conv.unreadCount || 0), 0);
  }, [conversations]);

  useEffect(() => {
    document.title = totalUnreadCount > 0 ? `(${totalUnreadCount}) FlashChat` : "FlashChat";
    return () => {
      document.title = "FlashChat";
    };
  }, [totalUnreadCount]);

  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === activeConversationId) || null,
    [conversations, activeConversationId]
  );
  const activeUser = activeConversation?.user || null;

  useEffect(() => {
    activeConversationRef.current = activeConversationId;
  }, [activeConversationId]);

  const refreshConversations = () => {
    fetchAdminConversations(auth.token)
      .then((data) => {
        const next = Array.isArray(data.conversations) ? data.conversations : [];
        setConversations(sortConversations(next));
      })
      .catch(() => {});
  };

  useEffect(() => {
    refreshConversations();

    fetchAdminUsers(auth.token)
      .then((data) => setUsers(Array.isArray(data.users) ? data.users : []))
      .catch(() => {});

  }, [auth.token]);

  useEffect(() => {
    const socket = createSocket({ token: auth.token });
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

    socket.on("user_typing", (payload) => {
      const currentId = activeConversationRef.current;
      if (!currentId) {
        return;
      }
      setTypingByConversation((prev) => ({
        ...prev,
        [currentId]: Boolean(payload?.typing)
      }));
    });

    socket.on("admin_conversation_update", (payload) => {
      if (!payload?.id) {
        return;
      }

      setConversations((prev) => {
        const index = prev.findIndex((item) => item.id === payload.id);
        if (index === -1) {
          refreshConversations();
          return prev;
        }

        const unreadCount = payload.unreadBy ? payload.unreadBy[auth.user.id] || 0 : 0;
        const updated = {
          ...prev[index],
          lastMessage: payload.lastMessage || prev[index].lastMessage,
          lastMessageAt: payload.lastMessageAt || prev[index].lastMessageAt,
          unreadCount,
          updatedAt: payload.updatedAt || prev[index].updatedAt
        };
        const next = [...prev];
        next[index] = updated;
        return sortConversations(next);
      });
    });

    socket.on("admin_presence_update", (payload) => {
      if (!payload?.userId) {
        return;
      }
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.user?.id === payload.userId
            ? {
                ...conversation,
                online: payload.online,
                user: {
                  ...conversation.user,
                  lastSeenAt: payload.lastSeen || conversation.user.lastSeenAt
                }
              }
            : conversation
        )
      );
      setUsers((prev) =>
        prev.map((user) =>
          user.id === payload.userId
            ? { ...user, online: payload.online, lastSeenAt: payload.lastSeen || user.lastSeenAt }
            : user
        )
      );
    });

    socket.on("admin_typing", (payload) => {
      if (!payload?.conversationId) {
        return;
      }
      setTypingByConversation((prev) => ({
        ...prev,
        [payload.conversationId]: Boolean(payload.typing)
      }));
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [auth.token, auth.user.id]);

  useEffect(() => {
    if (!activeConversationId || !auth.token) {
      setMessages([]);
      setDraft("");
      setReplyTarget(null);
      setHasMore(false);
      setFirstUnreadId(null);
      return;
    }

    setConversations((prev) =>
      prev.map((conversation) =>
        conversation.id === activeConversationId
          ? { ...conversation, unreadCount: 0 }
          : conversation
      )
    );

    let ignore = false;
    setHasMore(false);

    fetchMessages(auth.token, activeConversationId)
      .then((data) => {
        if (!ignore) {
          const fetched = data.messages || [];
          setMessages(normalizeMessages(fetched, auth.user.id));
          setHasMore(fetched.length >= 50);

          const firstUnseen = fetched.find(
            (m) => m.senderId !== auth.user.id && !m.seen
          );
          setFirstUnreadId(firstUnseen ? firstUnseen.id : null);
        }
      })
      .catch(() => {});

    if (socketRef.current) {
      socketRef.current.emit("join_conversation", { conversationId: activeConversationId });
    }

    return () => {
      ignore = true;
    };
  }, [activeConversationId, auth.token, auth.user.id]);

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore || !auth.token || !activeConversationId) {
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
      const data = await fetchMessages(auth.token, activeConversationId, { before, limit: 50 });
      const fetched = data.messages || [];
      if (fetched.length === 0) {
        setHasMore(false);
      } else {
        const normalized = normalizeMessages(fetched, auth.user.id);
        setMessages((prev) => [...normalized, ...prev]);
        setHasMore(fetched.length >= 50);
      }
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (!socketRef.current || !activeConversationId) {
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
  }, [messages, auth.user.id, activeConversationId]);

  const handleSend = (text) => {
    if (!socketRef.current || !activeConversationId) {
      return;
    }

    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    setFirstUnreadId(null);

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
      roomId: activeConversationId,
      senderId: auth.user.id,
      receiverId: activeConversation?.user?.id || null,
      text: trimmed,
      replyTo,
      timestamp: new Date().toISOString(),
      seen: false,
      deleted: false,
      edited: false,
      status: "sending"
    };

    setMessages((prev) => [...prev, optimistic]);

    socketRef.current.emit("send_message", { text: trimmed, clientId, replyTo }, (ack) => {
      if (!ack?.message) {
        return;
      }
      setMessages((prev) => upsertMessage(prev, ack.message, auth.user.id));
    });

    setReplyTarget(null);
    setDraft("");
  };

  const handleTyping = (hasText) => {
    const socket = socketRef.current;
    if (!socket) {
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

  const handlePasswordReset = (userId) => {
    const nextPassword = passwordDrafts[userId];
    if (!nextPassword) {
      return;
    }

    resetUserPassword(auth.token, userId, nextPassword)
      .then(() => {
        setPasswordDrafts((prev) => ({ ...prev, [userId]: "" }));
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, plainPassword: nextPassword } : u))
        );
      })
      .catch(() => {});
  };

  const handleDeleteUser = (userId) => {
    if (!window.confirm("Delete this user?")) {
      return;
    }

    deleteUser(auth.token, userId)
      .then(() => {
        setUsers((prev) => prev.filter((user) => user.id !== userId));
      })
      .catch(() => {});
  };

  const handleOpenAdminPanel = () => {
    setAdminPanelOpen(true);
    setReplyTarget(null);
  };



  const handleBack = () => {
    if (adminPanelOpen) {
      setAdminPanelOpen(false);
      return;
    }

    if (activeConversationId) {
      setActiveConversationId(null);
    }
  };


  const filteredConversations = useMemo(() => {
    const query = sidebarQuery.trim().toLowerCase();
    if (!query) {
      return conversations;
    }
    return conversations.filter((conversation) =>
      `${conversation.user?.username || ""} ${conversation.user?.name || ""}`
        .toLowerCase()
        .includes(query)
    );
  }, [conversations, sidebarQuery]);

  const typingPreview = activeConversationId
    ? typingByConversation[activeConversationId]
      ? "User is typing..."
      : ""
    : "";

  const filteredUsers = useMemo(() => {
    const query = userQuery.trim().toLowerCase();
    if (!query) {
      return users;
    }
    return users.filter((user) =>
      `${user.username || ""} ${user.name || ""}`.toLowerCase().includes(query)
    );
  }, [users, userQuery]);

  const showBack = adminPanelOpen || Boolean(activeConversationId);
  const headerTitle = adminPanelOpen
    ? "Users"
    : activeConversationId
    ? activeUser?.name || activeUser?.username || "Chat"
    : totalUnreadCount > 0
    ? `Chats (${totalUnreadCount} new)`
    : "Chats";
  const headerStatus = adminPanelOpen
    ? `${users.length} users`
    : activeConversationId
    ? typingByConversation[activeConversationId]
      ? "typing..."
      : activeConversation?.online
      ? "online"
      : activeUser?.lastSeenAt
      ? `last seen ${formatLastSeen(activeUser.lastSeenAt)}`
      : "offline"
    : `${conversations.length} conversations`;

  return (
    <div className="page-shell admin-shell chat-fixed">
      <div className="flex min-h-screen h-[100dvh] w-full flex-col">
        <header className="sticky top-0 z-30 border-b border-[var(--panel-border)] bg-[var(--panel)] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {showBack ? (
                <button
                  type="button"
                  onClick={handleBack}
                  className="rounded-full border border-[var(--panel-border)] bg-[var(--panel-dark)] p-2 text-[var(--ink)]"
                  aria-label="Back"
                >
                  <BackIcon />
                </button>
              ) : null}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--ink)]">
                  {headerTitle}
                </p>
                <p className="truncate text-xs text-[var(--ink-soft)]">{headerStatus}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onToggleNotifications}
                className="rounded-full border border-[var(--panel-border)] bg-[var(--panel-dark)] p-2 transition hover:-translate-y-0.5"
                aria-label="Toggle notifications"
              >
                <BellIcon enabled={notificationsEnabled} />
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="rounded-full border border-[var(--panel-border)] bg-[var(--panel-dark)] p-2 text-[var(--accent-warm)]"
                aria-label="Sign out"
              >
                <SignOutIcon />
              </button>
              {!adminPanelOpen ? (
                <button
                  type="button"
                  onClick={handleOpenAdminPanel}
                  className="rounded-full border border-[var(--panel-border)] bg-[var(--panel-dark)] p-2 text-[var(--ink)]"
                  aria-label="Admin panel"
                >
                  <DotsIcon />
                </button>
              ) : null}
            </div>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {adminPanelOpen ? (
            <section className="admin-panel flex-1 overflow-y-auto px-4 py-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--ink-soft)]">
                    Users
                  </p>
                  <p className="text-lg font-semibold text-[var(--ink)]">
                    {users.length}
                  </p>
                </div>
              </div>

              <input
                type="text"
                value={userQuery}
                onChange={(event) => setUserQuery(event.target.value)}
                placeholder="Search users"
                className="mb-4 w-full rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] px-3 py-2 text-xs text-[var(--ink)]"
              />

              <div className="space-y-4">
                {filteredUsers.map((user) => (
                  <div
                    key={user.id}
                    className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-dark)] p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-[var(--ink)]">@{user.username}</p>
                        {user.plainPassword ? (
                          <p className="text-xs text-[var(--ink-soft)] mt-1.5 flex items-center gap-1.5">
                            Password: <span className="font-mono bg-[var(--panel)] px-2 py-0.5 rounded border border-[var(--panel-border)] text-[var(--ink)]">{user.plainPassword}</span>
                          </p>
                        ) : (
                          <p className="text-xs text-[var(--ink-soft)] mt-1.5 italic">
                            Password: not stored
                          </p>
                        )}
                      </div>
                      <span className="text-[10px] uppercase text-[var(--ink-soft)]">
                        {user.online ? "online" : "offline"}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <input
                        type="text"
                        value={passwordDrafts[user.id] || ""}
                        onChange={(event) =>
                          setPasswordDrafts((prev) => ({
                            ...prev,
                            [user.id]: event.target.value
                          }))
                        }
                        placeholder="Password"
                        className="flex-1 rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] px-3 py-2 text-[11px] text-[var(--ink)]"
                      />
                      <button
                        type="button"
                        onClick={() => handlePasswordReset(user.id)}
                        className="rounded-full border border-[var(--panel-border)] bg-[var(--panel)] p-2 text-[var(--ink)]"
                        aria-label="Edit password"
                      >
                        <EditIcon />
                      </button>
                    </div>
                  </div>
                ))}

                {!filteredUsers.length ? (
                  <p className="text-center text-xs text-[var(--ink-soft)]">No users found.</p>
                ) : null}
              </div>
            </section>
          ) : activeConversationId ? (
            <section className="flex min-h-0 flex-1 flex-col">
              <div className="chat-scroll flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
                <MessageList
                  messages={messages}
                  currentUserId={auth.user.id}
                  onReply={(message) => {
                    if (message.deleted) {
                      return;
                    }
                    setReplyTarget(message);
                  }}
                  hasMore={hasMore}
                  loadingMore={loadingMore}
                  onLoadMore={handleLoadMore}
                  firstUnreadId={firstUnreadId}
                />
                {typingPreview ? (
                  <p className="mt-3 text-right text-xs text-[var(--ink-soft)]">
                    {typingPreview}
                  </p>
                ) : null}
              </div>
              <div className="border-t border-[var(--panel-border)] bg-[var(--panel)] px-4 py-3">
                <MessageInput
                  disabled={!status.connected || !activeConversationId}
                  value={draft}
                  onValueChange={setDraft}
                  onSend={handleSend}
                  onTyping={handleTyping}
                  replyTarget={replyTarget}
                  onCancelReply={() => setReplyTarget(null)}
                  typingPreview={""}
                  theme={theme}
                  keepFocus
                />
              </div>
            </section>
          ) : (
            <section className="flex-1 overflow-y-auto px-4 py-5">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-semibold text-[var(--ink)]">Chats</p>
              </div>
              <input
                type="text"
                value={sidebarQuery}
                onChange={(event) => setSidebarQuery(event.target.value)}
                placeholder="Search chats"
                className="mb-4 w-full rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] px-4 py-2 text-xs text-[var(--ink)] outline-none focus:border-[var(--accent)]"
              />
              <div className="space-y-2">
                {filteredConversations.map((conversation) => {
                  const preview = conversation.lastMessage?.deleted
                    ? "Message deleted"
                    : conversation.lastMessage?.text || "";
                  const timestamp = conversation.lastMessageAt || conversation.updatedAt;

                  return (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => setActiveConversationId(conversation.id)}
                      className="flex w-full items-center gap-3 rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-dark)] px-3 py-3 text-left transition hover:-translate-y-0.5"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-semibold text-white">
                        {(conversation.user?.name || "?").slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[var(--ink)]">
                          {conversation.user?.name || conversation.user?.username || "Unknown"}
                        </p>
                        <p className="truncate text-xs text-[var(--ink-soft)]">
                          {typingByConversation[conversation.id] ? "typing..." : preview}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 text-[10px] text-[var(--ink-soft)]">
                        <span>{timestamp ? formatTime(timestamp) : ""}</span>
                        {conversation.unreadCount ? (
                          <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10px] text-white">
                            {conversation.unreadCount}
                          </span>
                        ) : null}
                        <span
                          className={`h-2 w-2 rounded-full ${
                            conversation.online ? "bg-[var(--accent)]" : "bg-[var(--panel-border)]"
                          }`}
                        />
                      </div>
                    </button>
                  );
                })}

                {!filteredConversations.length ? (
                  <p className="text-center text-xs text-[var(--ink-soft)]">
                    No conversations yet.
                  </p>
                ) : null}
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

function sortConversations(list) {
  return [...list].sort((a, b) => {
    const aTime = new Date(a.lastMessageAt || a.updatedAt || 0).getTime();
    const bTime = new Date(b.lastMessageAt || b.updatedAt || 0).getTime();
    return bTime - aTime;
  });
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

  return `${date.toLocaleDateString([], { month: "short", day: "numeric" })} ${formatTime(
    value
  )}`;
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
      <path d="M15.7 5.3a1 1 0 0 1 0 1.4L10.4 12l5.3 5.3a1 1 0 1 1-1.4 1.4l-6-6a1 1 0 0 1 0-1.4l6-6a1 1 0 0 1 1.4 0z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
      <path d="M12 18a6 6 0 1 1 0-12 6 6 0 0 1 0 12zm0-16a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1zm0 18a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1zm10-8a1 1 0 0 1-1 1h-1a1 1 0 1 1 0-2h1a1 1 0 0 1 1 1zM4 12a1 1 0 0 1-1 1H2a1 1 0 1 1 0-2h1a1 1 0 0 1 1 1zm14.95-6.95a1 1 0 0 1 0 1.41l-.7.7a1 1 0 0 1-1.42-1.41l.71-.7a1 1 0 0 1 1.41 0zM7.17 18.83a1 1 0 0 1 0 1.41l-.7.71a1 1 0 0 1-1.41-1.42l.7-.7a1 1 0 0 1 1.41 0zm11.78 1.41a1 1 0 0 1-1.41 0l-.7-.7a1 1 0 0 1 1.41-1.41l.7.7a1 1 0 0 1 0 1.41zM6.46 6.46a1 1 0 0 1-1.41 0l-.7-.7A1 1 0 1 1 5.76 4.35l.7.7a1 1 0 0 1 0 1.41z" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
      <path d="M21 14.5A8.5 8.5 0 0 1 9.5 3a.8.8 0 0 0-.9 1.1A7 7 0 1 0 19.9 15.4a.8.8 0 0 0 1.1-.9z" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
      <path d="M10 3a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-4a1 1 0 1 1 2 0v3h5V4h-5v3a1 1 0 1 1-2 0V3zm-4.7 7.3a1 1 0 0 1 1.4 0L9.4 13a1 1 0 0 1 0 1.4l-2.7 2.7a1 1 0 1 1-1.4-1.4L6.6 14H3a1 1 0 1 1 0-2h3.6l-1.3-1.3a1 1 0 0 1 0-1.4z" />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
      <path d="M12 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 7a2 2 0 1 0-.001-3.999A2 2 0 0 0 12 14zm0 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
    </svg>
  );
}



function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
      <path d="M4 17.3V20h2.7l8-8-2.7-2.7-8 8zM20.7 7.3a1 1 0 0 0 0-1.4l-2.6-2.6a1 1 0 0 0-1.4 0l-1.7 1.7 4 4 1.7-1.7z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
      <path d="M6 7h12l-1 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 7zm3-4h6a1 1 0 0 1 1 1v2H8V4a1 1 0 0 1 1-1zm-3 2h12a1 1 0 1 1 0 2H6a1 1 0 1 1 0-2z" />
    </svg>
  );
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
