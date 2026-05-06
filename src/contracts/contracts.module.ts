import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MulterModule } from '@nestjs/platform-express';
import { Contract, ContractSchema } from './schema/contract.schema';
import { Application, ApplicationSchema } from '../applications/schema/application.schema';
import { User, UserSchema } from '../users/schema/user.schema';
import { ContractsService } from './contracts.service';
import { ContractsController } from './contracts.controller';
import { RentalsModule } from '../rentals/rentals.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Contract.name, schema: ContractSchema },
      { name: Application.name, schema: ApplicationSchema },
      { name: User.name, schema: UserSchema },
    ]),
    MulterModule.register({ dest: './uploads/contracts' }),
    RentalsModule,
    NotificationsModule,
  ],
  controllers: [ContractsController],
  providers: [ContractsService],
})
export class ContractsModule {}
