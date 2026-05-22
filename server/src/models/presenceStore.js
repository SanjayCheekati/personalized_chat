function createMemoryPresenceStore() {
  const rooms = new Map();
  const socketIndex = new Map();

  const getRoomUsers = (roomId) => {
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Map());
    }
    return rooms.get(roomId);
  };

  const canJoin = (roomId, userId) => {
    const users = rooms.get(roomId);
    if (!users) {
      return true;
    }
    if (users.has(userId)) {
      return true;
    }
    return users.size < 2;
  };

  const register = (roomId, userId, socketId) => {
    const users = getRoomUsers(roomId);
    if (!users.has(userId)) {
      users.set(userId, new Set());
    }
    users.get(userId).add(socketId);
    socketIndex.set(socketId, { roomId, userId });
  };

  const unregister = (socketId) => {
    const entry = socketIndex.get(socketId);
    if (!entry) {
      return null;
    }

    const { roomId, userId } = entry;
    const users = getRoomUsers(roomId);
    const sockets = users.get(userId);

    if (sockets) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        users.delete(userId);
      }
    }

    socketIndex.delete(socketId);
    const noSocketsLeft = !users.has(userId);

    return { roomId, userId, noSocketsLeft };
  };

  const getOtherUserId = (roomId, userId) => {
    const users = rooms.get(roomId);
    if (!users) {
      return null;
    }

    for (const existingUserId of users.keys()) {
      if (existingUserId !== userId) {
        return existingUserId;
      }
    }
    return null;
  };

  const getUniqueUserCount = (roomId) => {
    const users = rooms.get(roomId);
    return users ? users.size : 0;
  };

  return {
    canJoin,
    register,
    unregister,
    getOtherUserId,
    getUniqueUserCount
  };
}

function createPresenceStore({ redisClient, prefix = "flashchat" } = {}) {
  if (!redisClient) {
    const memory = createMemoryPresenceStore();
    return {
      canJoin: async (roomId, userId) => memory.canJoin(roomId, userId),
      register: async (roomId, userId, socketId) =>
        memory.register(roomId, userId, socketId),
      unregister: async (socketId) => memory.unregister(socketId),
      getOtherUserId: async (roomId, userId) => memory.getOtherUserId(roomId, userId),
      getUniqueUserCount: async (roomId) => memory.getUniqueUserCount(roomId)
    };
  }

  const base = prefix ? `${prefix}:presence` : "presence";
  const roomKey = (roomId) => `${base}:room:${roomId}`;
  const userKey = (roomId, userId) => `${base}:room:${roomId}:user:${userId}`;
  const socketKey = (socketId) => `${base}:socket:${socketId}`;
  const socketTtl = 60 * 60;

  const canJoin = async (roomId, userId) => {
    const users = await redisClient.sMembers(roomKey(roomId));
    if (users.includes(userId)) {
      return true;
    }
    return users.length < 2;
  };

  const register = async (roomId, userId, socketId) => {
    await redisClient.sAdd(roomKey(roomId), userId);
    await redisClient.sAdd(userKey(roomId, userId), socketId);
    await redisClient.setEx(socketKey(socketId), socketTtl, JSON.stringify({ roomId, userId }));
  };

  const unregister = async (socketId) => {
    const entryRaw = await redisClient.get(socketKey(socketId));
    if (!entryRaw) {
      return null;
    }

    let entry;
    try {
      entry = JSON.parse(entryRaw);
    } catch {
      entry = null;
    }

    if (!entry) {
      return null;
    }

    const { roomId, userId } = entry;
    await redisClient.del(socketKey(socketId));
    await redisClient.sRem(userKey(roomId, userId), socketId);
    const remaining = await redisClient.sCard(userKey(roomId, userId));
    if (remaining === 0) {
      await redisClient.sRem(roomKey(roomId), userId);
    }

    return { roomId, userId, noSocketsLeft: remaining === 0 };
  };

  const getOtherUserId = async (roomId, userId) => {
    const users = await redisClient.sMembers(roomKey(roomId));
    return users.find((existing) => existing !== userId) || null;
  };

  const getUniqueUserCount = async (roomId) => {
    return redisClient.sCard(roomKey(roomId));
  };

  return {
    canJoin,
    register,
    unregister,
    getOtherUserId,
    getUniqueUserCount
  };
}

module.exports = { createPresenceStore };
