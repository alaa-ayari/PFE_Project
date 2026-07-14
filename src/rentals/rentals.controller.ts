// Rentals REST endpoints.

import { Body, Controller, Get, Patch, Param, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../config/guard/jwt-auth.guard';
import { RentalsService } from './rentals.service';

@Controller('rentals')
@UseGuards(JwtAuthGuard)
export class RentalsController {
  constructor(private readonly rentalsService: RentalsService) {}

  @Get('my')
  getMyRentals(@Req() req) {
    return this.rentalsService.getMyRentals(req.user.userId);
  }

  @Patch(':id/mark-paid')
  markPaid(@Param('id') id: string, @Req() req) {
    return this.rentalsService.markPaid(id, req.user.userId);
  }

  @Patch(':id/utilities')
  updateUtilities(
    @Param('id') id: string,
    @Req() req,
    @Body() body: { electricityKwh?: number; waterCount?: number },
  ) {
    return this.rentalsService.updateUtilities(id, req.user.userId, body);
  }
}
