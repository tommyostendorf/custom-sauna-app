/**
 * Web Push setup (browser side). Registers the service worker, requests
 * permission, subscribes with the bridge's VAPID key, and sends the subscription
 * to the bridge. On iOS this only works for a PWA added to the Home Screen.
 */

import { api } from "./api";

export type PushStatus = "granted" | "denied" | "default" | "unsupported";

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function notificationStatus(): PushStatus {
  if (!pushSupported()) return "unsupported";
  return Notification.permission as PushStatus;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/** True when running as an installed PWA (required for push on iOS). */
export function isInstalledApp(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

const isIOS = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent);

export async function enableNotifications(): Promise<{ ok: boolean; reason?: string }> {
  if (!pushSupported()) return { ok: false, reason: "This browser can't do push notifications." };

  // iOS only permits push inside the installed (Home Screen) app, not Safari.
  if (isIOS() && !isInstalledApp()) {
    return { ok: false, reason: "Open the app from your Home Screen icon (not Safari), then tap Enable." };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, reason: "Notifications weren't allowed." };

    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    const { publicKey } = await api.getVapidPublic();
    if (!publicKey) return { ok: false, reason: "Bridge has no push key — make sure it's updated and online." };

    const existing = await reg.pushManager.getSubscription();
    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
      }));

    await api.pushSubscribe(sub.toJSON());
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: "Setup failed: " + (e as Error).message };
  }
}
