const express = require("express");
const {
  listConversations,
  listUsers,
  updateUser,
  resetUserPassword,
  deleteUser,
  listResetRequests,
  updateResetRequest,
  getStats
} = require("../controllers/adminController");
const { createAdminMiddleware } = require("../middleware/auth");

function adminRouter(env, { conversationStore, userStore, presenceStore, resetRequestStore, messageStore }) {
  const router = express.Router();
  const requireAdmin = createAdminMiddleware(env);

  router.get("/admin/conversations", requireAdmin, (req, res) =>
    listConversations(req, res, conversationStore, userStore, presenceStore)
  );

  router.get("/admin/users", requireAdmin, (req, res) => listUsers(req, res, userStore));

  router.patch("/admin/users/:id", requireAdmin, (req, res) =>
    updateUser(req, res, userStore)
  );

  router.post("/admin/users/:id/reset-password", requireAdmin, (req, res) =>
    resetUserPassword(req, res, userStore)
  );

  router.delete("/admin/users/:id", requireAdmin, (req, res) =>
    deleteUser(req, res, userStore)
  );

  router.get("/admin/reset-requests", requireAdmin, (req, res) =>
    listResetRequests(req, res, resetRequestStore)
  );

  router.patch("/admin/reset-requests/:id", requireAdmin, (req, res) =>
    updateResetRequest(req, res, resetRequestStore)
  );

  router.get("/admin/stats", requireAdmin, (req, res) =>
    getStats(req, res, { userStore, conversationStore, messageStore, presenceStore, resetRequestStore })
  );

  return router;
}

module.exports = { adminRouter };
