const jwt = require("jsonwebtoken");
const { userStore } = require("../models/userStore");

function signToken(user, env) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      username: user.username || "",
      email: user.email || "",
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
    isGuest: Boolean(user.isGuest)
  };
}

async function login(req, res, env) {
  const { username, password } = req.body || {};
  const normalizedUsername = String(username || "").trim().toLowerCase();

  if (!normalizedUsername || !password) {
    return res.status(400).json({ error: "missing_credentials" });
  }

  const user = await userStore.findByUsername(normalizedUsername);
  if (!user) {
    return res.status(401).json({ error: "invalid_credentials" });
  }

  const valid = await userStore.verifyPassword(user, password);
  if (!valid) {
    return res.status(401).json({ error: "invalid_credentials" });
  }

  return res.json({
    token: signToken(user, env),
    user: sanitizeUser(user),
    roomId: env.DEFAULT_ROOM_ID
  });
}

function logout(req, res) {
  res.json({ ok: true });
}

module.exports = { login, logout };
