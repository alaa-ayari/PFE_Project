import { Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';

/**
 * Wraps firebase-admin to send FCM push notifications.
 *
 * Setup required:
 *   1. Install: npm install firebase-admin
 *   2. Create a Firebase project at https://console.firebase.google.com
 *   3. Generate a service account key (Project settings → Service accounts → Generate new private key)
 *   4. Base64-encode the JSON:  base64 -i serviceAccountKey.json
 *   5. Set the result as FIREBASE_SERVICE_ACCOUNT in your .env
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly initialized: boolean;

  constructor() {
    const serviceAccountB64 = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccountB64) {
      this.logger.warn('FIREBASE_SERVICE_ACCOUNT not set — push notifications disabled');
      this.initialized = false;
      return;
    }
    try {
      if (!admin.apps.length) {
        const json = Buffer.from(serviceAccountB64, 'base64').toString('utf-8');
        const serviceAccount = JSON.parse(json);
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      }
      this.initialized = true;
    } catch (err) {
      this.logger.error('Failed to initialize Firebase Admin', err);
      this.initialized = false;
    }
  }

  async sendToToken(fcmToken: string, title: string, body: string, data?: Record<string, string>): Promise<void> {
    if (!this.initialized || !fcmToken) return;
    try {
      await admin.messaging().send({
        token: fcmToken,
        notification: { title, body },
        data: data ?? {},
        android: { priority: 'high' },
        apns: { payload: { aps: { sound: 'default' } } },
      });
    } catch (err) {
      this.logger.warn(`Failed to send notification to token ${fcmToken.slice(0, 10)}…: ${err}`);
    }
  }
}
