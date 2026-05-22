const express = require("express");
const { listMessages, postMessage } = require("../controllers/chatController");
const { createAuthMiddleware } = require("../middleware/auth");

function chatRouter(env, messageStore) {
  const router = express.Router();

  router.get("/messages", createAuthMiddleware(env), (req, res) =>
    listMessages(req, res, messageStore, env)
  );

  router.post("/message", createAuthMiddleware(env), (req, res) =>
    postMessage(req, res, messageStore, env)
  );

  return router;
}

module.exports = { chatRouter };
