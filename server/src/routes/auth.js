const express = require("express");
const { login, logout, requestPasswordReset, signup } = require("../controllers/authController");
const { createAuthMiddleware } = require("../middleware/auth");

function authRouter(env, conversationStore, resetRequestStore, presenceStore) {
  const router = express.Router();

  router.post("/login", (req, res) => login(req, res, env, conversationStore, presenceStore));
  router.post("/signup", (req, res) => signup(req, res, env, conversationStore, presenceStore));
  router.post("/forgot-password", (req, res) =>
    requestPasswordReset(req, res, resetRequestStore)
  );
  router.post("/logout", createAuthMiddleware(env), logout);

  return router;
}

module.exports = { authRouter };
