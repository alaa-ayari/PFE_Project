import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt/jwt';
import { EmailModule } from '../config/email.module';
import { MongooseModule } from '@nestjs/mongoose';
import { RefreshToken, RefreshTokenSchema } from './schemas/refresh-token.schema';
import { OtpCode, OtpCodeSchema } from './schemas/otp-code.schema';
import { GoogleAuthService } from './google-auth.service';
import { ConfigModule } from '@nestjs/config';
import { SmsModule } from '../sms/sms.module';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    EmailModule,
    ConfigModule,
    SmsModule,
    MongooseModule.forFeature([
      { name: RefreshToken.name, schema: RefreshTokenSchema },
      { name: OtpCode.name, schema: OtpCodeSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, GoogleAuthService],
  exports: [AuthService],
})
export class AuthModule {}
