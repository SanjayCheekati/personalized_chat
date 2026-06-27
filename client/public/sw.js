const activeRoomsByClient = new Map();

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "ACTIVE_ROOM_CHANGED") {
    if (event.source && event.source.id) {
      activeRoomsByClient.set(event.source.id, event.data.roomId);
    }
  }
});

self.addEventListener("push", (event) => {
  if (!event.data) {
    return;
  }

  try {
    let data;
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: "New Message", body: event.data.text() };
    }

    const title = data.title || "New Message";
    const roomId = data.roomId;
    const options = {
      body: data.body || "",
      data: {
        roomId: roomId,
        url: data.url || "/"
      }
    };

    if (data.tag) {
      options.tag = data.tag;
    }

    const promise = clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      const hasActiveFocusedClientInRoom = windowClients.some((client) => {
        const isFocused = client.focused && client.visibilityState === "visible";
        if (!isFocused) return false;

        const clientActiveRoom = activeRoomsByClient.get(client.id);
        return clientActiveRoom === roomId || (!clientActiveRoom && roomId);
      });

      if (hasActiveFocusedClientInRoom) {
        console.log("Suppressing notification because user is active in this room.");
        return;
      }

      return self.registration.showNotification(title, options);
    });

    event.waitUntil(promise);
  } catch (err) {
    console.error("Error displaying push notification:", err);
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const relativeUrl = event.notification.data?.url || "/";
  const absoluteUrl = new URL(relativeUrl, self.location.origin).toString();
  const roomId = event.notification.data?.roomId;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if ("focus" in client) {
          if (roomId) {
            client.postMessage({
              type: "NAVIGATE_TO_ROOM",
              roomId: roomId
            });
          }
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(absoluteUrl);
      }
    })
  );
});
