import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private twilioClient: any;
  private fromNumber: string;

  constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER || '';

    if (accountSid && authToken && !accountSid.startsWith('your_')) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const twilio = require('twilio');
      this.twilioClient = twilio(accountSid, authToken);
      this.logger.log('Twilio client initialized');
    } else {
      this.logger.warn('Twilio credentials not configured — SMS will be logged to console');
    }
  }

  async sendSms(to: string, body: string): Promise<void> {
    if (!this.twilioClient) {
      this.logger.log(`[DEV] SMS to ${to}: ${body}`);
      return;
    }

    await this.twilioClient.messages.create({
      body,
      from: this.fromNumber,
      to,
    });
  }
}
