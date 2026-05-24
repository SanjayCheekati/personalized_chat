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
  RATE_LIMIT_MAX: process.env.RATE_LIMIT_MAX || ""
};

module.exports = env;
