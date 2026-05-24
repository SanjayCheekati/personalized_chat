const jwt = require("jsonwebtoken");

function createAuthMiddleware(env) {
  return (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";

    if (!token) {
      return res.status(401).json({ error: "missing_token" });
    }

    try {
      const payload = jwt.verify(token, env.JWT_SECRET);
      req.user = payload;
      return next();
    } catch {
      return res.status(401).json({ error: "invalid_token" });
    }
  };
}

function createAdminMiddleware(env) {
  const auth = createAuthMiddleware(env);
  return (req, res, next) => {
    auth(req, res, () => {
      if (req.user?.role === "admin" || req.user?.isAdmin) {
        return next();
      }
      return res.status(403).json({ error: "forbidden" });
    });
  };
}

function verifySocketToken(token, env) {
  return jwt.verify(token, env.JWT_SECRET);
}

module.exports = { createAuthMiddleware, createAdminMiddleware, verifySocketToken };
