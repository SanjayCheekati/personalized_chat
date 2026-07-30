const { Server } = require("socket.io");
const { verifySocketToken } = require("../middleware/auth");
const { sendPushNotification } = require("../services/push");

const ADMIN_ROOM = "admin";

function initSocket(
  server,
  { env, messageStore, conversationStore, presenceStore, userStore, corsOrigin }
) {
  const io = new Server(server, {
    cors: {
      origin: corsOrigin || env.CLIENT_ORIGIN
    },
    // Default Socket.IO values (25s/20s). The previous 5s/5s was far too
    // aggressive — a single slow ping caused a reconnect and re-join sequence.
    pingInterval: 25000,
    pingTimeout: 20000
  });

  io.use((socket, next) => {
    const { token, roomId } = socket.handshake.auth || {};
    if (!token) {
      return next(new Error("missing_auth"));
    }

    try {
      const user = verifySocketToken(token, env);
      const isAdmin = user?.role === "admin" || user?.isAdmin;
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

    socket.join(user.id);

    await presenceStore.registerOnline(user.id, socket.id);

    io.to(ADMIN_ROOM).emit("admin_presence_update", {
      userId: user.id,
      online: true,
      lastSeen: null
    });

    if (isAdmin) {
      socket.join(ADMIN_ROOM);

      if (!roomId) {
        if (presenceStore?.getUserSockets) {
          const userSockets = await presenceStore.getUserSockets(user.id);
          for (const otherSocketId of userSockets) {
            if (otherSocketId !== socket.id) {
              const prevRoom = await presenceStore.unregister(otherSocketId);
              if (prevRoom?.noSocketsLeft) {
                const lastSeen = new Date().toISOString();
                io.to(prevRoom.roomId).emit("user_offline", { userId: user.id, lastSeen });
                if (userStore?.touchLastSeen) {
                  await userStore.touchLastSeen(user.id, lastSeen);
                }
              }
            }
          }
        }
      }
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

      const otherUserId = conversationStore
        ? await conversationStore.getOtherParticipant(roomId, user.id)
        : await presenceStore.getOtherUserId(roomId, user.id);

      if (otherUserId) {
        const isOtherInRoom = await presenceStore.isUserInRoom(roomId, otherUserId);
        if (isOtherInRoom) {
          socket.emit("user_online", { userId: otherUserId });
        } else {
          let lastSeen = null;
          if (userStore?.findById) {
            const otherUserObj = await userStore.findById(otherUserId);
            if (otherUserObj) {
              lastSeen = otherUserObj.lastSeenAt;
            }
          }
          socket.emit("user_offline", { userId: otherUserId, lastSeen });
        }
      }
      socket.to(roomId).emit("user_online", { userId: user.id });
    }

    socket.on("join_conversation", async (payload, ack) => {
      const conversationId = payload?.conversationId;
      if (!conversationId) {
        if (socket.data.roomId) {
          const previous = await presenceStore.unregister(socket.id);
          if (previous?.noSocketsLeft) {
            const lastSeen = new Date().toISOString();
            socket.to(previous.roomId).emit("user_offline", { userId: user.id, lastSeen });
            if (userStore?.touchLastSeen) {
              await userStore.touchLastSeen(user.id, lastSeen);
            }
          }
          socket.leave(socket.data.roomId);
          socket.data.roomId = null;
        }
        if (typeof ack === "function") {
          ack({ ok: true });
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
          if (userStore?.touchLastSeen) {
            await userStore.touchLastSeen(user.id, lastSeen);
          }
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

      const otherUserId = conversationStore
        ? await conversationStore.getOtherParticipant(conversationId, user.id)
        : await presenceStore.getOtherUserId(conversationId, user.id);

      if (otherUserId) {
        const isOtherInRoom = await presenceStore.isUserInRoom(conversationId, otherUserId);
        if (isOtherInRoom) {
          socket.emit("user_online", { userId: otherUserId });
        } else {
          let lastSeen = null;
          if (userStore?.findById) {
            const otherUserObj = await userStore.findById(otherUserId);
            if (otherUserObj) {
              lastSeen = otherUserObj.lastSeenAt;
            }
          }
          socket.emit("user_offline", { userId: otherUserId, lastSeen });
        }
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
        const receiverActive = receiverId
          ? await presenceStore.isUserInRoom(activeRoomId, receiverId)
          : false;

        const message = await messageStore.save({
          roomId: activeRoomId,
          senderId: user.id,
          receiverId,
          text,
          clientId: payload?.clientId || null,
          replyTo,
          seen: receiverActive,
          seenAt: receiverActive ? new Date().toISOString() : null
        });

        if (conversationStore) {
          await conversationStore.touchLastMessage(activeRoomId, message);
          if (receiverId && !receiverActive) {
            await conversationStore.incrementUnread(activeRoomId, receiverId);
          }
        }

        io.to(activeRoomId).emit("receive_message", message);
        if (receiverId) {
          io.to(receiverId).emit("receive_message", message);
        }
        // Fire non-blocking — admin dashboard update should NOT block the
        // sender's ACK which is on the critical path.
        emitAdminConversationUpdate(io, conversationStore, activeRoomId).catch(() => {});

        if (receiverId && !receiverActive) {
          sendPushNotification(receiverId, {
            title: user.name || user.username || "FlashChat",
            body: text,
            roomId: activeRoomId
          }).catch((err) => console.error("Error sending push notification:", err));
        }

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
      if (!isAdmin) {
        if (typeof ack === "function") {
          ack({ ok: false, error: "forbidden" });
        }
        return;
      }

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
        const updated = await messageStore.markEdited(activeRoomId, messageId, user.id, text, isAdmin);
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
      if (!isAdmin) {
        if (typeof ack === "function") {
          ack({ ok: false, error: "forbidden" });
        }
        return;
      }

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

    socket.on("clear_history", async (payload, ack) => {
      const activeRoomId = socket.data.roomId;
      if (!activeRoomId) {
        if (typeof ack === "function") {
          ack({ ok: false, error: "missing_room" });
        }
        return;
      }

      try {
        const now = new Date().toISOString();
        if (isAdmin) {
          // Admin clears for both regular user and admin
          const participants = conversationStore 
            ? await conversationStore.getParticipants(activeRoomId)
            : [];
          
          const clearedAt = {};
          if (participants && participants.length > 0) {
            participants.forEach(pId => {
              clearedAt[pId] = now;
            });
          } else {
            clearedAt[user.id] = now;
          }
          
          if (conversationStore) {
            await conversationStore.clearHistory(activeRoomId, clearedAt);
          }
          
          // Broadcast to all participants in the room
          io.to(activeRoomId).emit("history_cleared", { clearedAt, clearedBy: user.id });
          if (conversationStore) {
            await emitAdminConversationUpdate(io, conversationStore, activeRoomId);
          }
        } else {
          // Regular user clears only for themselves
          if (conversationStore) {
            await conversationStore.clearHistoryForUser(activeRoomId, user.id, now);
          }
          
          // Broadcast history_cleared to room
          const clearedAt = { [user.id]: now };
          io.to(activeRoomId).emit("history_cleared", { clearedAt, clearedBy: user.id });
          if (conversationStore) {
            await emitAdminConversationUpdate(io, conversationStore, activeRoomId);
          }
        }

        if (typeof ack === "function") {
          ack({ ok: true });
        }
      } catch (err) {
        console.error("clear_history error:", err);
        if (typeof ack === "function") {
          ack({ ok: false, error: "clear_history_failed" });
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

    const ALLOWED_REACTIONS = ["❤️", "😂", "😮", "😢", "👍", "🙏"];

    socket.on("react_message", async (payload, ack) => {
      const messageId = payload?.messageId;
      const emoji = payload?.emoji;
      if (!messageId || !emoji || !ALLOWED_REACTIONS.includes(emoji)) {
        if (typeof ack === "function") {
          ack({ ok: false, error: "invalid_reaction" });
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
        await messageStore.addReaction(activeRoomId, messageId, user.id, emoji);
        io.to(activeRoomId).emit("message_reaction", {
          messageId,
          emoji,
          userId: user.id,
          action: "add"
        });
        if (typeof ack === "function") {
          ack({ ok: true });
        }
      } catch {
        if (typeof ack === "function") {
          ack({ ok: false, error: "reaction_failed" });
        }
      }
    });

    socket.on("unreact_message", async (payload, ack) => {
      const messageId = payload?.messageId;
      const emoji = payload?.emoji;
      if (!messageId || !emoji || !ALLOWED_REACTIONS.includes(emoji)) {
        if (typeof ack === "function") {
          ack({ ok: false, error: "invalid_reaction" });
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
        await messageStore.removeReaction(activeRoomId, messageId, user.id, emoji);
        io.to(activeRoomId).emit("message_reaction", {
          messageId,
          emoji,
          userId: user.id,
          action: "remove"
        });
        if (typeof ack === "function") {
          ack({ ok: true });
        }
      } catch {
        if (typeof ack === "function") {
          ack({ ok: false, error: "unreaction_failed" });
        }
      }
    });

    socket.on("remember_admin", async (payload, ack) => {
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
        const formattedTime = payload?.localTime || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const text = `${senderName} Remembered you at ${formattedTime}`;

        const receiverActive = receiverId
          ? await presenceStore.isUserInRoom(activeRoomId, receiverId)
          : false;

        const message = await messageStore.save({
          roomId: activeRoomId,
          senderId: user.id,
          receiverId,
          text,
          kind: "remember",
          clientId: payload?.clientId || null,
          seen: receiverActive,
          seenAt: receiverActive ? new Date().toISOString() : null
        });

        if (conversationStore) {
          await conversationStore.touchLastMessage(activeRoomId, message);
          if (receiverId && !receiverActive) {
            await conversationStore.incrementUnread(activeRoomId, receiverId);
          }
        }

        io.to(activeRoomId).emit("receive_message", message);
        if (receiverId) {
          io.to(receiverId).emit("receive_message", message);
        }
        await emitAdminConversationUpdate(io, conversationStore, activeRoomId);

        if (receiverId && !receiverActive) {
          sendPushNotification(receiverId, {
            title: senderName,
            body: text,
            roomId: activeRoomId
          }).catch((err) => console.error("Error sending push notification:", err));
        }

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
    updatedAt: conversation.updatedAt,
    clearedAt: conversation.clearedAt || {}
  });
}

module.exports = { initSocket };
