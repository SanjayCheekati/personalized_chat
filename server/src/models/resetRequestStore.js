const { nanoid } = require("nanoid");

function mapDoc(doc) {
  return {
    id: doc.id,
    username: doc.username,
    userId: doc.userId || null,
    message: doc.message,
    status: doc.status || "open",
    adminNotes: doc.adminNotes || "",
    createdAt: doc.createdAt ? doc.createdAt.toISOString?.() || doc.createdAt : null,
    updatedAt: doc.updatedAt ? doc.updatedAt.toISOString?.() || doc.updatedAt : null,
    resolvedAt: doc.resolvedAt ? doc.resolvedAt.toISOString?.() || doc.resolvedAt : null,
    resolvedBy: doc.resolvedBy || null
  };
}

function normalizeRequest(request) {
  if (!request) {
    return null;
  }

  return {
    id: request.id,
    username: request.username,
    userId: request.userId || null,
    message: request.message,
    status: request.status || "open",
    adminNotes: request.adminNotes || "",
    createdAt: request.createdAt || null,
    updatedAt: request.updatedAt || null,
    resolvedAt: request.resolvedAt || null,
    resolvedBy: request.resolvedBy || null
  };
}

function createResetRequestStore({ db } = {}) {
  const collection = db ? db.collection("reset_requests") : null;
  const requests = new Map();

  if (collection) {
    collection.createIndex({ createdAt: -1 }).catch(() => {});
    collection.createIndex({ status: 1 }).catch(() => {});
  }

  const createRequest = async (input) => {
    const now = new Date();
    const request = {
      id: nanoid(12),
      username: input.username,
      userId: input.userId || null,
      message: input.message,
      status: "open",
      adminNotes: "",
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
      resolvedBy: null
    };

    if (collection) {
      await collection.insertOne({ ...request });
      return mapDoc(request);
    }

    requests.set(request.id, request);
    return normalizeRequest(request);
  };

  const listRequests = async () => {
    if (collection) {
      const docs = await collection.find({}).sort({ createdAt: -1 }).toArray();
      return docs.map(mapDoc);
    }

    return Array.from(requests.values())
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .map(normalizeRequest);
  };

  const updateRequest = async (requestId, updates = {}) => {
    if (!requestId) {
      return null;
    }

    const nextUpdates = {
      updatedAt: new Date()
    };

    if (typeof updates.status === "string") {
      nextUpdates.status = updates.status;
      nextUpdates.resolvedAt = updates.status === "resolved" ? new Date() : null;
    }

    if (typeof updates.adminNotes === "string") {
      nextUpdates.adminNotes = updates.adminNotes;
    }

    if (updates.resolvedBy) {
      nextUpdates.resolvedBy = updates.resolvedBy;
    }

    if (collection) {
      const result = await collection.findOneAndUpdate(
        { id: requestId },
        { $set: nextUpdates },
        { returnDocument: "after" }
      );
      return result ? mapDoc(result) : null;
    }

    const existing = requests.get(requestId);
    if (!existing) {
      return null;
    }

    const updated = { ...existing, ...nextUpdates };
    requests.set(requestId, updated);
    return normalizeRequest(updated);
  };

  const deleteByUserId = async (userId) => {
    if (!userId) {
      return;
    }

    if (collection) {
      await collection.deleteMany({ userId });
    } else {
      for (const [id, req] of requests.entries()) {
        if (req.userId === userId) {
          requests.delete(id);
        }
      }
    }
  };

  const count = async () => {
    if (collection) {
      return collection.countDocuments();
    }
    return requests.size;
  };

  return {
    createRequest,
    listRequests,
    updateRequest,
    count,
    deleteByUserId
  };
}

module.exports = { createResetRequestStore };
