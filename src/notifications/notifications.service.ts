// Firebase Cloud Messaging push sender.

import { Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { retryAsync } from '../resilience/retry.util';
import { DeadLetterService } from '../resilience/dead-letter.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly initialized: boolean;

  constructor(private readonly deadLetter: DeadLetterService) {
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
    if (!this.initialized) {
      this.logger.warn(
        `Skipping push "${title}" — firebase-admin not initialised. ` +
          `Is FIREBASE_SERVICE_ACCOUNT set in .env?`,
      );
      return;
    }
    if (!fcmToken) {
      this.logger.warn(
        `Skipping push "${title}" — the recipient has no FCM token saved. ` +
          `They need to open the Flutter app at least once on a device with ` +
          `google-services.json so the token is registered.`,
      );
      return;
    }
    let attempts = 0;
    try {
      const msgId = await retryAsync(
        () =>
          admin.messaging().send({
            token: fcmToken,
            notification: { title, body },
            data: data ?? {},
            android: { priority: 'high' },
            apns: { payload: { aps: { sound: 'default' } } },
          }),
        { retries: 3, onAttemptFail: (a) => (attempts = a) },
      );
      this.logger.log(
        `Sent push "${title}" to ${fcmToken.slice(0, 10)}… (msg=${msgId})`,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to send notification to token ${fcmToken.slice(0, 10)}… after retries: ${err}`,
      );
      await this.deadLetter.record(
        'fcm',
        { fcmToken, title, body, data: data ?? {} },
        err,
        attempts,
      );
    }
  }
}
