async function listConversations(req, res, conversationStore, userStore, presenceStore) {
  if (!conversationStore) {
    return res.status(500).json({ error: "conversation_unavailable" });
  }

  try {
    const adminId = req.user.id;
    const conversations = await conversationStore.listForUser(adminId);

    const results = await Promise.all(
      conversations.map(async (conversation) => {
        const otherId = conversation.participants.find((id) => id !== adminId) || null;
        const user = otherId ? await userStore.findById(otherId) : null;
        const online = otherId && presenceStore
          ? Boolean(await presenceStore.isUserOnline(otherId))
          : false;

        let lastMessage = conversation.lastMessage;
        let lastMessageAt = conversation.lastMessageAt;
        if (conversation.clearedAt && conversation.clearedAt[adminId]) {
          const clearTime = conversation.clearedAt[adminId];
          const msgTime = lastMessage?.timestamp || lastMessageAt;
          if (msgTime && msgTime <= clearTime) {
            lastMessage = null;
            lastMessageAt = null;
          }
        }

        return {
          id: conversation.id,
          user: user
            ? {
                id: user.id,
                username: user.username,
                name: user.name,
                status: user.status,
                lastLoginAt: user.lastLoginAt || null,
                lastSeenAt: user.lastSeenAt || null
              }
            : null,
          lastMessage,
          lastMessageAt,
          unreadCount: conversation.unreadCount || 0,
          updatedAt: conversation.updatedAt || null,
          clearedAt: conversation.clearedAt || {},
          online
        };
      })
    );

    return res.json({ conversations: results });
  } catch {
    return res.status(500).json({ error: "conversation_list_failed" });
  }
}

async function listUsers(req, res, userStore) {
  try {
    const users = await userStore.listUsers();
    const sanitized = users.map((user) => {
      const { passwordHashes, ...rest } = user;
      return rest;
    });
    return res.json({ users: sanitized });
  } catch {
    return res.status(500).json({ error: "user_list_failed" });
  }
}

async function updateUser(req, res, userStore) {
  const userId = req.params.id;
  const { name, status } = req.body || {};
  const allowedStatuses = new Set(["active", "suspended", "banned", "deleted"]);

  try {
    const existing = await userStore.findById(userId);
    if (!existing) {
      return res.status(404).json({ error: "user_not_found" });
    }

    if (existing.role === "admin" && status && status !== "active") {
      return res.status(400).json({ error: "admin_status_locked" });
    }

    if (status && !allowedStatuses.has(status)) {
      return res.status(400).json({ error: "invalid_status" });
    }

    const updated = await userStore.updateUser(userId, {
      name: typeof name === "string" ? name : undefined,
      status: typeof status === "string" ? status : undefined
    });
    if (!updated) {
      return res.status(404).json({ error: "user_not_found" });
    }

    const { passwordHashes, ...rest } = updated;
    return res.json({ user: rest });
  } catch {
    return res.status(500).json({ error: "user_update_failed" });
  }
}

async function resetUserPassword(req, res, userStore) {
  const userId = req.params.id;
  const { password } = req.body || {};

  if (!password) {
    return res.status(400).json({ error: "missing_password" });
  }

  try {
    const updated = await userStore.setPassword(userId, password);
    if (!updated) {
      return res.status(404).json({ error: "user_not_found" });
    }

    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "password_reset_failed" });
  }
}

async function deleteUser(req, res, userStore) {
  const userId = req.params.id;

  try {
    const existing = await userStore.findById(userId);
    if (!existing) {
      return res.status(404).json({ error: "user_not_found" });
    }
    if (existing.role === "admin") {
      return res.status(400).json({ error: "admin_delete_forbidden" });
    }

    await userStore.deleteUser(userId);
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "user_delete_failed" });
  }
}

async function listResetRequests(req, res, resetRequestStore) {
  if (!resetRequestStore) {
    return res.status(500).json({ error: "reset_unavailable" });
  }

  try {
    const requests = await resetRequestStore.listRequests();
    return res.json({ requests });
  } catch {
    return res.status(500).json({ error: "reset_list_failed" });
  }
}

async function updateResetRequest(req, res, resetRequestStore) {
  if (!resetRequestStore) {
    return res.status(500).json({ error: "reset_unavailable" });
  }

  const requestId = req.params.id;
  const { status, adminNotes } = req.body || {};

  try {
    const updated = await resetRequestStore.updateRequest(requestId, {
      status,
      adminNotes,
      resolvedBy: req.user.id
    });

    if (!updated) {
      return res.status(404).json({ error: "request_not_found" });
    }

    return res.json({ request: updated });
  } catch {
    return res.status(500).json({ error: "reset_update_failed" });
  }
}

async function getStats(req, res, { userStore, conversationStore, messageStore, presenceStore, resetRequestStore }) {
  try {
    const [userCount, conversationCount, messageCount, resetCount, onlineIds] = await Promise.all([
      userStore.countUsers(),
      conversationStore.countConversations(),
      messageStore.count(),
      resetRequestStore ? resetRequestStore.count() : 0,
      presenceStore.listOnlineUserIds()
    ]);

    return res.json({
      users: userCount,
      conversations: conversationCount,
      messages: messageCount,
      resetRequests: resetCount,
      onlineUsers: onlineIds.length
    });
  } catch {
    return res.status(500).json({ error: "stats_failed" });
  }
}

module.exports = {
  listConversations,
  listUsers,
  updateUser,
  resetUserPassword,
  deleteUser,
  listResetRequests,
  updateResetRequest,
  getStats
};
