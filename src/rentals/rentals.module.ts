import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Rental, RentalSchema } from './schema/rental.schema';
import { User, UserSchema } from '../users/schema/user.schema';
import { RentalsService } from './rentals.service';
import { RentalsController } from './rentals.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Rental.name, schema: RentalSchema },
      { name: User.name, schema: UserSchema },
    ]),
    NotificationsModule,
  ],
  controllers: [RentalsController],
  providers: [RentalsService],
  exports: [RentalsService],
})
export class RentalsModule {}
