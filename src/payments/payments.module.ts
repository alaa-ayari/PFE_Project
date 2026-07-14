import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Rental, RentalSchema } from '../rentals/schema/rental.schema';
import { Property, PropertySchema } from '../property/schema/property.schema';
import { User, UserSchema } from '../users/schema/user.schema';
import {
  Application,
  ApplicationSchema,
} from '../applications/schema/application.schema';
import {
  ProcessedStripeEvent,
  ProcessedStripeEventSchema,
} from './schema/processed-stripe-event.schema';
import { RentalsModule } from '../rentals/rentals.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StripeService } from './stripe.service';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Rental.name, schema: RentalSchema },
      { name: Property.name, schema: PropertySchema },
      { name: User.name, schema: UserSchema },
      { name: Application.name, schema: ApplicationSchema },
      {
        name: ProcessedStripeEvent.name,
        schema: ProcessedStripeEventSchema,
      },
    ]),
    RentalsModule,
    NotificationsModule,
  ],
  controllers: [PaymentsController],
  providers: [StripeService, PaymentsService],
})
export class PaymentsModule {}
