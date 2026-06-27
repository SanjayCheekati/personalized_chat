const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return null;
  }
  return navigator.serviceWorker.register("/sw.js");
}

export async function subscribeUser(token) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("Push notifications not supported in this browser.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission not granted.");
  }

  await registerServiceWorker();
  const registration = await navigator.serviceWorker.ready;
  if (!registration) {
    throw new Error("Service worker registration failed.");
  }

  // Clear existing subscription first to handle VAPID key transitions cleanly
  try {
    const existingSubscription = await registration.pushManager.getSubscription();
    if (existingSubscription) {
      await existingSubscription.unsubscribe();
    }
  } catch (error) {
    console.warn("Failed to clear existing subscription before subscribing:", error);
  }

  const keyResponse = await fetch(`${API_BASE}/push/vapid-key`);
  const { publicKey } = await keyResponse.json();
  if (!publicKey) {
    throw new Error("VAPID public key not found on server.");
  }

  const subscribeOptions = {
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey)
  };

  const subscription = await registration.pushManager.subscribe(subscribeOptions);

  const response = await fetch(`${API_BASE}/push/subscribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ subscription })
  });

  if (!response.ok) {
    throw new Error("Failed to store subscription on server.");
  }

  return subscription;
}

export async function unsubscribeUser(token) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return;
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    return;
  }

  await fetch(`${API_BASE}/push/unsubscribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ endpoint: subscription.endpoint })
  });

  await subscription.unsubscribe();
}

export async function checkSubscriptionState() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return false;
  }

  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) {
    return false;
  }

  const subscription = await registration.pushManager.getSubscription();
  return !!subscription && Notification.permission === "granted";
}

export async function syncSubscription(token) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return false;
  }

  const registration = await navigator.serviceWorker.ready;
  if (!registration) {
    return false;
  }

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    return false;
  }

  let publicKey;
  try {
    const keyResponse = await fetch(`${API_BASE}/push/vapid-key`);
    const data = await keyResponse.json();
    publicKey = data.publicKey;
  } catch (error) {
    console.error("Failed to fetch VAPID key for sync:", error);
    return false;
  }

  if (!publicKey) {
    return false;
  }

  let keysMatch = false;
  if (subscription.options && subscription.options.applicationServerKey) {
    const subKeyBase64 = arrayBufferToBase64(subscription.options.applicationServerKey);
    const cleanSubKey = subKeyBase64.replace(/=+$/, "");
    const cleanServerKey = publicKey.replace(/=+$/, "");
    keysMatch = cleanSubKey === cleanServerKey;
  }

  if (!keysMatch) {
    console.log("VAPID key mismatch or missing. Re-subscribing user...");
    try {
      await subscription.unsubscribe();
    } catch (error) {
      console.warn("Unsubscribe failed during sync mismatch:", error);
    }
    try {
      await subscribeUser(token);
      return true;
    } catch (error) {
      console.error("Re-subscription failed during sync:", error);
      return false;
    }
  }

  try {
    const response = await fetch(`${API_BASE}/push/subscribe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ subscription })
    });
    return response.ok;
  } catch (error) {
    console.error("Failed to send synced subscription to server:", error);
    return false;
  }
}

