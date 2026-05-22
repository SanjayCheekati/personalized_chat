# FlashChat

Ultra fast 1-to-1 web chat starter with Next.js, Express, and Socket.IO.

## What is included
- Real-time messaging with optimistic UI
- Typing and presence indicators
- Message status for sending, delivered, and seen
- REST endpoints for login and message history
- Optional MongoDB persistence and Redis-backed presence/cache

## Folder layout
client/
server/

## Environment
Server configuration lives in server/.env.example. Copy it to server/.env and set values.
Client configuration uses NEXT_PUBLIC_API_BASE and NEXT_PUBLIC_SOCKET_URL.

Server variables you will want to set in production:
- NODE_ENV
- JWT_SECRET
- CLIENT_ORIGIN
- MONGO_URL
- MONGO_DB_NAME
- REDIS_URL (optional)
- REDIS_PREFIX (optional)
- RATE_LIMIT_WINDOW_MS
- RATE_LIMIT_MAX

## Run locally
1. Copy server/.env.example to server/.env and set values.
2. In server, run npm install and then npm run dev.
3. In client, run npm install and then npm run dev.
4. Open the client in a browser on port 3000.

## Run in production mode
1. Set NODE_ENV=production in server/.env.
2. In server, run npm start.
3. In client, run npm run build then npm start.

## Seed users
Set SEED_USERS in server/.env and run:
1. npm run seed (from server)

Each user can have a single password or a list of valid passwords:
SEED_USERS=[{"username":"saba","passwords":["2005","2006"]},{"username":"arjun","passwords":["2004"]}]

## Deploy
### Vercel (client)
- Set the root directory to client
- Build command: npm run build
- Output directory: .next
- Env: NEXT_PUBLIC_API_BASE, NEXT_PUBLIC_SOCKET_URL

### Render (server)
- Use render.yaml
- Root directory: server
- Build command: npm install
- Start command: npm start
- Health check: /health
- Env: NODE_ENV, PORT, CLIENT_ORIGIN, JWT_SECRET, MONGO_URL, MONGO_DB_NAME, REDIS_URL, REDIS_PREFIX, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX

## Deployment checklist
Vercel env values:
- NEXT_PUBLIC_API_BASE=https://<render-service-domain>
- NEXT_PUBLIC_SOCKET_URL=https://<render-service-domain>

Render env values:
- NODE_ENV=production
- PORT=4000
- CLIENT_ORIGIN=https://<vercel-domain>
- JWT_SECRET=<long-random-secret>
- MONGO_URL=<your-mongodb-connection-string>
- MONGO_DB_NAME=flashchat
- REDIS_URL=<your-redis-url-or-empty>
- REDIS_PREFIX=flashchat
- RATE_LIMIT_WINDOW_MS=900000
- RATE_LIMIT_MAX=200

Notes:
- CLIENT_ORIGIN can be a comma-separated list of allowed origins.

## Notes
- If MONGO_URL is empty, the server falls back to in-memory storage.
- Update the JWT secret and seed users before deploying.
