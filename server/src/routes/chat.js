const express = require("express");
const { listMessages, postMessage, getConversation } = require("../controllers/chatController");
const { createAuthMiddleware } = require("../middleware/auth");

function chatRouter(env, messageStore, conversationStore) {
  const router = express.Router();

  router.get("/conversation", createAuthMiddleware(env), (req, res) =>
    getConversation(req, res, conversationStore, env)
  );

  router.get("/messages", createAuthMiddleware(env), (req, res) =>
    listMessages(req, res, messageStore, conversationStore, env)
  );

  router.post("/message", createAuthMiddleware(env), (req, res) =>
    postMessage(req, res, messageStore, conversationStore, env)
  );

  return router;
}

module.exports = { chatRouter };
