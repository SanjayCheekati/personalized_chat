function createMemoryPresenceStore() {
  const rooms = new Map();
  const socketIndex = new Map();
  const onlineUsers = new Map();
  const onlineSocketIndex = new Map();

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

  const registerOnline = (userId, socketId) => {
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId).add(socketId);
    onlineSocketIndex.set(socketId, userId);
  };

  const unregisterOnline = (socketId) => {
    const userId = onlineSocketIndex.get(socketId);
    if (!userId) {
      return null;
    }

    const sockets = onlineUsers.get(userId);
    if (sockets) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        onlineUsers.delete(userId);
      }
    }

    onlineSocketIndex.delete(socketId);
    return { userId, isOffline: !onlineUsers.has(userId) };
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

  const isUserOnline = (userId) => onlineUsers.has(userId);

  const listOnlineUserIds = () => Array.from(onlineUsers.keys());

  const isUserInRoom = (roomId, userId) => {
    const users = rooms.get(roomId);
    return users ? users.has(userId) : false;
  };

  const getUserSockets = (userId) => {
    const sockets = onlineUsers.get(userId);
    return sockets ? Array.from(sockets) : [];
  };

  return {
    canJoin,
    register,
    unregister,
    getOtherUserId,
    getUniqueUserCount,
    registerOnline,
    unregisterOnline,
    isUserOnline,
    listOnlineUserIds,
    isUserInRoom,
    getUserSockets
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
      getUniqueUserCount: async (roomId) => memory.getUniqueUserCount(roomId),
      registerOnline: async (userId, socketId) => memory.registerOnline(userId, socketId),
      unregisterOnline: async (socketId) => memory.unregisterOnline(socketId),
      isUserOnline: async (userId) => memory.isUserOnline(userId),
      listOnlineUserIds: async () => memory.listOnlineUserIds(),
      isUserInRoom: async (roomId, userId) => memory.isUserInRoom(roomId, userId),
      getUserSockets: async (userId) => memory.getUserSockets(userId)
    };
  }

  const base = prefix ? `${prefix}:presence` : "presence";
  const roomKey = (roomId) => `${base}:room:${roomId}`;
  const userKey = (roomId, userId) => `${base}:room:${roomId}:user:${userId}`;
  const socketKey = (socketId) => `${base}:socket:${socketId}`;
  const onlineUsersKey = `${base}:online:users`;
  const onlineUserKey = (userId) => `${base}:online:user:${userId}`;
  const onlineSocketKey = (socketId) => `${base}:online:socket:${socketId}`;
  const socketTtl = 60 * 60;

  const canJoin = async (roomId, userId) => {
    const users = await redisClient.sMembers(roomKey(roomId));
    if (users.includes(userId)) {
      return true;
    }
    return users.length < 2;
  };

  const register = async (roomId, userId, socketId) => {
    // Pipeline: 3 commands in a single network round trip.
    const pipeline = redisClient.multi();
    pipeline.sAdd(roomKey(roomId), userId);
    pipeline.sAdd(userKey(roomId, userId), socketId);
    pipeline.setEx(socketKey(socketId), socketTtl, JSON.stringify({ roomId, userId }));
    await pipeline.exec();
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
    // Pipeline the delete + sRem into one round trip.
    const pipeline = redisClient.multi();
    pipeline.del(socketKey(socketId));
    pipeline.sRem(userKey(roomId, userId), socketId);
    await pipeline.exec();

    const remaining = await redisClient.sCard(userKey(roomId, userId));
    if (remaining === 0) {
      await redisClient.sRem(roomKey(roomId), userId);
    }

    return { roomId, userId, noSocketsLeft: remaining === 0 };
  };

  const registerOnline = async (userId, socketId) => {
    // Pipeline: 4 commands in one round trip.
    const pipeline = redisClient.multi();
    pipeline.sAdd(onlineUsersKey, userId);
    pipeline.sAdd(onlineUserKey(userId), socketId);
    pipeline.setEx(onlineSocketKey(socketId), socketTtl, userId);
    pipeline.expire(onlineUserKey(userId), socketTtl);
    await pipeline.exec();
  };

  const unregisterOnline = async (socketId) => {
    const userId = await redisClient.get(onlineSocketKey(socketId));
    if (!userId) {
      return null;
    }

    // Pipeline delete + sRem into one round trip.
    const pipeline = redisClient.multi();
    pipeline.del(onlineSocketKey(socketId));
    pipeline.sRem(onlineUserKey(userId), socketId);
    await pipeline.exec();

    const remaining = await redisClient.sCard(onlineUserKey(userId));
    if (remaining === 0) {
      await redisClient.sRem(onlineUsersKey, userId);
    }

    return { userId, isOffline: remaining === 0 };
  };

  const getOtherUserId = async (roomId, userId) => {
    const users = await redisClient.sMembers(roomKey(roomId));
    return users.find((existing) => existing !== userId) || null;
  };

  const getUniqueUserCount = async (roomId) => {
    return redisClient.sCard(roomKey(roomId));
  };

  const isUserOnline = async (userId) => {
    return redisClient.sIsMember(onlineUsersKey, userId);
  };

  const isUserInRoom = async (roomId, userId) => {
    return redisClient.sIsMember(roomKey(roomId), userId);
  };

  const getUserSockets = async (userId) => {
    return redisClient.sMembers(onlineUserKey(userId));
  };

  return {
    canJoin,
    register,
    unregister,
    getOtherUserId,
    getUniqueUserCount,
    registerOnline,
    unregisterOnline,
    isUserOnline,
    listOnlineUserIds,
    isUserInRoom,
    getUserSockets
  };
}

module.exports = { createPresenceStore };
