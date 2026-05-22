const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const { nanoid } = require("nanoid");
const { connectMongo } = require("../src/db/mongo");

dotenv.config();

const env = require("../src/config/env");

async function seedUsers() {
  if (!env.SEED_USERS) {
    console.error("SEED_USERS is missing");
    process.exit(1);
  }

  const mongo = await connectMongo(env);
  if (!mongo.connected || !mongo.db) {
    console.error("MongoDB is not connected");
    process.exit(1);
  }

  let users;
  try {
    users = JSON.parse(env.SEED_USERS);
  } catch {
    console.error("SEED_USERS must be valid JSON");
    process.exit(1);
  }

  if (!Array.isArray(users)) {
    console.error("SEED_USERS must be a JSON array");
    process.exit(1);
  }

  const collection = mongo.db.collection("users");
  try {
    await collection.createIndex({ username: 1 }, { unique: true });
  } catch {
    console.warn("Mongo user index creation failed");
  }

  for (const seed of users) {
    const username = (seed.username || seed.email || "").toLowerCase();
    if (!username) {
      console.warn("Skipped user with no username", seed.id || seed.email || "unknown");
      continue;
    }

    const passwords = Array.isArray(seed.passwords)
      ? seed.passwords
      : seed.password
      ? [seed.password]
      : [];

    const passwordHashes = seed.passwordHashes
      ? seed.passwordHashes
      : await Promise.all(passwords.map((value) => bcrypt.hash(value, 10)));

    const user = {
      id: seed.id || nanoid(12),
      username,
      name: seed.name || username,
      email: (seed.email || "").toLowerCase(),
      passwordHash: passwordHashes[0] || "",
      passwordHashes,
      isGuest: false,
      updatedAt: new Date()
    };

    await collection.updateOne(
      { username },
      { $set: user, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );
  }

  await mongo.client.close();
  console.log("Seed completed");
}

seedUsers().catch((error) => {
  console.error("Seed failed", error);
  process.exit(1);
});
