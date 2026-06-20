const fs = require("fs");
const path = require("path");

if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
  try {
    const webpush = require("web-push");
    console.log("Generating fresh VAPID keys for Web Push...");
    const keys = webpush.generateVAPIDKeys();
    process.env.VAPID_PUBLIC_KEY = keys.publicKey;
    process.env.VAPID_PRIVATE_KEY = keys.privateKey;
    process.env.VAPID_EMAIL = process.env.VAPID_EMAIL || "mailto:admin@flashchat.com";

    const envPath = path.join(__dirname, "../../.env");
    if (fs.existsSync(envPath)) {
      let content = fs.readFileSync(envPath, "utf8");
      if (!content.includes("VAPID_PUBLIC_KEY")) {
        if (!content.endsWith("\n")) {
          content += "\n";
        }
        content += `VAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\nVAPID_EMAIL=mailto:admin@flashchat.com\n`;
        fs.writeFileSync(envPath, content, "utf8");
        console.log("Generated and persisted VAPID keys to server/.env");
      }
    }
  } catch (error) {
    console.warn("Could not auto-generate VAPID keys:", error.message);
  }
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

module.exports = env;
