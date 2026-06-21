const fs = require("fs");
const path = require("path");

if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
  // Use static fallback keys to maintain consistency across container restarts (e.g. on Render)
  process.env.VAPID_PUBLIC_KEY = "BIPrq4PdFd3tDRTDqB6sadf7cdHG1zI-0zLVZiCqqnVWprV9RkXR98WdqoMJHzi0ipcSTZlKXN1tC-eSCG_N-1o";
  process.env.VAPID_PRIVATE_KEY = "P_39j7AZ5CEOphgV_Lgdj0B14hd3hOJTD8CaUCYM_LE";
  process.env.VAPID_EMAIL = process.env.VAPID_EMAIL || "mailto:akshayalukky@gmail.com";
  console.warn("WARNING: Using default fallback VAPID keys. For production, set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in environment variables.");
}

const cleanEnvVar = (val) => {
  if (!val) {
    return "";
  }
  return val.trim().replace(/^['"]|['"]$/g, "").trim();
};

const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number(process.env.PORT || 4000),
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || "http://localhost:3000",
  JWT_SECRET: process.env.JWT_SECRET || "dev_secret_change_me",
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || "arjun",
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "Arjun@8096",
  ADMIN_NAME: process.env.ADMIN_NAME || "Arjun",
  DEFAULT_ROOM_ID: process.env.DEFAULT_ROOM_ID || "flashchat-room",
  SEED_USERS: process.env.SEED_USERS || "",
  MONGO_URL: process.env.MONGO_URL || "",
  MONGO_DB_NAME: process.env.MONGO_DB_NAME || "",
  REDIS_URL: process.env.REDIS_URL || "",
  REDIS_PREFIX: process.env.REDIS_PREFIX || "flashchat",
  RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS || "",
  RATE_LIMIT_MAX: process.env.RATE_LIMIT_MAX || "",
  VAPID_PUBLIC_KEY: cleanEnvVar(process.env.VAPID_PUBLIC_KEY || ""),
  VAPID_PRIVATE_KEY: cleanEnvVar(process.env.VAPID_PRIVATE_KEY || ""),
  VAPID_EMAIL: cleanEnvVar(process.env.VAPID_EMAIL || "mailto:admin@flashchat.com")
};

console.log("Push VAPID configuration initialized:");
console.log("- Public Key length:", env.VAPID_PUBLIC_KEY ? env.VAPID_PUBLIC_KEY.length : 0);
console.log("- Private Key length:", env.VAPID_PRIVATE_KEY ? env.VAPID_PRIVATE_KEY.length : 0);
console.log("- Email:", env.VAPID_EMAIL);

module.exports = env;
