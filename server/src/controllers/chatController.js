const { userStore } = require("../models/userStore");

async function listMessages(req, res, messageStore, conversationStore, env) {
  try {
    const roomId = req.query.conversationId || req.query.roomId || env.DEFAULT_ROOM_ID;
    const limit = Math.min(Number(req.query.limit || 50), 200);
    const before = req.query.before || null;

    let clearedAt = null;
    if (conversationStore) {
      const allowed = await conversationStore.isParticipant(roomId, req.user.id);
      if (!allowed) {
        return res.status(403).json({ error: "forbidden" });
      }
      const conversation = await conversationStore.getById(roomId);
      if (conversation && conversation.clearedAt) {
        clearedAt = conversation.clearedAt[req.user.id] || null;
      }
    }

    const messages = await messageStore.list(roomId, { limit, before, after: clearedAt });
    res.json({ messages });
  } catch {
    res.status(500).json({ error: "message_list_failed" });
  }
}

async function postMessage(req, res, messageStore, conversationStore, env) {
  try {
    const roomId = req.body.conversationId || req.body.roomId || env.DEFAULT_ROOM_ID;
    const text = String(req.body.text || "").trim();

    if (!text) {
      return res.status(400).json({ error: "empty_message" });
    }

    if (conversationStore) {
      const allowed = await conversationStore.isParticipant(roomId, req.user.id);
      if (!allowed) {
        return res.status(403).json({ error: "forbidden" });
      }
    }

    const receiverId = conversationStore
      ? await conversationStore.getOtherParticipant(roomId, req.user.id)
      : req.body.receiverId || null;

    if (conversationStore && !receiverId) {
      return res.status(404).json({ error: "receiver_missing" });
    }

    const message = await messageStore.save({
      roomId,
      senderId: req.user.id,
      receiverId,
      text,
      clientId: req.body.clientId || null
    });

    if (conversationStore) {
      await conversationStore.touchLastMessage(roomId, message);
      if (receiverId) {
        await conversationStore.incrementUnread(roomId, receiverId);
      }
    }

    return res.json({ message });
  } catch {
    return res.status(500).json({ error: "message_save_failed" });
  }
}

async function getConversation(req, res, conversationStore, env) {
  if (!conversationStore) {
    return res.status(400).json({ error: "conversation_unavailable" });
  }

  if (req.user?.role === "admin" || req.user?.isAdmin) {
    return res.status(400).json({ error: "admin_not_supported" });
  }

  try {
    const adminUser = await userStore.findByUsername(env.ADMIN_USERNAME);
    if (!adminUser) {
      return res.status(500).json({ error: "admin_missing" });
    }

    const conversation = await conversationStore.createOrFindDirect(
      req.user.id,
      adminUser.id
    );

    if (conversation && conversation.clearedAt && conversation.clearedAt[req.user.id]) {
      const clearTime = conversation.clearedAt[req.user.id];
      const msgTime = conversation.lastMessage?.timestamp || conversation.lastMessageAt;
      if (msgTime && msgTime <= clearTime) {
        conversation.lastMessage = null;
        conversation.lastMessageAt = null;
      }
    }

    return res.json({
      conversation,
      peer: {
        id: adminUser.id,
        name: adminUser.name,
        username: adminUser.username
      }
    });
  } catch {
    return res.status(500).json({ error: "conversation_failed" });
  }
}

module.exports = { listMessages, postMessage, getConversation };
