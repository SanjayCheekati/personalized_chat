const { nanoid } = require("nanoid");

const MESSAGE_CACHE_TTL = 30;
const MESSAGE_CACHE_LIMIT = 50;

function createMessageStore({ db, cache } = {}) {
  const rooms = new Map();
  const collection = db ? db.collection("messages") : null;

  const getRoom = (roomId) => {
    if (!rooms.has(roomId)) {
      rooms.set(roomId, []);
    }
    return rooms.get(roomId);
  };

  const mapDoc = (doc) => ({
    id: doc.id,
    roomId: doc.roomId,
    senderId: doc.senderId,
    receiverId: doc.receiverId || null,
    text: doc.text,
    clientId: doc.clientId || null,
    timestamp: doc.timestamp || doc.createdAt?.toISOString(),
    seen: Boolean(doc.seen)
  });

  const list = async (roomId, options = {}) => {
    const { limit = 50, before } = options;

    if (!collection) {
      const messages = getRoom(roomId);
      const filtered = before
        ? messages.filter((message) => message.timestamp < before)
        : messages;

      return filtered.slice(Math.max(filtered.length - limit, 0));
    }

    if (cache && !before) {
      const cached = await cache.getJSON(`messages:${roomId}`);
      if (Array.isArray(cached)) {
        return cached.slice(Math.max(cached.length - limit, 0));
      }
    }

    const query = { roomId };
    if (before) {
      const beforeDate = new Date(before);
      if (!Number.isNaN(beforeDate.getTime())) {
        query.createdAt = { $lt: beforeDate };
      }
    }

    const docs = await collection
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    const messages = docs.map(mapDoc).reverse();

    if (cache && !before) {
      const trimmed = messages.slice(Math.max(messages.length - MESSAGE_CACHE_LIMIT, 0));
      await cache.setJSON(`messages:${roomId}`, trimmed, MESSAGE_CACHE_TTL);
    }

    return messages;
  };

  const save = async (input) => {
    const now = new Date();
    const message = {
      id: nanoid(12),
      roomId: input.roomId,
      senderId: input.senderId,
      receiverId: input.receiverId,
      text: input.text,
      clientId: input.clientId || null,
      timestamp: now.toISOString(),
      createdAt: now,
      seen: false
    };

    if (collection) {
      await collection.insertOne({ ...message });
    } else {
      const messages = getRoom(input.roomId);
      messages.push(message);
    }

    if (cache) {
      const cached = await cache.getJSON(`messages:${input.roomId}`);
      if (Array.isArray(cached)) {
        const next = [...cached, message].slice(-MESSAGE_CACHE_LIMIT);
        await cache.setJSON(`messages:${input.roomId}`, next, MESSAGE_CACHE_TTL);
      }
    }

    return message;
  };

  const markSeen = async (roomId, messageIds) => {
    if (!messageIds || messageIds.length === 0) {
      return;
    }

    if (collection) {
      await collection.updateMany(
        { roomId, id: { $in: messageIds } },
        { $set: { seen: true, seenAt: new Date() } }
      );
    } else {
      const ids = new Set(messageIds);
      const messages = getRoom(roomId);
      messages.forEach((message) => {
        if (ids.has(message.id)) {
          message.seen = true;
        }
      });
    }

    if (cache) {
      const cached = await cache.getJSON(`messages:${roomId}`);
      if (Array.isArray(cached)) {
        const updated = cached.map((message) =>
          messageIds.includes(message.id)
            ? { ...message, seen: true }
            : message
        );
        await cache.setJSON(`messages:${roomId}`, updated, MESSAGE_CACHE_TTL);
      }
    }
  };

  return {
    list,
    save,
    markSeen
  };
}

module.exports = { createMessageStore };
