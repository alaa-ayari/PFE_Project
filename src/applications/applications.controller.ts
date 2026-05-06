import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto, UpdateApplicationStatusDto, CreateMessageDto, SetAmountDto } from './dto/create-application.dto';
import { JwtAuthGuard } from '../config/guard/jwt-auth.guard';
import { RolesGuard } from '../config/guard/role.guard';
import { Roles } from '../config/decorator/role.decorators';
import { UserRole } from '../users/schema/Role_enum';

@Controller('applications')
@UseGuards(JwtAuthGuard)
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  create(@Req() req, @Body() dto: CreateApplicationDto) {
    return this.applicationsService.create(req.user.userId, dto);
  }

  @Get('my')
  findMy(@Req() req) {
    return this.applicationsService.findMyApplications(req.user.userId);
  }

  @Get('incoming')
  findIncoming(@Req() req) {
    return this.applicationsService.findIncomingApplications(req.user.userId);
  }

  @Get('my-cases')
  @UseGuards(RolesGuard)
  @Roles(UserRole.LAWYER)
  getMyCases(@Req() req) {
    return this.applicationsService.getLawyerCases(req.user.userId);
  }

  @Get('property/:propertyId')
  findByProperty(@Param('propertyId') propertyId: string, @Req() req) {
    return this.applicationsService.findByProperty(propertyId, req.user.userId);
  }

  @Get('property/:propertyId/mine')
  findMyForProperty(@Param('propertyId') propertyId: string, @Req() req) {
    return this.applicationsService.findMyApplicationForProperty(propertyId, req.user.userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req) {
    return this.applicationsService.findById(id, req.user.userId);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Req() req, @Body() dto: UpdateApplicationStatusDto) {
    return this.applicationsService.updateStatus(id, req.user.userId, dto);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string, @Req() req) {
    return this.applicationsService.cancel(id, req.user.userId);
  }

  @Patch(':id/set-amount')
  setDealAmount(@Param('id') id: string, @Body() dto: SetAmountDto, @Req() req) {
    return this.applicationsService.setDealAmount(id, dto.dealAmount, req.user.userId);
  }

  @Patch(':id/assign-lawyer')
  assignLawyer(@Param('id') id: string, @Body('lawyerId') lawyerId: string, @Req() req) {
    return this.applicationsService.assignLawyer(id, lawyerId, req.user.userId);
  }

  @Get(':id/messages')
  getMessages(@Param('id') id: string, @Req() req) {
    return this.applicationsService.getMessages(id, req.user.userId);
  }

  @Post(':id/messages')
  sendMessage(@Param('id') id: string, @Req() req, @Body() dto: CreateMessageDto) {
    return this.applicationsService.sendMessage(id, req.user.userId, dto);
  }
}
