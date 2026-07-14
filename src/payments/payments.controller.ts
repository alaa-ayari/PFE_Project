// Payments REST endpoints. Webhook receives raw body for signature verification.

import {
  Controller,
  Delete,
  Headers,
  Param,
  Post,
  RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../config/guard/jwt-auth.guard';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('rent/:rentalId/checkout')
  rentCheckout(@Param('rentalId') rentalId: string, @Req() req: any) {
    return this.payments.createRentCheckout(rentalId, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('purchase/:propertyId/checkout')
  purchaseCheckout(@Param('propertyId') propertyId: string, @Req() req: any) {

    return this.payments.createPurchaseCheckout(propertyId, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('app/checkout')
  appFeeCheckout(@Req() req: any) {

    return this.payments.createAppFeeCheckout(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('subscription')
  cancelSubscription(@Req() req: any) {
    return this.payments.cancelSubscription(req.user.userId);
  }

  @Post('webhook')
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    return this.payments.handleWebhook(req.rawBody as Buffer, signature);
  }
}
