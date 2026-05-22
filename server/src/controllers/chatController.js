async function listMessages(req, res, messageStore, env) {
  try {
    const roomId = req.query.roomId || env.DEFAULT_ROOM_ID;
    const limit = Math.min(Number(req.query.limit || 50), 200);
    const before = req.query.before || null;

    const messages = await messageStore.list(roomId, { limit, before });
    res.json({ messages });
  } catch {
    res.status(500).json({ error: "message_list_failed" });
  }
}

async function postMessage(req, res, messageStore, env) {
  try {
    const roomId = req.body.roomId || env.DEFAULT_ROOM_ID;
    const text = String(req.body.text || "").trim();

    if (!text) {
      return res.status(400).json({ error: "empty_message" });
    }

    const message = await messageStore.save({
      roomId,
      senderId: req.user.id,
      receiverId: req.body.receiverId || null,
      text,
      clientId: req.body.clientId || null
    });

    return res.json({ message });
  } catch {
    return res.status(500).json({ error: "message_save_failed" });
  }
}

module.exports = { listMessages, postMessage };
