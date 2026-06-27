const bcrypt = require("bcryptjs");
const { nanoid } = require("nanoid");

const DEFAULT_ROLE = "user";
const DEFAULT_STATUS = "active";

const state = {
  usersByEmail: new Map(),
  usersById: new Map(),
  usersByUsername: new Map()
};

let usersCollection = null;

function addUser(user) {
  const normalized = {
    ...user,
    username: user.username ? user.username.toLowerCase() : "",
    email: user.email ? user.email.toLowerCase() : ""
  };

  if (normalized.email) {
    state.usersByEmail.set(normalized.email, normalized);
  }
  if (normalized.username) {
    state.usersByUsername.set(normalized.username, normalized);
  }
  if (normalized.id) {
    state.usersById.set(normalized.id, normalized);
  }
  return normalized;
}

function normalizeUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id || (user._id ? String(user._id) : ""),
    name: user.name || "User",
    username: user.username || "",
    email: user.email || "",
    passwordHashes: Array.isArray(user.passwordHashes)
      ? user.passwordHashes
      : user.passwordHash
      ? [user.passwordHash]
      : user.passwordSecondaryHash
      ? [user.passwordSecondaryHash]
      : [],
    role: user.role || (user.isAdmin ? "admin" : DEFAULT_ROLE),
    status: user.status || DEFAULT_STATUS,
    plainPassword: user.plainPassword || "",
    createdAt: user.createdAt ? user.createdAt.toISOString?.() || user.createdAt : null,
    updatedAt: user.updatedAt ? user.updatedAt.toISOString?.() || user.updatedAt : null,
    lastLoginAt: user.lastLoginAt
      ? user.lastLoginAt.toISOString?.() || user.lastLoginAt
      : null,
    lastSeenAt: user.lastSeenAt
      ? user.lastSeenAt.toISOString?.() || user.lastSeenAt
      : null,
    isGuest: Boolean(user.isGuest),
    pushSubscriptions: user.pushSubscriptions || []
  };
}

async function initUserStore(env, db) {
  usersCollection = db ? db.collection("users") : null;

  if (usersCollection) {
    try {
      await usersCollection.createIndex({ username: 1 }, { unique: true });
    } catch (error) {
      console.warn(
        "Mongo user index creation failed",
        error?.message || error
      );
    }
  }

  if (env.SEED_USERS) {
    try {
      const seedUsers = JSON.parse(env.SEED_USERS);
      for (const seed of seedUsers) {
        const username = (seed.username || seed.email || "").toLowerCase();
        const email = (seed.email || "").toLowerCase();
        const passwords = Array.isArray(seed.passwords)
          ? seed.passwords
          : seed.password
          ? [seed.password]
          : [];
        const passwordHashes = seed.passwordHashes
          ? seed.passwordHashes
          : passwords.map((value) => bcrypt.hashSync(value, 10));
        const passwordHash = seed.passwordHash
          ? seed.passwordHash
          : passwordHashes[0] || (seed.password ? bcrypt.hashSync(seed.password, 10) : "");
        const now = new Date();

        const user = {
          id: seed.id || nanoid(12),
          name: seed.name || username || email || "User",
          username,
          email,
          passwordHash,
          passwordHashes,
          plainPassword: seed.password || (passwords && passwords[0]) || "",
          role: seed.role || DEFAULT_ROLE,
          status: seed.status || DEFAULT_STATUS,
          isGuest: false,
          createdAt: seed.createdAt ? new Date(seed.createdAt) : now,
          updatedAt: now,
          lastLoginAt: seed.lastLoginAt ? new Date(seed.lastLoginAt) : null,
          lastSeenAt: seed.lastSeenAt ? new Date(seed.lastSeenAt) : null
        };

        const normalized = addUser(user);

        if (usersCollection && username) {
          await usersCollection.updateOne(
            { username },
            { $setOnInsert: normalized },
            { upsert: true }
          );
        }
      }
    } catch (error) {
      console.warn("Failed to seed users", error?.message || error);
    }
  }

  await ensureAdminUser(env);
}

