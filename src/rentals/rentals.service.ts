import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Rental } from './schema/rental.schema';
import { User } from '../users/schema/user.schema';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class RentalsService {
  private readonly logger = new Logger(RentalsService.name);

  constructor(
    @InjectModel(Rental.name) private rentalModel: Model<Rental>,
    @InjectModel(User.name) private userModel: Model<User>,
    private notificationsService: NotificationsService,
  ) {}

  async createFromContract(data: {
    contractId: string;
    propertyId: string;
    ownerId: string;
    tenantId: string;
    monthlyAmount: number;
    startDate: Date;
    propertyAddress: string;
    ownerName: string;
    tenantName: string;
  }): Promise<Rental> {
    // Idempotent: don't create duplicate rentals for the same contract
    const existing = await this.rentalModel.findOne({ contractId: data.contractId });
    if (existing) return existing;

    const nextDueDate = new Date(data.startDate);
    nextDueDate.setMonth(nextDueDate.getMonth() + 1);

    return this.rentalModel.create({ ...data, nextDueDate, status: 'active' });
  }

  async getMyRentals(userId: string): Promise<Rental[]> {
    return this.rentalModel
      .find({ $or: [{ ownerId: userId }, { tenantId: userId }], status: 'active' })
      .sort({ nextDueDate: 1 })
      .exec();
  }

  async markPaid(rentalId: string, userId: string): Promise<Rental> {
    const rental = await this.rentalModel.findOne({
      _id: rentalId,
      $or: [{ ownerId: userId }, { tenantId: userId }],
    });
    if (!rental) throw new NotFoundException('Rental not found');

    const nextDueDate = new Date(rental.nextDueDate);
    nextDueDate.setMonth(nextDueDate.getMonth() + 1);

    const updated = await this.rentalModel.findByIdAndUpdate(
      rentalId,
      {
        $push: { paymentHistory: { paidAt: new Date(), amount: rental.monthlyAmount } },
        $set: { nextDueDate },
      },
      { new: true },
    );

    // Notify the other party
    const isOwner = rental.ownerId.toString() === userId;
    const otherPartyId = isOwner ? rental.tenantId.toString() : rental.ownerId.toString();
    const otherUser = await this.userModel.findById(otherPartyId);
    if (otherUser?.fcmToken) {
      await this.notificationsService.sendToToken(
        otherUser.fcmToken,
        'Rent Payment Confirmed',
        `Payment of ${rental.monthlyAmount} TND confirmed for ${rental.propertyAddress}`,
        { rentalId, type: 'rent_paid' },
      );
    }

    return updated!;
  }

  // Runs every day at 08:00 — notify parties when rent is due within 3 days
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async checkDueDates(): Promise<void> {
    const now = new Date();
    const in3Days = new Date(now);
    in3Days.setDate(in3Days.getDate() + 3);

    const dueRentals = await this.rentalModel.find({
      status: 'active',
      nextDueDate: { $gte: now, $lte: in3Days },
    });

    for (const rental of dueRentals) {
      const daysUntilDue = Math.ceil(
        (rental.nextDueDate.getTime() - now.getTime()) / 86_400_000,
      );
      const dueLine =
        daysUntilDue === 0
          ? 'due today'
          : `due in ${daysUntilDue} day${daysUntilDue > 1 ? 's' : ''}`;
      const body = `Rent of ${rental.monthlyAmount} TND is ${dueLine} for ${rental.propertyAddress}`;

      const [owner, tenant] = await Promise.all([
        this.userModel.findById(rental.ownerId),
        this.userModel.findById(rental.tenantId),
      ]);

      const sends: Promise<void>[] = [];
      if (owner?.fcmToken)
        sends.push(
          this.notificationsService.sendToToken(owner.fcmToken, 'Rent Due', body, {
            rentalId: (rental as any)._id.toString(),
            type: 'rent_due',
          }),
        );
      if (tenant?.fcmToken)
        sends.push(
          this.notificationsService.sendToToken(tenant.fcmToken, 'Rent Due', body, {
            rentalId: (rental as any)._id.toString(),
            type: 'rent_due',
          }),
        );
      await Promise.all(sends);
    }

    this.logger.log(`checkDueDates: notified ${dueRentals.length} rental(s)`);
  }
}
