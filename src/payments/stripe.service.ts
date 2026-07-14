// Stripe SDK wrapper.

import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly stripe: InstanceType<typeof Stripe> | null;
  private readonly webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? '';

  private readonly successUrl =
    process.env.STRIPE_SUCCESS_URL ?? 'http://localhost:5000/?aqari=payment-success';
  private readonly cancelUrl =
    process.env.STRIPE_CANCEL_URL ?? 'http://localhost:5000/?aqari=payment-cancel';

  constructor() {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      this.logger.warn('STRIPE_SECRET_KEY not set — Stripe payments disabled');
      this.stripe = null;
      return;
    }

    if (process.env.NODE_ENV === 'production') {
      const isLocal = (u: string) => /localhost|127\.0\.0\.1/i.test(u);
      if (isLocal(this.successUrl) || isLocal(this.cancelUrl)) {
        throw new Error(
          'STRIPE_SUCCESS_URL / STRIPE_CANCEL_URL must be set to a real host in production',
        );
      }
    }
    this.stripe = new Stripe(key);
    this.logger.log('Stripe initialised');
  }

  private appendQuery(url: string, key: string, value: string): string {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}${key}=${value}`;
  }

  get isEnabled(): boolean {
    return this.stripe !== null;
  }

  async createCheckout(params: {

    priceId?: string;
    amount?: number;
    label?: string;
    metadata: Record<string, string>;
    customerEmail?: string;
  }): Promise<{ url: string; sessionId: string }> {
    if (!this.stripe) throw new Error('Stripe not configured');

    let mode: 'payment' | 'subscription' = 'payment';
    let lineItem:
      | { quantity: number; price: string }
      | {
          quantity: number;
          price_data: {
            currency: string;
            unit_amount: number;
            product_data: { name: string };
          };
        };

    if (params.priceId) {
      const price = await this.stripe.prices.retrieve(params.priceId);
      if (price.recurring) mode = 'subscription';
      lineItem = { quantity: 1, price: params.priceId };
    } else {
      if (!params.amount || params.amount <= 0) {
        throw new Error('Invalid amount');
      }

      lineItem = {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(params.amount * 100),
          product_data: { name: params.label ?? 'Aqari payment' },
        },
      };
    }

    const session = await this.stripe.checkout.sessions.create({
      mode,
      line_items: [lineItem],
      metadata: params.metadata,
      customer_email: params.customerEmail,
      success_url: this.appendQuery(this.successUrl, 'session_id', '{CHECKOUT_SESSION_ID}'),
      cancel_url: this.cancelUrl,
    });

    return { url: session.url ?? '', sessionId: session.id };
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    if (!this.stripe) throw new Error('Stripe not configured');
    await this.stripe.subscriptions.cancel(subscriptionId);
  }

  constructEvent(
    payload: Buffer,
    signature: string,
  ): ReturnType<InstanceType<typeof Stripe>['webhooks']['constructEvent']> {
    if (!this.stripe) throw new Error('Stripe not configured');
    if (!this.webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET not set');
    }
    return this.stripe.webhooks.constructEvent(
      payload,
      signature,
      this.webhookSecret,
    );
  }
}
