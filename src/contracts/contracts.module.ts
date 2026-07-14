import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MulterModule } from '@nestjs/platform-express';
import { Contract, ContractSchema } from './schema/contract.schema';
import { Application, ApplicationSchema } from '../applications/schema/application.schema';
import { User, UserSchema } from '../users/schema/user.schema';
import { Property, PropertySchema } from '../property/schema/property.schema';
import { ContractsService } from './contracts.service';
import { ContractsController } from './contracts.controller';
import { RentalsModule } from '../rentals/rentals.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ApplicationsModule } from '../applications/applications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Contract.name, schema: ContractSchema },
      { name: Application.name, schema: ApplicationSchema },
      { name: User.name, schema: UserSchema },
      { name: Property.name, schema: PropertySchema },
    ]),
    MulterModule.register({ dest: './uploads/contracts' }),
    RentalsModule,
    NotificationsModule,
    ApplicationsModule,
  ],
  controllers: [ContractsController],
  providers: [ContractsService],
})
export class ContractsModule {}
