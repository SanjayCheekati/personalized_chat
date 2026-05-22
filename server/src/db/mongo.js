const { MongoClient } = require("mongodb");

function parseDbName(uri) {
  if (!uri) {
    return "";
  }

  try {
    const url = new URL(uri);
    const name = url.pathname ? url.pathname.replace("/", "") : "";
    return name || "";
  } catch {
    return "";
  }
}

function resolveDbName(env) {
  return env.MONGO_DB_NAME || parseDbName(env.MONGO_URL) || "flashchat";
}

async function connectMongo(env) {
  if (!env.MONGO_URL) {
    return { client: null, db: null, dbName: "", connected: false };
  }

  try {
    const client = new MongoClient(env.MONGO_URL);
    await client.connect();
    const dbName = resolveDbName(env);
    const db = client.db(dbName);

    return { client, db, dbName, connected: true };
  } catch (error) {
    console.warn("Mongo connection failed", error?.message || error);
    return { client: null, db: null, dbName: "", connected: false };
  }
}

module.exports = { connectMongo };
