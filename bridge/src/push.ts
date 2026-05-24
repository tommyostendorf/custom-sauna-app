/**
 * Web Push from the bridge. Auto-generates a VAPID keypair on first run (stored
 * locally), exposes the public key for the app to subscribe with, and sends
 * notifications (sauna ready, session reminder) to all saved subscriptions.
 */

import webpush from 'web-push';
import { getPush, setVapid, addSubscription, removeSubscription } from './store';

const SUBJECT = 'mailto:sauna@tommyostendorf.com';

/** Ensure a VAPID keypair exists and is loaded into web-push. Call once at startup. */
export function ensureVapid(): void {
  let { vapidPublic, vapidPrivate } = getPush();
  if (!vapidPublic || !vapidPrivate) {
    const keys = webpush.generateVAPIDKeys();
    vapidPublic = keys.publicKey;
    vapidPrivate = keys.privateKey;
    setVapid(vapidPublic, vapidPrivate);
    console.log('[push] generated new VAPID keypair');
  }
  webpush.setVapidDetails(SUBJECT, vapidPublic, vapidPrivate);
}

export const getVapidPublic = (): string | null => getPush().vapidPublic;

export function saveSubscription(sub: unknown): void {
  addSubscription(sub);
}

/** Send a notification to every subscribed device. Prunes dead subscriptions. */
export async function sendToAll(title: string, body: string): Promise<void> {
  const subs = getPush().subscriptions;
  if (subs.length === 0) return;
  const payload = JSON.stringify({ title, body });
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(sub as webpush.PushSubscription, payload);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // Subscription expired/invalid — remove it.
          const endpoint = (sub as { endpoint?: string }).endpoint;
          if (endpoint) removeSubscription(endpoint);
        } else {
          console.warn('[push] send failed:', (err as Error).message);
        }
      }
    }),
  );
}
