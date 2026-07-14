import { Global, Module } from '@nestjs/common';
import { PiiService } from './pii.service';
import { PiiController } from './pii.controller';

@Global()
@Module({
  controllers: [PiiController],
  providers: [PiiService],
  exports: [PiiService],
})
export class PiiModule {}
