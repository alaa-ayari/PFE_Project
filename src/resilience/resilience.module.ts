import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DeadLetter, DeadLetterSchema } from './dead-letter.schema';
import { DeadLetterService } from './dead-letter.service';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DeadLetter.name, schema: DeadLetterSchema },
    ]),
  ],
  providers: [DeadLetterService],
  exports: [DeadLetterService],
})
export class ResilienceModule {}
