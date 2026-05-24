const jwt = require("jsonwebtoken");
const { userStore } = require("../models/userStore");

function signToken(user, env) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      username: user.username || "",
      email: user.email || "",
      role: user.role || "user",
      status: user.status || "active",
      isAdmin: user.role === "admin",
      isGuest: Boolean(user.isGuest)
    },
    env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    username: user.username || "",
    email: user.email || "",
    role: user.role || "user",
    status: user.status || "active",
    lastLoginAt: user.lastLoginAt || null,
    lastSeenAt: user.lastSeenAt || null,
    isGuest: Boolean(user.isGuest)
  };
}

async function login(req, res, env, conversationStore) {
  const { username, password } = req.body || {};
  const normalizedUsername = String(username || "").trim().toLowerCase();

  if (!normalizedUsername || !password) {
    return res.status(400).json({ error: "missing_credentials" });
  }

  const user = await userStore.findByUsername(normalizedUsername);
  if (!user) {
    return res.status(401).json({ error: "invalid_credentials" });
  }

  if (["suspended", "banned", "deleted"].includes(user.status)) {
    return res.status(403).json({ error: "user_disabled" });
  }

  const valid = await userStore.verifyPassword(user, password);
  if (!valid) {
    return res.status(401).json({ error: "invalid_credentials" });
  }

  await userStore.touchLogin(user.id);

  const isAdmin = user.role === "admin";
  let roomId = null;
  let peer = null;

  if (!isAdmin && conversationStore) {
    const adminUser = await userStore.findByUsername(env.ADMIN_USERNAME);
    if (adminUser) {
      const conversation = await conversationStore.createOrFindDirect(user.id, adminUser.id);
      roomId = conversation ? conversation.id : null;
      peer = sanitizeUser(adminUser);
    }
  }

  if (isAdmin && conversationStore) {
    const conversations = await conversationStore.listForUser(user.id);
    roomId = conversations[0]?.id || null;
  }

  const resolvedRoomId = isAdmin ? roomId : roomId || env.DEFAULT_ROOM_ID;

  return res.json({
    token: signToken(user, env),
    user: sanitizeUser(user),
    roomId: resolvedRoomId,
    peer
  });
}

async function requestPasswordReset(req, res, resetRequestStore) {
  if (!resetRequestStore) {
    return res.status(500).json({ error: "reset_unavailable" });
  }

  const username = String(req.body?.username || "").trim().toLowerCase();
  const message = String(req.body?.message || "").trim();

  if (!username || !message) {
    return res.status(400).json({ error: "missing_fields" });
  }

  const user = await userStore.findByUsername(username);
  const request = await resetRequestStore.createRequest({
    username,
    userId: user?.id || null,
    message
  });

  return res.json({ ok: true, requestId: request?.id || null });
}

function logout(req, res) {
  res.json({ ok: true });
}

module.exports = { login, logout, requestPasswordReset };
