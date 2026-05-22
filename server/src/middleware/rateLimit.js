const rateLimit = require("express-rate-limit");

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function createRateLimiter(env = {}) {
  const defaultMax = env.NODE_ENV === "production" ? 200 : 300;
  const windowMs = parseNumber(env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);
  const max = parseNumber(env.RATE_LIMIT_MAX, defaultMax);

  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false
  });
}

module.exports = { createRateLimiter };
