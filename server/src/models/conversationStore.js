const { nanoid } = require("nanoid");

const state = {
  conversationsById: new Map(),
  conversationsByKey: new Map()
};

let conversationsCollection = null;

function buildParticipantsKey(userId, otherUserId) {
  return [userId, otherUserId].sort().join(":");
}

function mapDoc(doc) {
  return {
    id: doc.id,
    participants: Array.isArray(doc.participants) ? doc.participants : [],
    participantsKey: doc.participantsKey || "",
    createdAt: doc.createdAt ? doc.createdAt.toISOString?.() || doc.createdAt : null,
    updatedAt: doc.updatedAt ? doc.updatedAt.toISOString?.() || doc.updatedAt : null,
    lastMessage: doc.lastMessage || null,
    lastMessageAt: doc.lastMessageAt ? doc.lastMessageAt.toISOString?.() || doc.lastMessageAt : null,
    lastMessageId: doc.lastMessageId || null,
    unreadBy: doc.unreadBy || {},
    clearedAt: doc.clearedAt || {}
  };
}

function normalizeConversation(conversation) {
  if (!conversation) {
    return null;
  }

  return {
    id: conversation.id,
    participants: Array.isArray(conversation.participants) ? conversation.participants : [],
    participantsKey: conversation.participantsKey || "",
    createdAt: conversation.createdAt || null,
    updatedAt: conversation.updatedAt || null,
    lastMessage: conversation.lastMessage || null,
    lastMessageAt: conversation.lastMessageAt || null,
    lastMessageId: conversation.lastMessageId || null,
    unreadBy: conversation.unreadBy || {},
    clearedAt: conversation.clearedAt || {}
  };
}

async function initConversationStore(db) {
  conversationsCollection = db ? db.collection("conversations") : null;

  if (conversationsCollection) {
    try {
      await conversationsCollection.createIndex({ participantsKey: 1 }, { unique: true });
      await conversationsCollection.createIndex({ participants: 1 });
      await conversationsCollection.createIndex({ updatedAt: -1 });
    } catch (error) {
      console.warn("Mongo conversation index creation failed", error?.message || error);
    }
  }
}

async function createOrFindDirect(userId, otherUserId) {
  if (!userId || !otherUserId || userId === otherUserId) {
    return null;
  }

  const participantsKey = buildParticipantsKey(userId, otherUserId);

  if (conversationsCollection) {
    const existing = await conversationsCollection.findOne({ participantsKey });
    if (existing) {
      return mapDoc(existing);
    }

    const now = new Date();
    const conversation = {
      id: nanoid(12),
      participants: [userId, otherUserId],
      participantsKey,
      createdAt: now,
      updatedAt: now,
      lastMessage: null,
      lastMessageAt: null,
      lastMessageId: null,
      unreadBy: { [userId]: 0, [otherUserId]: 0 }
    };

    await conversationsCollection.insertOne(conversation);
    return mapDoc(conversation);
  }

  const existingId = state.conversationsByKey.get(participantsKey);
  if (existingId) {
    return normalizeConversation(state.conversationsById.get(existingId));
  }

  const now = new Date().toISOString();
  const conversation = {
    id: nanoid(12),
    participants: [userId, otherUserId],
    participantsKey,
    createdAt: now,
    updatedAt: now,
    lastMessage: null,
    lastMessageAt: null,
    lastMessageId: null,
    unreadBy: { [userId]: 0, [otherUserId]: 0 }
  };

  state.conversationsById.set(conversation.id, conversation);
  state.conversationsByKey.set(participantsKey, conversation.id);
  return normalizeConversation(conversation);
}

async function getById(conversationId) {
  if (!conversationId) {
    return null;
  }

  if (conversationsCollection) {
    const doc = await conversationsCollection.findOne({ id: conversationId });
    return doc ? mapDoc(doc) : null;
  }

  return normalizeConversation(state.conversationsById.get(conversationId));
}

async function listForUser(userId) {
  if (!userId) {
    return [];
  }

  if (conversationsCollection) {
    const docs = await conversationsCollection
      .find({ participants: userId })
      .sort({ updatedAt: -1 })
      .toArray();
    return docs.map((doc) => withUnreadForUser(mapDoc(doc), userId));
  }

  const conversations = Array.from(state.conversationsById.values()).filter((conv) =>
    conv.participants.includes(userId)
  );

  conversations.sort((a, b) => {
    const aTime = new Date(a.lastMessageAt || a.updatedAt || 0).getTime();
    const bTime = new Date(b.lastMessageAt || b.updatedAt || 0).getTime();
    return bTime - aTime;
  });

  return conversations.map((conversation) =>
    withUnreadForUser(normalizeConversation(conversation), userId)
  );
}

async function isParticipant(conversationId, userId) {
  const conversation = await getById(conversationId);
  if (!conversation) {
    return false;
  }
  return conversation.participants.includes(userId);
}

async function getParticipants(conversationId) {
  const conversation = await getById(conversationId);
  return conversation ? conversation.participants : [];
}

async function getOtherParticipant(conversationId, userId) {
  const participants = await getParticipants(conversationId);
  return participants.find((participantId) => participantId !== userId) || null;
}

