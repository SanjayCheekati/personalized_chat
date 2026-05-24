"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import MessageInput from "./MessageInput";
import MessageList from "./MessageList";
import { createSocket } from "../socket/client";
import {
  fetchAdminConversations,
  fetchAdminStats,
  fetchAdminUsers,
  fetchMessages,
  fetchResetRequests,
  resetUserPassword,
  updateAdminUser,
  updateResetRequest,
  deleteUser
} from "../services/api";

const DEFAULT_STATUS = { connecting: false, connected: false, error: "" };

export default function AdminDashboard({ auth, theme, onToggleTheme, onLogout }) {
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState(DEFAULT_STATUS);
  const [sidebarQuery, setSidebarQuery] = useState("");
  const [panelTab, setPanelTab] = useState("users");
  const [userQuery, setUserQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [resetRequests, setResetRequests] = useState([]);
  const [stats, setStats] = useState(null);
  const [typingByConversation, setTypingByConversation] = useState({});
  const [passwordDrafts, setPasswordDrafts] = useState({});
  const [requestNotes, setRequestNotes] = useState({});
  const socketRef = useRef(null);
  const typingRef = useRef({ active: false, timeoutId: null });
  const activeConversationRef = useRef(null);

  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === activeConversationId) || null,
    [conversations, activeConversationId]
  );

  useEffect(() => {
    activeConversationRef.current = activeConversationId;
  }, [activeConversationId]);

  const refreshConversations = () => {
    fetchAdminConversations(auth.token)
      .then((data) => {
        const next = Array.isArray(data.conversations) ? data.conversations : [];
        setConversations(sortConversations(next));
        if (!activeConversationId && next.length > 0) {
          setActiveConversationId(next[0].id);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    refreshConversations();

    fetchAdminUsers(auth.token)
      .then((data) => setUsers(Array.isArray(data.users) ? data.users : []))
      .catch(() => {});

    fetchResetRequests(auth.token)
      .then((data) => setResetRequests(Array.isArray(data.requests) ? data.requests : []))
      .catch(() => {});

    fetchAdminStats(auth.token)
      .then((data) => setStats(data))
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

    fetchMessages(auth.token, activeConversationId)
      .then((data) => {
        if (!ignore) {
          setMessages(normalizeMessages(data.messages || [], auth.user.id));
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

    const clientId = makeClientId();
    const optimistic = {
      id: null,
      clientId,
      roomId: activeConversationId,
      senderId: auth.user.id,
      receiverId: activeConversation?.user?.id || null,
      text: trimmed,
      replyTo: null,
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

  const handleStatusChange = (userId, nextStatus) => {
    updateAdminUser(auth.token, userId, { status: nextStatus })
      .then((data) => {
        if (!data?.user) {
          return;
        }
        setUsers((prev) => prev.map((user) => (user.id === userId ? data.user : user)));
      })
      .catch(() => {});
  };

  const handlePasswordReset = (userId) => {
    const nextPassword = passwordDrafts[userId];
    if (!nextPassword) {
      return;
    }

    resetUserPassword(auth.token, userId, nextPassword)
      .then(() => {
        setPasswordDrafts((prev) => ({ ...prev, [userId]: "" }));
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

  const handleUpdateRequest = (requestId, updates) => {
    updateResetRequest(auth.token, requestId, updates)
      .then((data) => {
        if (!data?.request) {
          return;
        }
        setResetRequests((prev) =>
          prev.map((request) => (request.id === requestId ? data.request : request))
        );
      })
      .catch(() => {});
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

  return (
    <div className="page-shell admin-shell">
      <div className="flex w-full min-h-screen flex-col lg:flex-row">
        <aside className="admin-sidebar w-full border-b border-[var(--panel-border)] lg:h-screen lg:w-80 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--panel-border)] px-4 py-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--accent)]">Admin</p>
              <p className="text-sm font-semibold text-[var(--ink)]">Arjun</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onToggleTheme}
                className="rounded-full border border-[var(--panel-border)] bg-[var(--panel-dark)] px-3 py-2 text-xs text-[var(--ink)]"
              >
                {theme === "light" ? "Dark" : "Light"}
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="rounded-full border border-[var(--panel-border)] bg-[var(--panel-dark)] px-3 py-2 text-xs text-[var(--ink)]"
              >
                Sign out
              </button>
            </div>
          </div>

          <div className="px-4 py-3">
            <input
              type="text"
              value={sidebarQuery}
              onChange={(event) => setSidebarQuery(event.target.value)}
              placeholder="Search chats"
              className="w-full rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-dark)] px-4 py-2 text-xs text-[var(--ink)] outline-none focus:border-[var(--accent)]"
            />
          </div>

          {stats ? (
            <div className="grid grid-cols-2 gap-2 px-4 pb-4 text-[10px] text-[var(--ink-soft)]">
              <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-dark)] px-3 py-2">
                <p className="text-[11px] font-semibold text-[var(--ink)]">{stats.users}</p>
                <p>Users</p>
              </div>
              <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-dark)] px-3 py-2">
                <p className="text-[11px] font-semibold text-[var(--ink)]">
                  {stats.conversations}
                </p>
                <p>Conversations</p>
              </div>
              <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-dark)] px-3 py-2">
                <p className="text-[11px] font-semibold text-[var(--ink)]">
                  {stats.messages}
                </p>
                <p>Messages</p>
              </div>
              <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-dark)] px-3 py-2">
                <p className="text-[11px] font-semibold text-[var(--ink)]">
                  {stats.onlineUsers}
                </p>
                <p>Online</p>
              </div>
            </div>
          ) : null}

          <div className="flex-1 overflow-y-auto px-2 pb-4">
            {filteredConversations.map((conversation) => {
              const preview = conversation.lastMessage?.deleted
                ? "Message deleted"
                : conversation.lastMessage?.text || "";
              const timestamp = conversation.lastMessageAt || conversation.updatedAt;
              const isActive = conversation.id === activeConversationId;

              return (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => setActiveConversationId(conversation.id)}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${
                    isActive
                      ? "bg-[var(--panel-dark)]"
                      : "hover:bg-[var(--panel-dark)]"
                  }`}
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
              <p className="px-3 py-6 text-center text-xs text-[var(--ink-soft)]">
                No conversations yet.
              </p>
            ) : null}
          </div>
        </aside>

        <div className="flex min-h-screen w-full flex-1 flex-col lg:flex-row">
          <section className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-20 border-b border-[var(--panel-border)] bg-[var(--panel)] px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--ink)]">
                    {activeConversation?.user?.name || "Select a chat"}
                  </p>
                  <p className="text-xs text-[var(--ink-soft)]">
                    {activeConversation?.online
                      ? "online"
                      : activeConversation?.user?.lastSeenAt
                      ? `last seen ${formatLastSeen(activeConversation.user.lastSeenAt)}`
                      : "offline"}
                  </p>
                </div>
                <div className="text-xs text-[var(--ink-soft)]">
                  {stats ? `${stats.messages} messages` : ""}
                </div>
              </div>
            </header>

            <main className="chat-scroll flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
              {activeConversationId ? (
                <>
                  <MessageList messages={messages} currentUserId={auth.user.id} />
                  {typingPreview ? (
                    <p className="mt-3 text-right text-xs text-[var(--ink-soft)]">
                      {typingPreview}
                    </p>
                  ) : null}
                </>
              ) : (
                <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] px-6 py-8 text-center text-sm text-[var(--ink-soft)]">
                  Select a conversation to start.
                </div>
              )}
            </main>

            <footer className="sticky bottom-0 z-20 border-t border-[var(--panel-border)] bg-[var(--panel)] px-4 py-3">
              <MessageInput
                disabled={!status.connected || !activeConversationId}
                value={draft}
                onValueChange={setDraft}
                onSend={handleSend}
                onTyping={handleTyping}
                typingPreview={""}
                theme={theme}
              />
            </footer>
          </section>

          <aside className="admin-panel w-full border-t border-[var(--panel-border)] lg:w-96 lg:border-l lg:border-t-0">
            <div className="flex items-center gap-2 border-b border-[var(--panel-border)] px-4 py-3">
              {"users|requests".split("|").map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setPanelTab(tab)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    panelTab === tab
                      ? "bg-[var(--accent)] text-white"
                      : "border border-[var(--panel-border)] text-[var(--ink)]"
                  }`}
                >
                  {tab === "users" ? "Users" : "Reset requests"}
                </button>
              ))}
            </div>

            {panelTab === "users" ? (
              <div className="max-h-[calc(100vh-160px)] overflow-y-auto px-4 py-4">
                <input
                  type="text"
                  value={userQuery}
                  onChange={(event) => setUserQuery(event.target.value)}
                  placeholder="Search users"
                  className="mb-4 w-full rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] px-3 py-2 text-xs text-[var(--ink)]"
                />

                {filteredUsers.map((user) => (
                  <div
                    key={user.id}
                    className="mb-4 rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-dark)] p-3"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-[var(--ink)]">{user.name}</p>
                        <p className="text-xs text-[var(--ink-soft)]">@{user.username}</p>
                      </div>
                      <div className="text-right text-[10px] uppercase text-[var(--ink-soft)]">
                        <p>{user.status}</p>
                        <p>{user.online ? "online" : "offline"}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleStatusChange(user.id, "active")}
                        className="rounded-full border border-[var(--panel-border)] px-3 py-1 text-[10px] text-[var(--ink)]"
                      >
                        Activate
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStatusChange(user.id, "suspended")}
                        className="rounded-full border border-[var(--panel-border)] px-3 py-1 text-[10px] text-[var(--ink)]"
                      >
                        Suspend
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStatusChange(user.id, "banned")}
                        className="rounded-full border border-[var(--panel-border)] px-3 py-1 text-[10px] text-[var(--ink)]"
                      >
                        Ban
                      </button>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <input
                        type="password"
                        value={passwordDrafts[user.id] || ""}
                        onChange={(event) =>
                          setPasswordDrafts((prev) => ({
                            ...prev,
                            [user.id]: event.target.value
                          }))
                        }
                        placeholder="New password"
                        className="flex-1 rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] px-3 py-2 text-[11px] text-[var(--ink)]"
                      />
                      <button
                        type="button"
                        onClick={() => handlePasswordReset(user.id)}
                        className="rounded-full bg-[var(--accent)] px-3 py-2 text-[10px] font-semibold text-white"
                      >
                        Reset
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteUser(user.id)}
                        className="rounded-full border border-[var(--panel-border)] px-3 py-2 text-[10px] text-[var(--ink)]"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}

                {!filteredUsers.length ? (
                  <p className="text-center text-xs text-[var(--ink-soft)]">No users found.</p>
                ) : null}
              </div>
            ) : (
              <div className="max-h-[calc(100vh-160px)] overflow-y-auto px-4 py-4">
                {resetRequests.map((request) => (
                  <div
                    key={request.id}
                    className="mb-4 rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-dark)] p-3"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-[var(--ink)]">
                          {request.username}
                        </p>
                        <p className="text-xs text-[var(--ink-soft)]">{request.message}</p>
                      </div>
                      <span className="text-[10px] uppercase text-[var(--ink-soft)]">
                        {request.status}
                      </span>
                    </div>
                    <textarea
                      value={requestNotes[request.id] ?? request.adminNotes ?? ""}
                      onChange={(event) =>
                        setRequestNotes((prev) => ({
                          ...prev,
                          [request.id]: event.target.value
                        }))
                      }
                      placeholder="Admin notes"
                      rows={2}
                      className="mt-3 w-full rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] px-3 py-2 text-[11px] text-[var(--ink)]"
                    />
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateRequest(request.id, {
                            status: "resolved",
                            adminNotes: requestNotes[request.id] ?? request.adminNotes ?? ""
                          })
                        }
                        className="rounded-full bg-[var(--accent)] px-3 py-1 text-[10px] font-semibold text-white"
                      >
                        Mark resolved
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateRequest(request.id, {
                            status: "open",
                            adminNotes: requestNotes[request.id] ?? request.adminNotes ?? ""
                          })
                        }
                        className="rounded-full border border-[var(--panel-border)] px-3 py-1 text-[10px] text-[var(--ink)]"
                      >
                        Re-open
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateRequest(request.id, {
                            adminNotes: requestNotes[request.id] ?? request.adminNotes ?? ""
                          })
                        }
                        className="rounded-full border border-[var(--panel-border)] px-3 py-1 text-[10px] text-[var(--ink)]"
                      >
                        Save note
                      </button>
                    </div>
                  </div>
                ))}

                {!resetRequests.length ? (
                  <p className="text-center text-xs text-[var(--ink-soft)]">
                    No reset requests.
                  </p>
                ) : null}
              </div>
            )}
          </aside>
        </div>
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
