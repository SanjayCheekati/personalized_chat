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
    const client = new MongoClient(env.MONGO_URL, {
      // Keep up to 10 connections open and ready — avoids TCP handshake delay
      // on every query in a serverless or fresh-request scenario.
      maxPoolSize: 10,
      // Don't hang indefinitely if MongoDB is unreachable on startup.
      serverSelectionTimeoutMS: 5000,
      // Kill sockets that go silent mid-query (e.g. network blip on Render).
      socketTimeoutMS: 45000,
      // Timeout on initial connect attempt.
      connectTimeoutMS: 10000
    });
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
