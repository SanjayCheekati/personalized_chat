const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";

async function fetchJson(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error || "request_failed";
    throw new Error(message);
  }
  return data;
}

export function loginWithPassword(username, password) {
  return fetchJson("/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
}

export function fetchMessages(token, roomId) {
  const params = new URLSearchParams();
  if (roomId) {
    params.set("roomId", roomId);
  }
  return fetchJson(`/messages?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}
