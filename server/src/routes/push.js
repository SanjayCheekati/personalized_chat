const express = require("express");
const { createAuthMiddleware } = require("../middleware/auth");

function pushRouter(env, userStore) {
  const router = express.Router();

  router.get("/push/vapid-key", (req, res) => {
    res.json({ publicKey: env.VAPID_PUBLIC_KEY });
  });

  router.post("/push/subscribe", createAuthMiddleware(env), async (req, res) => {
    const { subscription } = req.body || {};
    const userId = req.user.id;

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: "missing_subscription" });
    }

    try {
      await userStore.addPushSubscription(userId, subscription);
      res.json({ ok: true });
    } catch (error) {
      console.error("Failed to add subscription:", error);
      res.status(500).json({ error: "failed_to_subscribe" });
    }
  });

  router.post("/push/unsubscribe", createAuthMiddleware(env), async (req, res) => {
    const { endpoint } = req.body || {};
    const userId = req.user.id;

    if (!endpoint) {
      return res.status(400).json({ error: "missing_endpoint" });
    }

    try {
      await userStore.removePushSubscription(userId, endpoint);
      res.json({ ok: true });
    } catch (error) {
      console.error("Failed to remove subscription:", error);
      res.status(500).json({ error: "failed_to_unsubscribe" });
    }
  });

  return router;
}

module.exports = { pushRouter };