async function ensureAdminUser(env) {
  const adminUsername = String(env.ADMIN_USERNAME || "arjun").trim().toLowerCase();
  const adminName = env.ADMIN_NAME || "Arjun";
  const passwordHash = bcrypt.hashSync(env.ADMIN_PASSWORD || "Arjun@8096", 10);
  const now = new Date();

  let existing = null;
  if (usersCollection) {
    existing = await usersCollection.findOne({ username: adminUsername });
  } else {
    existing = state.usersByUsername.get(adminUsername) || null;
  }

  const baseUser = {
    id: existing?.id || nanoid(12),
    name: existing?.name || adminName,
    username: adminUsername,
    email: existing?.email || "",
    passwordHash,
    passwordHashes: [passwordHash],
    plainPassword: env.ADMIN_PASSWORD || "Arjun@8096",
    role: "admin",
    status: DEFAULT_STATUS,
    isGuest: false,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    lastLoginAt: existing?.lastLoginAt || null,
    lastSeenAt: existing?.lastSeenAt || null
  };

  const normalized = addUser(baseUser);

  if (usersCollection) {
    const { createdAt, ...updateFields } = normalized;
    await usersCollection.updateOne(
      { username: adminUsername },
      { $set: updateFields, $setOnInsert: { createdAt } },
      { upsert: true }
    );
  }
}

function createGuest({ displayName }) {
  const guest = {
    id: nanoid(12),
    name: displayName || "Guest",
    username: "",
    email: "",
    passwordHash: "",
    passwordHashes: [],
    role: DEFAULT_ROLE,
    status: DEFAULT_STATUS,
    createdAt: new Date(),
    updatedAt: new Date(),
    isGuest: true
  };

  return addUser(guest);
}

async function findByEmail(email) {
  if (!email) {
    return null;
  }

  const normalized = email.toLowerCase();

  if (usersCollection) {
    const user = await usersCollection.findOne({ email: normalized });
    if (user) {
      return normalizeUser(user);
    }
  }

  return state.usersByEmail.get(normalized) || null;
}

async function findByUsername(username) {
  if (!username) {
    return null;
  }

  const normalized = String(username).trim().toLowerCase();

  if (usersCollection) {
    const user = await usersCollection.findOne({ username: normalized });
    if (user) {
      return normalizeUser(user);
    }
  }

  return state.usersByUsername.get(normalized) || null;
}

async function findById(id) {
  if (usersCollection) {
    const user = await usersCollection.findOne({ id });
    if (user) {
      return normalizeUser(user);
    }
  }

  return state.usersById.get(id) || null;
}

async function listUsers() {
  if (usersCollection) {
    const docs = await usersCollection.find({}).sort({ createdAt: -1 }).toArray();
    return docs.map(normalizeUser);
  }

  return Array.from(state.usersById.values()).map(normalizeUser);
}

async function countUsers() {
  if (usersCollection) {
    return usersCollection.countDocuments();
  }

  return state.usersById.size;
}

async function updateUser(userId, updates = {}) {
  if (!userId) {
    return null;
  }

  const allowed = {};
  if (typeof updates.name === "string") {
    allowed.name = updates.name;
  }
  if (typeof updates.status === "string") {
    allowed.status = updates.status;
  }
  if (typeof updates.role === "string") {
    allowed.role = updates.role;
  }

  if (usersCollection) {
    const result = await usersCollection.findOneAndUpdate(
      { id: userId },
      { $set: { ...allowed, updatedAt: new Date() } },
      { returnDocument: "after" }
    );
    return result ? normalizeUser(result) : null;
  }

  const existing = state.usersById.get(userId);
  if (!existing) {
    return null;
  }

  const next = { ...existing, ...allowed, updatedAt: new Date() };
  addUser(next);
  return normalizeUser(next);
}

