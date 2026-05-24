const http = require("http");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const dotenv = require("dotenv");

dotenv.config();

const env = require("./config/env");
const { connectMongo } = require("./db/mongo");
const { connectRedis, createCache } = require("./db/redis");
const { createRateLimiter } = require("./middleware/rateLimit");
const { authRouter } = require("./routes/auth");
const { chatRouter } = require("./routes/chat");
const { adminRouter } = require("./routes/admin");
const { initSocket } = require("./sockets");
const { initUserStore } = require("./models/userStore");
const { createMessageStore } = require("./models/messageStore");
const { createPresenceStore } = require("./models/presenceStore");
const { initConversationStore, conversationStore } = require("./models/conversationStore");
const { createResetRequestStore } = require("./models/resetRequestStore");

const app = express();
const server = http.createServer(app);

const allowedOrigins = env.CLIENT_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const corsOrigin = allowedOrigins.length > 1 ? allowedOrigins : allowedOrigins[0] || "*";

if (env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
  if (corsOrigin === "*" || (Array.isArray(corsOrigin) && corsOrigin.includes("*"))) {
    console.warn("CLIENT_ORIGIN is wildcard in production; set it to your frontend domain");
  }
}

app.disable("x-powered-by");
app.use(helmet());
app.use(compression());
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: "200kb" }));
app.use(createRateLimiter(env));

async function start() {
  const mongo = await connectMongo(env);
  if (mongo.connected) {
    console.log(`Mongo connected: ${mongo.dbName}`);
  } else if (env.MONGO_URL) {
    console.warn("Mongo unavailable, using in-memory storage");
  }

  const redis = await connectRedis(env);
  if (redis.connected) {
    console.log("Redis connected");
  } else if (env.REDIS_URL) {
    console.warn("Redis unavailable, using in-memory presence");
  }

  await initUserStore(env, mongo.db);
  await initConversationStore(mongo.db);

  const cache = createCache(redis.client, env.REDIS_PREFIX);
  const messageStore = createMessageStore({ db: mongo.db, cache });
  const presenceStore = createPresenceStore({
    redisClient: redis.client,
    prefix: env.REDIS_PREFIX
  });
  const resetRequestStore = createResetRequestStore({ db: mongo.db });

  app.get("/health", (req, res) => {
    res.json({ ok: true });
  });

  app.use(authRouter(env, conversationStore, resetRequestStore));
  app.use(chatRouter(env, messageStore, conversationStore));
  app.use(
    adminRouter(env, {
      conversationStore,
      userStore: require("./models/userStore").userStore,
      presenceStore,
      resetRequestStore,
      messageStore
    })
  );

  initSocket(server, {
    env,
    messageStore,
    conversationStore,
    presenceStore,
    userStore: require("./models/userStore").userStore,
    corsOrigin
  });

  const shutdown = async () => {
    if (redis.client) {
      await redis.client.disconnect();
    }
    if (mongo.client) {
      await mongo.client.close();
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  server.listen(env.PORT, () => {
    console.log(`FlashChat server listening on port ${env.PORT}`);
  });
}

start().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
