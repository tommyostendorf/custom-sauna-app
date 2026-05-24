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

export interface SendResult {
  subscriptions: number;
  sent: number;
  errors: string[];
}

/** Send a notification to every subscribed device. Prunes dead subscriptions. */
export async function sendToAll(title: string, body: string): Promise<SendResult> {
  const subs = getPush().subscriptions;
  const result: SendResult = { subscriptions: subs.length, sent: 0, errors: [] };
  const payload = JSON.stringify({ title, body });
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(sub as webpush.PushSubscription, payload);
        result.sent += 1;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        const msg = `${status ?? '?'}: ${(err as Error).message}`;
        result.errors.push(msg);
        if (status === 404 || status === 410) {
          const endpoint = (sub as { endpoint?: string }).endpoint;
          if (endpoint) removeSubscription(endpoint);
        } else {
          console.warn('[push] send failed:', msg);
        }
      }
    }),
  );
  return result;
}
