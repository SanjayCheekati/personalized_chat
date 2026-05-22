import { io } from "socket.io-client";

const DEFAULT_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  "http://localhost:4000";

export function createSocket({ token, roomId }) {
  return io(DEFAULT_URL, {
    auth: { token, roomId },
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 300,
    reconnectionDelayMax: 2000,
    timeout: 8000,
    autoConnect: false
  });
}
