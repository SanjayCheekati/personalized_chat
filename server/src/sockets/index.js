const { Server } = require("socket.io");
const { verifySocketToken } = require("../middleware/auth");

function initSocket(server, { env, messageStore, presenceStore, corsOrigin }) {
  const io = new Server(server, {
    cors: {
      origin: corsOrigin || env.CLIENT_ORIGIN
    }
  });

  io.use((socket, next) => {
    const { token, roomId } = socket.handshake.auth || {};
    if (!token || !roomId) {
      return next(new Error("missing_auth"));
    }

    try {
      const user = verifySocketToken(token, env);
      socket.data.user = user;
      socket.data.roomId = roomId;
      return next();
    } catch {
      return next(new Error("invalid_auth"));
    }
  });

  io.on("connection", async (socket) => {
    const { user, roomId } = socket.data;

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

    socket.on("send_message", async (payload, ack) => {
      const text = String(payload?.text || "").trim();
      if (!text) {
        if (typeof ack === "function") {
          ack({ ok: false, error: "empty_message" });
        }
        return;
      }

      try {
        const receiverId = await presenceStore.getOtherUserId(roomId, user.id);
        const replyTo = payload?.replyTo
          ? {
              id: payload.replyTo.id,
              text: payload.replyTo.text,
              senderId: payload.replyTo.senderId || null
            }
          : null;
        const message = await messageStore.save({
          roomId,
          senderId: user.id,
          receiverId,
          text,
          clientId: payload?.clientId || null,
          replyTo
        });

        io.to(roomId).emit("receive_message", message);

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
      socket.to(roomId).emit("user_typing", { userId: user.id, typing: true });
    });

    socket.on("stop_typing", () => {
      socket.to(roomId).emit("user_typing", { userId: user.id, typing: false });
    });

    socket.on("seen_message", async (payload) => {
      const ids = Array.isArray(payload?.messageIds) ? payload.messageIds : [];
      if (!ids.length) {
        return;
      }
      const seenAt = payload?.seenAt || new Date().toISOString();

      await messageStore.markSeen(roomId, ids, seenAt);
      socket
        .to(roomId)
        .emit("message_seen", { messageIds: ids, seenBy: user.id, seenAt });
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

      try {
        const updated = await messageStore.markEdited(roomId, messageId, user.id, text);
        if (!updated) {
          if (typeof ack === "function") {
            ack({ ok: false, error: "edit_forbidden" });
          }
          return;
        }

        io.to(roomId).emit("message_edited", { message: updated });
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

      try {
        await messageStore.markDeleted(roomId, messageId, user.id);
        io.to(roomId).emit("message_deleted", { messageId, deletedBy: user.id });

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
        socket.to(roomId).emit("user_offline", { userId: user.id, lastSeen });
      }
    });
  });

  return io;
}

module.exports = { initSocket };
