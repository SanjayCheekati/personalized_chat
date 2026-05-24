const { Server } = require("socket.io");
const { verifySocketToken } = require("../middleware/auth");

const ADMIN_ROOM = "admin";

function initSocket(
  server,
  { env, messageStore, conversationStore, presenceStore, userStore, corsOrigin }
) {
  const io = new Server(server, {
    cors: {
      origin: corsOrigin || env.CLIENT_ORIGIN
    }
  });

  io.use((socket, next) => {
    const { token, roomId } = socket.handshake.auth || {};
    if (!token) {
      return next(new Error("missing_auth"));
    }

    try {
      const user = verifySocketToken(token, env);
      const isAdmin = user?.role === "admin" || user?.isAdmin;
      if (!roomId && !isAdmin) {
        return next(new Error("missing_room"));
      }
      socket.data.user = user;
      socket.data.roomId = roomId || null;
      socket.data.isAdmin = isAdmin;
      return next();
    } catch {
      return next(new Error("invalid_auth"));
    }
  });

  io.on("connection", async (socket) => {
    const { user, roomId, isAdmin } = socket.data;

    await presenceStore.registerOnline(user.id, socket.id);

    io.to(ADMIN_ROOM).emit("admin_presence_update", {
      userId: user.id,
      online: true,
      lastSeen: null
    });

    if (isAdmin) {
      socket.join(ADMIN_ROOM);
    }

    if (roomId) {
      if (conversationStore) {
        const allowed = await conversationStore.isParticipant(roomId, user.id);
        if (!allowed) {
          socket.emit("room_forbidden");
          socket.disconnect();
          return;
        }
      }

      if (!(await presenceStore.canJoin(roomId, user.id))) {
        socket.emit("room_full");
        socket.disconnect();
        return;
      }

      await presenceStore.register(roomId, user.id, socket.id);
      socket.join(roomId);

      const otherUserId = await presenceStore.getOtherUserId(roomId, user.id);
      if (otherUserId) {
        socket.emit("user_online", { userId: otherUserId });
      }
      socket.to(roomId).emit("user_online", { userId: user.id });
    }

    socket.on("join_conversation", async (payload, ack) => {
      if (!isAdmin) {
        if (typeof ack === "function") {
          ack({ ok: false, error: "forbidden" });
        }
        return;
      }

      const conversationId = payload?.conversationId;
      if (!conversationId) {
        if (typeof ack === "function") {
          ack({ ok: false, error: "missing_conversation" });
        }
        return;
      }

      const allowed = conversationStore
        ? await conversationStore.isParticipant(conversationId, user.id)
        : true;
      if (!allowed) {
        if (typeof ack === "function") {
          ack({ ok: false, error: "forbidden" });
        }
        return;
      }

      if (socket.data.roomId) {
        const previous = await presenceStore.unregister(socket.id);
        if (previous?.noSocketsLeft) {
          const lastSeen = new Date().toISOString();
          socket.to(previous.roomId).emit("user_offline", { userId: user.id, lastSeen });
        }
        socket.leave(socket.data.roomId);
      }

      if (!(await presenceStore.canJoin(conversationId, user.id))) {
        if (typeof ack === "function") {
          ack({ ok: false, error: "room_full" });
        }
        return;
      }

      socket.data.roomId = conversationId;
      await presenceStore.register(conversationId, user.id, socket.id);
      socket.join(conversationId);

      const otherUserId = await presenceStore.getOtherUserId(conversationId, user.id);
      if (otherUserId) {
        socket.emit("user_online", { userId: otherUserId });
      }
      socket.to(conversationId).emit("user_online", { userId: user.id });

      if (typeof ack === "function") {
        ack({ ok: true, roomId: conversationId });
      }
    });

    socket.on("send_message", async (payload, ack) => {
      const text = String(payload?.text || "").trim();
      if (!text) {
        if (typeof ack === "function") {
          ack({ ok: false, error: "empty_message" });
        }
        return;
      }

      const activeRoomId = socket.data.roomId;
      if (!activeRoomId) {
        if (typeof ack === "function") {
          ack({ ok: false, error: "missing_room" });
        }
        return;
      }

      try {
        const receiverId = conversationStore
          ? await conversationStore.getOtherParticipant(activeRoomId, user.id)
          : await presenceStore.getOtherUserId(activeRoomId, user.id);
        if (conversationStore && !receiverId) {
          if (typeof ack === "function") {
            ack({ ok: false, error: "recipient_missing" });
          }
          return;
        }
        const replyTo = payload?.replyTo
          ? {
              id: payload.replyTo.id,
              text: payload.replyTo.text,
              senderId: payload.replyTo.senderId || null
            }
          : null;
        const message = await messageStore.save({
          roomId: activeRoomId,
          senderId: user.id,
          receiverId,
          text,
          clientId: payload?.clientId || null,
          replyTo
        });

        if (conversationStore) {
          await conversationStore.touchLastMessage(activeRoomId, message);
          if (receiverId) {
            await conversationStore.incrementUnread(activeRoomId, receiverId);
          }
        }

        io.to(activeRoomId).emit("receive_message", message);
        await emitAdminConversationUpdate(io, conversationStore, activeRoomId);

        if (typeof ack === "function") {
          ack({ ok: true, message });
        }
      } catch {
        if (typeof ack === "function") {
          ack({ ok: false, error: "message_save_failed" });
        }
      }
    });

    socket.on("typing", () => {
      const activeRoomId = socket.data.roomId;
      if (!activeRoomId) {
        return;
      }
      socket.to(activeRoomId).emit("user_typing", { userId: user.id, typing: true });
      if (!isAdmin) {
        io.to(ADMIN_ROOM).emit("admin_typing", {
          conversationId: activeRoomId,
          userId: user.id,
          typing: true
        });
      }
    });

    socket.on("stop_typing", () => {
      const activeRoomId = socket.data.roomId;
      if (!activeRoomId) {
        return;
      }
      socket.to(activeRoomId).emit("user_typing", { userId: user.id, typing: false });
      if (!isAdmin) {
        io.to(ADMIN_ROOM).emit("admin_typing", {
          conversationId: activeRoomId,
          userId: user.id,
          typing: false
        });
      }
    });

    socket.on("seen_message", async (payload) => {
      const ids = Array.isArray(payload?.messageIds) ? payload.messageIds : [];
      if (!ids.length) {
        return;
      }
      const seenAt = payload?.seenAt || new Date().toISOString();

      const activeRoomId = socket.data.roomId;
      if (!activeRoomId) {
        return;
      }

      await messageStore.markSeen(activeRoomId, ids, seenAt);
      if (conversationStore) {
        await conversationStore.resetUnread(activeRoomId, user.id);
      }
      socket
        .to(activeRoomId)
        .emit("message_seen", { messageIds: ids, seenBy: user.id, seenAt });
      await emitAdminConversationUpdate(io, conversationStore, activeRoomId);
    });

    socket.on("edit_message", async (payload, ack) => {
      const messageId = payload?.messageId;
      const text = String(payload?.text || "").trim();
      if (!messageId || !text) {
        if (typeof ack === "function") {
          ack({ ok: false, error: "missing_message" });
        }
        return;
      }

      const activeRoomId = socket.data.roomId;
      if (!activeRoomId) {
        if (typeof ack === "function") {
          ack({ ok: false, error: "missing_room" });
        }
        return;
      }

      try {
        const updated = await messageStore.markEdited(activeRoomId, messageId, user.id, text);
        if (!updated) {
          if (typeof ack === "function") {
            ack({ ok: false, error: "edit_forbidden" });
          }
          return;
        }

        if (conversationStore) {
          await conversationStore.updateLastMessageText(activeRoomId, messageId, {
            text: updated.text,
            edited: true
          });
        }

        io.to(activeRoomId).emit("message_edited", { message: updated });
        await emitAdminConversationUpdate(io, conversationStore, activeRoomId);
        if (typeof ack === "function") {
          ack({ ok: true, message: updated });
        }
      } catch {
        if (typeof ack === "function") {
          ack({ ok: false, error: "edit_failed" });
        }
      }
    });

    socket.on("delete_message", async (payload, ack) => {
      const messageId = payload?.messageId;
      if (!messageId) {
        if (typeof ack === "function") {
          ack({ ok: false, error: "missing_message_id" });
        }
        return;
      }

      const activeRoomId = socket.data.roomId;
      if (!activeRoomId) {
        if (typeof ack === "function") {
          ack({ ok: false, error: "missing_room" });
        }
        return;
      }

      try {
        await messageStore.markDeleted(activeRoomId, messageId, user.id);
        if (conversationStore) {
          await conversationStore.updateLastMessageText(activeRoomId, messageId, {
            deleted: true,
            text: "This message was deleted."
          });
        }
        io.to(activeRoomId).emit("message_deleted", { messageId, deletedBy: user.id });
        await emitAdminConversationUpdate(io, conversationStore, activeRoomId);

        if (typeof ack === "function") {
          ack({ ok: true });
        }
      } catch {
        if (typeof ack === "function") {
          ack({ ok: false, error: "delete_failed" });
        }
      }
    });

    socket.on("disconnect", async () => {
      const result = await presenceStore.unregister(socket.id);
      if (result?.noSocketsLeft) {
        const lastSeen = new Date().toISOString();
        socket.to(result.roomId).emit("user_offline", { userId: user.id, lastSeen });
        if (userStore?.touchLastSeen) {
          await userStore.touchLastSeen(user.id, lastSeen);
        }
      }

      const offline = await presenceStore.unregisterOnline(socket.id);
      if (offline?.isOffline) {
        io.to(ADMIN_ROOM).emit("admin_presence_update", {
          userId: offline.userId,
          online: false,
          lastSeen: new Date().toISOString()
        });
      }
    });

    socket.on("remember_admin", async (payload, ack) => {
      if (isAdmin) {
        if (typeof ack === "function") {
          ack({ ok: false, error: "forbidden" });
        }
        return;
      }

      const activeRoomId = socket.data.roomId;
      if (!activeRoomId) {
        if (typeof ack === "function") {
          ack({ ok: false, error: "missing_room" });
        }
        return;
      }

      try {
        const receiverId = conversationStore
          ? await conversationStore.getOtherParticipant(activeRoomId, user.id)
          : await presenceStore.getOtherUserId(activeRoomId, user.id);

        if (!receiverId) {
          if (typeof ack === "function") {
            ack({ ok: false, error: "recipient_missing" });
          }
          return;
        }

        const sender = userStore ? await userStore.findById(user.id) : null;
        const senderName = sender?.name || sender?.username || "Someone";
        const timestamp = new Date().toISOString();
        const text = `${senderName} remembered you at ${new Date(timestamp).toLocaleTimeString(
          [],
          { hour: "2-digit", minute: "2-digit" }
        )} ❤️`;

        const message = await messageStore.save({
          roomId: activeRoomId,
          senderId: user.id,
          receiverId,
          text,
          kind: "remember",
          clientId: payload?.clientId || null
        });

        if (conversationStore) {
          await conversationStore.touchLastMessage(activeRoomId, message);
          await conversationStore.incrementUnread(activeRoomId, receiverId);
        }

        io.to(activeRoomId).emit("receive_message", message);
        await emitAdminConversationUpdate(io, conversationStore, activeRoomId);

        if (typeof ack === "function") {
          ack({ ok: true, message });
        }
      } catch {
        if (typeof ack === "function") {
          ack({ ok: false, error: "remember_failed" });
        }
      }
    });
  });

  return io;
}

async function emitAdminConversationUpdate(io, conversationStore, conversationId) {
  if (!conversationStore) {
    return;
  }

  const conversation = await conversationStore.getById(conversationId);
  if (!conversation) {
    return;
  }

  io.to(ADMIN_ROOM).emit("admin_conversation_update", {
    id: conversation.id,
    participants: conversation.participants,
    lastMessage: conversation.lastMessage,
    lastMessageAt: conversation.lastMessageAt,
    unreadBy: conversation.unreadBy || {},
    updatedAt: conversation.updatedAt
  });
}

module.exports = { initSocket };