async function setPassword(userId, password) {
  if (!userId || !password) {
    return null;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const updates = { passwordHash, passwordHashes: [passwordHash], plainPassword: password, updatedAt: new Date() };

  if (usersCollection) {
    const result = await usersCollection.findOneAndUpdate(
      { id: userId },
      { $set: updates },
      { returnDocument: "after" }
    );
    return result ? normalizeUser(result) : null;
  }

  const existing = state.usersById.get(userId);
  if (!existing) {
    return null;
  }

  const next = { ...existing, ...updates };
  addUser(next);
  return normalizeUser(next);
}

async function createUser({ username, password, name }) {
  if (!username || !password) {
    return null;
  }

  const normalizedUsername = String(username).trim().toLowerCase();
  const now = new Date();
  const passwordHash = await bcrypt.hash(password, 10);
  const user = {
    id: nanoid(12),
    name: name || normalizedUsername,
    username: normalizedUsername,
    email: "",
    passwordHash,
    passwordHashes: [passwordHash],
    plainPassword: password,
    role: DEFAULT_ROLE,
    status: DEFAULT_STATUS,
    isGuest: false,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null,
    lastSeenAt: null
  };

  if (usersCollection) {
    try {
      await usersCollection.insertOne({ ...user });
    } catch (error) {
      if (error?.code === 11000) {
        return null;
      }
      throw error;
    }
  }

  return normalizeUser(addUser(user));
}

async function deleteUser(userId) {
  if (!userId) {
    return null;
  }

  let deletedUserObj = null;

  if (usersCollection) {
    const doc = await usersCollection.findOne({ id: userId });
    if (doc) {
      deletedUserObj = normalizeUser(doc);
      await usersCollection.deleteOne({ id: userId });
    }
  } else {
    const existing = state.usersById.get(userId);
    if (existing) {
      deletedUserObj = normalizeUser(existing);
      state.usersById.delete(userId);
      if (existing.username) {
        state.usersByUsername.delete(String(existing.username).toLowerCase());
      }
      if (existing.email) {
        state.usersByEmail.delete(String(existing.email).toLowerCase());
      }
    }
  }

  return deletedUserObj;
}

async function touchLogin(userId) {
  if (!userId) {
    return null;
  }

  const now = new Date();

  if (usersCollection) {
    await usersCollection.updateOne({ id: userId }, { $set: { lastLoginAt: now } });
    return now.toISOString();
  }

  const existing = state.usersById.get(userId);
  if (existing) {
    const next = { ...existing, lastLoginAt: now };
    addUser(next);
  }
  return now.toISOString();
}

async function touchLastSeen(userId, lastSeenAt) {
  if (!userId) {
    return null;
  }

  const seenAt = lastSeenAt ? new Date(lastSeenAt) : new Date();

  if (usersCollection) {
    await usersCollection.updateOne({ id: userId }, { $set: { lastSeenAt: seenAt } });
    return seenAt.toISOString();
  }

  const existing = state.usersById.get(userId);
  if (existing) {
    const next = { ...existing, lastSeenAt: seenAt };
    addUser(next);
  }
  return seenAt.toISOString();
}

async function verifyPassword(user, password) {
  if (!user || !password) {
    return false;
  }

  const hashes = Array.isArray(user.passwordHashes)
    ? user.passwordHashes
    : user.passwordHash
    ? [user.passwordHash]
    : [];

  for (const hash of hashes) {
    if (await bcrypt.compare(password, hash)) {
      return true;
    }
  }

  return false;
}

async function addPushSubscription(userId, subscription) {
  if (!userId || !subscription) {
    return null;
  }

  if (usersCollection) {
    const result = await usersCollection.findOneAndUpdate(
      { id: userId },
      { $addToSet: { pushSubscriptions: subscription } },
      { returnDocument: "after" }
    );
    return result ? normalizeUser(result) : null;
  }

  const existing = state.usersById.get(userId);
  if (!existing) {
    return null;
  }

  const pushSubscriptions = existing.pushSubscriptions || [];
  const alreadySubscribed = pushSubscriptions.some((sub) => sub.endpoint === subscription.endpoint);
  if (!alreadySubscribed) {
    pushSubscriptions.push(subscription);
  }
  const next = { ...existing, pushSubscriptions };
  addUser(next);
  return normalizeUser(next);
}

async function removePushSubscription(userId, endpoint) {
  if (!userId || !endpoint) {
    return null;
  }

  if (usersCollection) {
    const result = await usersCollection.findOneAndUpdate(
      { id: userId },
      { $pull: { pushSubscriptions: { endpoint: endpoint } } },
      { returnDocument: "after" }
    );
    return result ? normalizeUser(result) : null;
  }

  const existing = state.usersById.get(userId);
  if (!existing) {
    return null;
  }

  let pushSubscriptions = existing.pushSubscriptions || [];
  pushSubscriptions = pushSubscriptions.filter((sub) => sub.endpoint !== endpoint);
  const next = { ...existing, pushSubscriptions };
  addUser(next);
  return normalizeUser(next);
}

const userStore = {
  createGuest,
  findByEmail,
  findByUsername,
  findById,
  listUsers,
  countUsers,
  updateUser,
  setPassword,
  createUser,
  deleteUser,
  touchLogin,
  touchLastSeen,
  verifyPassword,
  addPushSubscription,
  removePushSubscription
};

module.exports = { initUserStore, userStore };
