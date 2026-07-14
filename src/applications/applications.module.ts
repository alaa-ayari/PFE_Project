import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { Application, ApplicationSchema } from './schema/application.schema';
import { ApplicationMessage, ApplicationMessageSchema } from './schema/application-message.schema';
import { Property, PropertySchema } from '../property/schema/property.schema';
import { User, UserSchema } from '../users/schema/user.schema';
import { ApplicationsService } from './applications.service';
import { ApplicationsController } from './applications.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { MessagingGateway } from './messaging.gateway';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: Application.name, schema: ApplicationSchema },
      { name: ApplicationMessage.name, schema: ApplicationMessageSchema },
      { name: Property.name, schema: PropertySchema },
      { name: User.name, schema: UserSchema },
    ]),
    NotificationsModule,
  ],
  controllers: [ApplicationsController],
  providers: [ApplicationsService, MessagingGateway],
  exports: [MessagingGateway],
})
export class ApplicationsModule {}
