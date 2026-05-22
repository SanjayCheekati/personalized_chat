const express = require("express");
const { login, logout } = require("../controllers/authController");
const { createAuthMiddleware } = require("../middleware/auth");

function authRouter(env) {
  const router = express.Router();

  router.post("/login", (req, res) => login(req, res, env));
  router.post("/logout", createAuthMiddleware(env), logout);

  return router;
}

module.exports = { authRouter };
