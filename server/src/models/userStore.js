const bcrypt = require("bcryptjs");
const { nanoid } = require("nanoid");

const state = {
  usersByEmail: new Map(),
  usersById: new Map(),
  usersByUsername: new Map()
};

let usersCollection = null;

function addUser(user) {
  if (user.email) {
    state.usersByEmail.set(user.email, user);
  }
  if (user.username) {
    state.usersByUsername.set(user.username, user);
  }
  state.usersById.set(user.id, user);
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
    isGuest: Boolean(user.isGuest)
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

  if (!env.SEED_USERS) {
    return;
  }

  try {
    const seedUsers = JSON.parse(env.SEED_USERS);
    for (const seed of seedUsers) {
      const username = (seed.username || seed.email || "").toLowerCase();
      const email = (seed.email || "").toLowerCase();
      const passwordHash = seed.passwordHash
        ? seed.passwordHash
        : seed.password
        ? bcrypt.hashSync(seed.password, 10)
        : "";
      const passwords = Array.isArray(seed.passwords)
        ? seed.passwords
        : seed.password
        ? [seed.password]
        : [];
      const passwordHashes = seed.passwordHashes
        ? seed.passwordHashes
        : passwords.map((value) => bcrypt.hashSync(value, 10));

      const user = {
        id: seed.id || nanoid(12),
        name: seed.name || username || email || "User",
        username,
        email,
        passwordHash,
        passwordHashes,
        isGuest: false
      };

      addUser(user);

      if (usersCollection && email) {
        await usersCollection.updateOne(
          { email },
          { $setOnInsert: user },
          { upsert: true }
        );
      }
    }
  } catch {
    return;
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
    isGuest: true
  };

  addUser(guest);
  return guest;
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

  const normalized = username.toLowerCase();

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

const userStore = {
  createGuest,
  findByEmail,
  findByUsername,
  findById,
  verifyPassword
};

module.exports = { initUserStore, userStore };
