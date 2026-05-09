// Firebase Cloud Messaging — send high-priority data messages to registered tokens.
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging }                  from 'firebase-admin/messaging';

function getApp() {
  if (getApps().length) return getApps()[0];

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON env var is not set');

  return initializeApp({ credential: cert(JSON.parse(raw)) });
}

/**
 * Send a high-priority FCM data message to one or more tokens.
 * Data-only payload wakes the device even in Doze mode.
 *
 * @param {string[]} tokens   FCM registration tokens
 * @param {string}   status   'warning' | 'danger'
 * @param {string}   deviceId originating device_id
 * @param {number}   ppm      gas concentration
 */
export async function sendFcmAlert(tokens, status, deviceId, ppm) {
  if (!tokens || tokens.length === 0) return;

  getApp();
  const messaging = getMessaging();

  const message = {
    tokens,
    data: {
      type:      'gas_alert',
      status,
      device_id: deviceId,
      ppm:       String(ppm),
      timestamp: new Date().toISOString(),
    },
    android: {
      priority: 'high',
    },
  };

  try {
    const response = await messaging.sendEachForMulticast(message);
    console.log(`[fcm] sent=${response.successCount} failed=${response.failureCount} device=${deviceId} status=${status}`);
  } catch (err) {
    console.error('[fcm] sendFcmAlert failed:', err.message);
  }
}
