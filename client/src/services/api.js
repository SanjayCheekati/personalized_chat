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

export function requestPasswordReset(username, message) {
  return fetchJson("/forgot-password", {
    method: "POST",
    body: JSON.stringify({ username, message })
  });
}

export function fetchConversation(token) {
  return fetchJson("/conversation", {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

export function fetchMessages(token, conversationId, options = {}) {
  const params = new URLSearchParams();
  const roomId = conversationId || options.roomId;
  if (roomId) {
    params.set("conversationId", roomId);
  }
  if (options.before) {
    params.set("before", options.before);
  }
  if (options.limit) {
    params.set("limit", String(options.limit));
  }
  return fetchJson(`/messages?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

export function fetchAdminConversations(token) {
  return fetchJson("/admin/conversations", {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

export function fetchAdminUsers(token) {
  return fetchJson("/admin/users", {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

export function updateAdminUser(token, userId, updates) {
  return fetchJson(`/admin/users/${userId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(updates)
  });
}

export function resetUserPassword(token, userId, password) {
  return fetchJson(`/admin/users/${userId}/reset-password`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ password })
  });
}

export function deleteUser(token, userId) {
  return fetchJson(`/admin/users/${userId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

export function fetchResetRequests(token) {
  return fetchJson("/admin/reset-requests", {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

export function updateResetRequest(token, requestId, updates) {
  return fetchJson(`/admin/reset-requests/${requestId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(updates)
  });
}

export function fetchAdminStats(token) {
  return fetchJson("/admin/stats", {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}
