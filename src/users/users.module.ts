import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { OcrService } from './ocr.service';
import { UsersController } from './users.controller';
import { EmailModule } from 'src/config/email.module';
import { User, UserSchema } from './schema/user.schema';
import { MongooseModule } from '@nestjs/mongoose';
import {
  UserVerification,
  UserVerificationSchema,
} from './schema/user-verification.schema';
import { UserVerificationService } from './user-verification.service';

@Module({
    imports: [EmailModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: UserVerification.name, schema: UserVerificationSchema },
    ])],
  controllers: [UsersController],
  providers: [UsersService, OcrService, UserVerificationService],
  exports: [UsersService],
})
export class UsersModule {}
