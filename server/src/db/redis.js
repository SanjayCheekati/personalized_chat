const { createClient } = require("redis");

async function connectRedis(env) {
  if (!env.REDIS_URL) {
    return { client: null, connected: false };
  }

  const client = createClient({ url: env.REDIS_URL });
  client.on("error", (error) => {
    console.warn("Redis connection error", error?.message || error);
  });

  try {
    await client.connect();
    return { client, connected: true };
  } catch (error) {
    console.warn("Redis connection failed", error?.message || error);
    return { client: null, connected: false };
  }
}

function createCache(redisClient, prefix) {
  if (!redisClient) {
    return null;
  }

  const safePrefix = prefix ? `${prefix}:` : "";

  return {
    buildKey(key) {
      return `${safePrefix}${key}`;
    },
    async getJSON(key) {
      const value = await redisClient.get(`${safePrefix}${key}`);
      if (!value) {
        return null;
      }
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    },
    async setJSON(key, value, ttlSeconds) {
      const payload = JSON.stringify(value);
      if (ttlSeconds) {
        await redisClient.setEx(`${safePrefix}${key}`, ttlSeconds, payload);
        return;
      }
      await redisClient.set(`${safePrefix}${key}`, payload);
    },
    async del(key) {
      await redisClient.del(`${safePrefix}${key}`);
    }
  };
}

module.exports = { connectRedis, createCache };
