import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Rental, RentalSchema } from './schema/rental.schema';
import { User, UserSchema } from '../users/schema/user.schema';
import { Contract, ContractSchema } from '../contracts/schema/contract.schema';
import {
  Application,
  ApplicationSchema,
} from '../applications/schema/application.schema';
import { RentalsService } from './rentals.service';
import { RentalsController } from './rentals.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Rental.name, schema: RentalSchema },
      { name: User.name, schema: UserSchema },
      { name: Contract.name, schema: ContractSchema },
      { name: Application.name, schema: ApplicationSchema },
    ]),
    NotificationsModule,
  ],
  controllers: [RentalsController],
  providers: [RentalsService],
  exports: [RentalsService],
})
export class RentalsModule {}
