const webpush = require("web-push");
const env = require("../config/env");
const { userStore } = require("../models/userStore");

let pushInitialized = false;

function initPush() {
  if (pushInitialized) {
    return;
  }
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      env.VAPID_EMAIL || "mailto:admin@flashchat.com",
      env.VAPID_PUBLIC_KEY,
      env.VAPID_PRIVATE_KEY
    );
    pushInitialized = true;
  }
}

async function sendPushNotification(receiverId, { title, body, roomId }) {
  initPush();
  if (!pushInitialized) {
    console.warn("Web-push not initialized: VAPID keys missing.");
    return;
  }

  const receiver = await userStore.findById(receiverId);
  if (!receiver || !Array.isArray(receiver.pushSubscriptions) || receiver.pushSubscriptions.length === 0) {
    return;
  }

  const payload = JSON.stringify({
    title,
    body,
    roomId,
    url: `/`
  });

  const promises = receiver.pushSubscriptions.map((sub) =>
    webpush.sendNotification(sub, payload).catch(async (error) => {
      console.error("Push notification delivery failed for endpoint:", sub.endpoint, error.statusCode || error);
      if (error.statusCode === 410 || error.statusCode === 404) {
        await userStore.removePushSubscription(receiverId, sub.endpoint);
      }
    })
  );

  await Promise.all(promises);
}

module.exports = { sendPushNotification };
