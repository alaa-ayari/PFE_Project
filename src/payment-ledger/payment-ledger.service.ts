// Hedera payment-ledger microservice client.

import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { retryAsync } from '../resilience/retry.util';
import { DeadLetterService } from '../resilience/dead-letter.service';

@Injectable()
export class PaymentLedgerService {
  private readonly logger = new Logger(PaymentLedgerService.name);
  private readonly baseUrl =
    process.env.PAYMENT_LEDGER_URL || 'http://localhost:3005';

  private readonly internalToken = process.env.INTERNAL_API_TOKEN ?? '';

  constructor(private readonly deadLetter: DeadLetterService) {}

  private async post(payload: Record<string, any>): Promise<void> {
    let attempts = 0;
    try {
      const res = await retryAsync(
        async () =>
          axios.post(`${this.baseUrl}/payment`, payload, {
            timeout: 12000,
            headers: this.internalToken
              ? { 'X-Internal-Token': this.internalToken }
              : undefined,
          }),
        { retries: 3, onAttemptFail: (a) => (attempts = a) },
      );
      const data = res.data as { topicId?: string };
      this.logger.log(
        `Ledger recorded ${payload.type} (${payload.paymentId}) → topic ${data?.topicId}`,
      );
    } catch (e: any) {
      this.logger.warn(
        `Ledger write failed for ${payload.type} ${payload.paymentId} after retries: ` +
          (e?.response?.data?.error ?? e?.message ?? e),
      );
      await this.deadLetter.record('payment-ledger', payload, e, attempts);
    }
  }

  async recordRent(params: {
    topicId: string;
    paymentId: string;
    amount: number;
    currency?: string;
    payerId: string;
    payeeId: string;
    applicationId: string;
    contractId?: string;
    propertyId?: string;
    reference?: string;
  }): Promise<void> {
    if (!params.topicId) {
      this.logger.warn(
        `Skipping rent ledger write — no application topicId for ${params.paymentId}`,
      );
      return;
    }
    await this.post({ type: 'rent', currency: 'USD', ...params });
  }

  async recordPurchase(params: {
    paymentId: string;
    amount: number;
    currency?: string;
    payerId: string;
    payeeId?: string;
    propertyId: string;
    reference?: string;
  }): Promise<void> {
    await this.post({ type: 'purchase', currency: 'USD', ...params });
  }

  async recordAppFee(params: {
    paymentId: string;
    amount: number;
    currency?: string;
    payerId: string;
    reference?: string;
  }): Promise<void> {
    await this.post({ type: 'app_fee', currency: 'USD', ...params });
  }
}
