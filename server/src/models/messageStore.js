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
    kind: doc.kind || "text",
    replyTo: doc.replyTo || null,
    clientId: doc.clientId || null,
    timestamp: doc.timestamp || doc.createdAt?.toISOString(),
    seen: Boolean(doc.seen),
    seenAt: doc.seenAt ? doc.seenAt.toISOString?.() || doc.seenAt : null,
    deleted: Boolean(doc.deleted),
    deletedBy: doc.deletedBy || null,
    edited: Boolean(doc.edited),
    editedAt: doc.editedAt ? doc.editedAt.toISOString?.() || doc.editedAt : null
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
    const replyTo = input.replyTo
      ? {
          id: input.replyTo.id,
          text: input.replyTo.text,
          senderId: input.replyTo.senderId || null
        }
      : null;
    const message = {
      id: nanoid(12),
      roomId: input.roomId,
      senderId: input.senderId,
      receiverId: input.receiverId,
      text: input.text,
      kind: input.kind || "text",
      replyTo,
      clientId: input.clientId || null,
      timestamp: now.toISOString(),
      createdAt: now,
      seen: false,
      seenAt: null,
      edited: false,
      editedAt: null,
      deleted: false
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

  const markSeen = async (roomId, messageIds, seenAt) => {
    if (!messageIds || messageIds.length === 0) {
      return;
    }

    const seenAtDate = seenAt ? new Date(seenAt) : new Date();

    if (collection) {
      await collection.updateMany(
        { roomId, id: { $in: messageIds } },
        { $set: { seen: true, seenAt: seenAtDate } }
      );
    } else {
      const ids = new Set(messageIds);
      const messages = getRoom(roomId);
      messages.forEach((message) => {
        if (ids.has(message.id)) {
          message.seen = true;
          message.seenAt = seenAtDate.toISOString();
        }
      });
    }

    if (cache) {
      const cached = await cache.getJSON(`messages:${roomId}`);
      if (Array.isArray(cached)) {
        const updated = cached.map((message) =>
          messageIds.includes(message.id)
            ? { ...message, seen: true, seenAt: seenAtDate.toISOString() }
            : message
        );
        await cache.setJSON(`messages:${roomId}`, updated, MESSAGE_CACHE_TTL);
      }
    }
  };

  const markEdited = async (roomId, messageId, senderId, text) => {
    if (!messageId || !text) {
      return null;
    }

    const editedAt = new Date();

    if (collection) {
      const result = await collection.findOneAndUpdate(
        { roomId, id: messageId, senderId },
        { $set: { text, edited: true, editedAt } },
        { returnDocument: "after" }
      );

      const mapped = result ? mapDoc(result) : null;
      if (mapped && cache) {
        const cached = await cache.getJSON(`messages:${roomId}`);
        if (Array.isArray(cached)) {
          const updated = cached.map((message) =>
            message.id === messageId
              ? { ...message, text: mapped.text, edited: true, editedAt: mapped.editedAt }
              : message
          );
          await cache.setJSON(`messages:${roomId}`, updated, MESSAGE_CACHE_TTL);
        }
      }

      return mapped;
    }

    const messages = getRoom(roomId);
    const target = messages.find((message) => message.id === messageId);
    if (!target || target.senderId !== senderId) {
      return null;
    }

    target.text = text;
    target.edited = true;
    target.editedAt = editedAt.toISOString();

    if (cache) {
      const cached = await cache.getJSON(`messages:${roomId}`);
      if (Array.isArray(cached)) {
        const updated = cached.map((message) =>
          message.id === messageId
            ? { ...message, text, edited: true, editedAt: target.editedAt }
            : message
        );
        await cache.setJSON(`messages:${roomId}`, updated, MESSAGE_CACHE_TTL);
      }
    }

    return target;
  };

  const markDeleted = async (roomId, messageId, deletedBy) => {
    if (!messageId) {
      return null;
    }

    if (collection) {
      await collection.updateOne(
        { roomId, id: messageId },
        { $set: { deleted: true, deletedBy, deletedAt: new Date() } }
      );
    } else {
      const messages = getRoom(roomId);
      messages.forEach((message) => {
        if (message.id === messageId) {
          message.deleted = true;
          message.deletedBy = deletedBy || null;
        }
      });
    }

    if (cache) {
      const cached = await cache.getJSON(`messages:${roomId}`);
      if (Array.isArray(cached)) {
        const updated = cached.map((message) =>
          message.id === messageId
            ? { ...message, deleted: true, deletedBy: deletedBy || null }
            : message
        );
        await cache.setJSON(`messages:${roomId}`, updated, MESSAGE_CACHE_TTL);
      }
    }

    return messageId;
  };

  const count = async () => {
    if (collection) {
      return collection.countDocuments();
    }

    let total = 0;
    rooms.forEach((messages) => {
      total += messages.length;
    });
    return total;
  };

  return {
    list,
    save,
    markSeen,
    markEdited,
    markDeleted,
    count
  };
}

module.exports = { createMessageStore };
