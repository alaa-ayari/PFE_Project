import { Global, Module } from '@nestjs/common';
import { PaymentLedgerService } from './payment-ledger.service';

@Global()
@Module({
  providers: [PaymentLedgerService],
  exports: [PaymentLedgerService],
})
export class PaymentLedgerModule {}
