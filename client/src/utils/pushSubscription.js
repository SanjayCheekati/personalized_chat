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

  const registration = await registerServiceWorker();
  if (!registration) {
    throw new Error("Service worker registration failed.");
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

  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  if (!registration) {
    return false;
  }

  const subscription = await registration.pushManager.getSubscription();
  return !!subscription && Notification.permission === "granted";
}
