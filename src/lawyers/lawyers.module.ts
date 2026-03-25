import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/schema/user.schema';
import { LawyersService } from './lawyers.service';
import { LawyersController } from './lawyers.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  controllers: [LawyersController],
  providers: [LawyersService],
})
export class LawyersModule {}
