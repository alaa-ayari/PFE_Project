// Stripe checkout flows (rent, purchase, app fee) and webhook handler with idempotent event processing.

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { StripeService } from './stripe.service';
import { Rental } from '../rentals/schema/rental.schema';
import { User } from '../users/schema/user.schema';
import { Property } from '../property/schema/property.schema';
import { Application } from '../applications/schema/application.schema';
import { PropertyType, PropertyStatus } from '../property/schema/property_enum';
import { ProcessedStripeEvent } from './schema/processed-stripe-event.schema';
import { RentalsService } from '../rentals/rentals.service';
import { PaymentLedgerService } from '../payment-ledger/payment-ledger.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly stripe: StripeService,
    @InjectModel(Rental.name) private rentalModel: Model<Rental>,
    @InjectModel(Property.name) private propertyModel: Model<Property>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Application.name) private applicationModel: Model<Application>,
    @InjectModel(ProcessedStripeEvent.name)
    private processedEventModel: Model<ProcessedStripeEvent>,
    private readonly rentalsService: RentalsService,
    private readonly paymentLedger: PaymentLedgerService,
    private readonly notifications: NotificationsService,
  ) {}

  async createRentCheckout(rentalId: string, userId: string) {
    const rental = await this.rentalModel.findById(rentalId);
    if (!rental) throw new NotFoundException('Rental not found');
    if (rental.tenantId.toString() !== userId) {
      throw new ForbiddenException('Only the tenant can pay the rent');
    }
    const payer = await this.userModel.findById(userId).select('email').exec();
    return this.stripe.createCheckout({
      amount: rental.monthlyAmount,
      label: `Rent — ${rental.propertyAddress}`,
      customerEmail: payer?.email,
      metadata: {
        kind: 'rent',
        rentalId: String(rental._id),
        payerId: userId,
      },
    });
  }

  async createPurchaseCheckout(propertyId: string, userId: string) {
    const property = await this.propertyModel.findById(propertyId);
    if (!property) throw new NotFoundException('Property not found');

    if (property.PropertyType !== PropertyType.SALE) {
      throw new BadRequestException('This property is not for sale');
    }
    if (property.propertyStatus === PropertyStatus.SOLD) {
      throw new BadRequestException('This property is already sold');
    }
    if (property.owner.toString() === userId) {
      throw new ForbiddenException('You cannot purchase your own property');
    }
    const amount = property.price;
    if (!amount || amount <= 0) {
      throw new BadRequestException(
        'The owner has not published a sale price yet',
      );
    }

    const payer = await this.userModel.findById(userId).select('email').exec();
    return this.stripe.createCheckout({
      amount,
      label: `Purchase — ${property.Propertyaddresse}`,
      customerEmail: payer?.email,
      metadata: {
        kind: 'purchase',
        propertyId: String(property._id),
        sellerId: property.owner.toString(),
        payerId: userId,
      },
    });
  }

  async createAppFeeCheckout(userId: string) {
    const priceId = process.env.STRIPE_APP_FEE_PRICE_ID?.trim();
    if (!priceId) {
      throw new BadRequestException(
        'App-fee product not configured (STRIPE_APP_FEE_PRICE_ID missing).',
      );
    }
    const payer = await this.userModel.findById(userId).select('email').exec();
    return this.stripe.createCheckout({
      priceId,
      customerEmail: payer?.email,
      metadata: {
        kind: 'app_fee',
        payerId: userId,
        reference: 'Aqari app fee',
      },
    });
  }

  async cancelSubscription(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .select('stripeSubscriptionId subscriptionActive')
      .exec();
    if (!user) throw new NotFoundException('User not found');

    if (user.stripeSubscriptionId) {
      try {
        await this.stripe.cancelSubscription(user.stripeSubscriptionId);
      } catch (e) {
        this.logger.warn(
          `Stripe cancel failed for ${user.stripeSubscriptionId}: ${e}`,
        );

      }
    }

    await this.userModel.updateOne(
      { _id: userId },
      {
        $set: {
          subscriptionActive: false,
          subscriptionExpiresAt: null,
          stripeSubscriptionId: null,
        },
      },
    );
    return { cancelled: true };
  }

  async handleWebhook(rawBody: Buffer, signature: string) {
    const event = this.stripe.constructEvent(rawBody, signature);

    if (event.type !== 'checkout.session.completed') {
      return { received: true, ignored: event.type };
    }

    try {
      await this.processedEventModel.create({
        eventId: event.id,
        type: event.type,
      });
    } catch (e: any) {
      if (e?.code === 11000) {
        this.logger.log(`Duplicate Stripe event ${event.id} — skipping`);
        return { received: true, duplicate: true };
      }
      throw e;
    }

    const session = event.data.object as {
      id: string;
      payment_status: string;
      payment_intent?: string | null;
      subscription?: string | null;
      amount_total?: number | null;
      metadata?: Record<string, string> | null;
    };
    if (session.payment_status !== 'paid') {
      return { received: true, ignored: 'not paid' };
    }

    const md = session.metadata ?? {};
    const paymentId = session.payment_intent
      ? String(session.payment_intent)
      : session.id;
    const amount = (session.amount_total ?? 0) / 100;

    try {
      switch (md.kind) {
        case 'rent':

          await this.rentalsService.markPaid(
            md.rentalId,
            md.payerId,
            paymentId,
          );
          this.logger.log(`Rent paid via Stripe — rental ${md.rentalId}`);
          break;

        case 'purchase':

          await this.propertyModel.updateOne(
            { _id: md.propertyId },
            { $set: { propertyStatus: PropertyStatus.SOLD } },
          );
          await this.applicationModel.updateMany(
            {
              property: md.propertyId,
              status: { $nin: ['cancelled', 'rejected'] },
            },
            {
              $set: {
                status: 'rejected',
                rejectionReason: 'Property sold to another buyer',
              },
            },
          );
          await this.paymentLedger.recordPurchase({
            paymentId,
            amount: amount,
            payerId: md.payerId,
            payeeId: md.sellerId,
            propertyId: md.propertyId,
            reference: 'Property purchase',
          });
          if (md.sellerId) {
            this._notify(
              md.sellerId,
              'Property Sold',
              `Your property was purchased for ${amount} USD.`,
              { type: 'property_sold', propertyId: md.propertyId ?? '' },
            );
          }
          break;

        case 'app_fee':

          if (md.payerId) {
            const startedAt = new Date();
            const existing = await this.userModel
              .findById(md.payerId)
              .select('subscriptionExpiresAt')
              .exec();
            const base =
              existing?.subscriptionExpiresAt &&
              existing.subscriptionExpiresAt > startedAt
                ? new Date(existing.subscriptionExpiresAt)
                : new Date(startedAt);
            const expiresAt = new Date(base);
            expiresAt.setDate(expiresAt.getDate() + 30);
            await this.userModel.updateOne(
              { _id: md.payerId },
              {
                $set: {
                  subscriptionActive: true,
                  subscriptionStartedAt: startedAt,
                  subscriptionExpiresAt: expiresAt,

                  stripeSubscriptionId: session.subscription ?? null,
                },
              },
            );
            this._notify(
              md.payerId,
              'Subscription active',
              `Renewed until ${expiresAt.toDateString()}.`,
              { type: 'subscription_active' },
            );
          }
          await this.paymentLedger.recordAppFee({
            paymentId,
            amount: amount,
            payerId: md.payerId,
            reference: md.reference ?? 'app fee',
          });
          break;

        default:
          this.logger.warn(`Unknown checkout kind: ${md.kind}`);
      }
    } catch (e) {
      this.logger.error(`Webhook handling failed (${md.kind}): ${e}`);

      await this.processedEventModel
        .deleteOne({ eventId: event.id })
        .catch(() => {});

      throw e;
    }

    return { received: true };
  }

  private async _notify(
    userId: string,
    title: string,
    body: string,
    data: Record<string, string>,
  ) {
    try {
      const user = await this.userModel
        .findById(userId)
        .select('fcmToken')
        .exec();
      if (user?.fcmToken) {
        await this.notifications.sendToToken(user.fcmToken, title, body, data);
      }
    } catch {

    }
  }
}
