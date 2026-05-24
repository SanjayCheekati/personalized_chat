const express = require("express");
const { login, logout, requestPasswordReset } = require("../controllers/authController");
const { createAuthMiddleware } = require("../middleware/auth");

function authRouter(env, conversationStore, resetRequestStore) {
  const router = express.Router();

  router.post("/login", (req, res) => login(req, res, env, conversationStore));
  router.post("/forgot-password", (req, res) =>
    requestPasswordReset(req, res, resetRequestStore)
  );
  router.post("/logout", createAuthMiddleware(env), logout);

  return router;
}

module.exports = { authRouter };
