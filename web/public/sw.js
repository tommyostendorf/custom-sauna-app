// Service worker for Web Push notifications.
self.addEventListener("push", (event) => {
  let data = { title: "Sauna", body: "" };
  try {
    if (event.data) data = event.data.json();
  } catch (e) {
    /* ignore */
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Sauna", {
      body: data.body || "",
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: "sauna",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/");
    }),
  );
});