async function listPeerIds(userId) {
  const conversations = await listForUser(userId);
  const peers = new Set();

  conversations.forEach((conversation) => {
    conversation.participants
      .filter((participantId) => participantId !== userId)
      .forEach((participantId) => peers.add(participantId));
  });

  return Array.from(peers);
}

function withUnreadForUser(conversation, userId) {
  if (!conversation) {
    return conversation;
  }

  const unreadBy = conversation.unreadBy || {};
  return {
    ...conversation,
    unreadCount: Number(unreadBy[userId] || 0)
  };
}

async function touchLastMessage(conversationId, message) {
  if (!conversationId || !message) {
    return;
  }

  const lastMessage = {
    id: message.id,
    text: message.text,
    senderId: message.senderId,
    timestamp: message.timestamp,
    deleted: Boolean(message.deleted)
  };

  const updatedAt = new Date();
  const lastMessageAt = message.timestamp ? new Date(message.timestamp) : updatedAt;

  if (conversationsCollection) {
    await conversationsCollection.updateOne(
      { id: conversationId },
      {
        $set: {
          lastMessage,
          lastMessageAt,
          lastMessageId: message.id,
          updatedAt
        }
      }
    );
    return;
  }

  const conversation = state.conversationsById.get(conversationId);
  if (!conversation) {
    return;
  }

  conversation.lastMessage = lastMessage;
  conversation.lastMessageAt = lastMessageAt.toISOString();
  conversation.lastMessageId = message.id;
  conversation.updatedAt = updatedAt.toISOString();
}

async function updateLastMessageText(conversationId, messageId, updates = {}) {
  if (!conversationId || !messageId) {
    return;
  }

  if (conversationsCollection) {
    const conversation = await conversationsCollection.findOne({ id: conversationId });
    if (!conversation || conversation.lastMessageId !== messageId) {
      return;
    }

    const nextLastMessage = {
      ...conversation.lastMessage,
      ...updates
    };

    await conversationsCollection.updateOne(
      { id: conversationId },
      { $set: { lastMessage: nextLastMessage } }
    );
    return;
  }

  const convo = state.conversationsById.get(conversationId);
  if (!convo || convo.lastMessageId !== messageId) {
    return;
  }

  convo.lastMessage = { ...convo.lastMessage, ...updates };
}

async function incrementUnread(conversationId, userId) {
  if (!conversationId || !userId) {
    return;
  }

  if (conversationsCollection) {
    await conversationsCollection.updateOne(
      { id: conversationId },
      { $inc: { [`unreadBy.${userId}`]: 1 } }
    );
    return;
  }

  const convo = state.conversationsById.get(conversationId);
  if (!convo) {
    return;
  }

  if (!convo.unreadBy) {
    convo.unreadBy = {};
  }
  convo.unreadBy[userId] = Number(convo.unreadBy[userId] || 0) + 1;
}

async function resetUnread(conversationId, userId) {
  if (!conversationId || !userId) {
    return;
  }

  if (conversationsCollection) {
    await conversationsCollection.updateOne(
      { id: conversationId },
      { $set: { [`unreadBy.${userId}`]: 0 } }
    );
    return;
  }

  const convo = state.conversationsById.get(conversationId);
  if (!convo) {
    return;
  }

  if (!convo.unreadBy) {
    convo.unreadBy = {};
  }
  convo.unreadBy[userId] = 0;
}

async function countConversations() {
  if (conversationsCollection) {
    return conversationsCollection.countDocuments();
  }

  return state.conversationsById.size;
}

async function clearHistory(conversationId, clearedAt) {
  if (conversationsCollection) {
    await conversationsCollection.updateOne(
      { id: conversationId },
      { $set: { clearedAt } }
    );
    return;
  }

  const conversation = state.conversationsById.get(conversationId);
  if (conversation) {
    conversation.clearedAt = { ...clearedAt };
  }
}

async function clearHistoryForUser(conversationId, userId, timestamp) {
  if (conversationsCollection) {
    await conversationsCollection.updateOne(
      { id: conversationId },
      { $set: { [`clearedAt.${userId}`]: timestamp } }
    );
    return;
  }

  const conversation = state.conversationsById.get(conversationId);
  if (conversation) {
    if (!conversation.clearedAt) {
      conversation.clearedAt = {};
    }
    conversation.clearedAt[userId] = timestamp;
  }
}

async function deleteByParticipant(userId) {
  if (!userId) {
    return;
  }

  if (conversationsCollection) {
    await conversationsCollection.deleteMany({ participants: userId });
    return;
  }

  for (const [id, conv] of state.conversationsById.entries()) {
    if (conv.participants.includes(userId)) {
      state.conversationsById.delete(id);
      state.conversationsByKey.delete(conv.participantsKey);
    }
  }
}

const conversationStore = {
  createOrFindDirect,
  getById,
  listForUser,
  listPeerIds,
  isParticipant,
  getParticipants,
  getOtherParticipant,
  touchLastMessage,
  updateLastMessageText,
  incrementUnread,
  resetUnread,
  countConversations,
  clearHistory,
  clearHistoryForUser,
  deleteByParticipant
};

module.exports = { initConversationStore, conversationStore };
