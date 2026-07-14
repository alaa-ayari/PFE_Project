// Contracts REST endpoints.

import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { randomBytes } from 'crypto';
import { ContractsService } from './contracts.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { JwtAuthGuard } from '../config/guard/jwt-auth.guard';
import { RolesGuard } from '../config/guard/role.guard';
import { Roles } from '../config/decorator/role.decorators';
import { UserRole } from '../users/schema/Role_enum';

@Controller('contracts')
@UseGuards(JwtAuthGuard)
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Get('lawyer')
  @UseGuards(RolesGuard)
  @Roles(UserRole.LAWYER)
  getLawyerContracts(@Req() req) {
    return this.contractsService.findByLawyer(req.user.userId);
  }

  @Get('my')
  getMyContracts(@Req() req) {
    return this.contractsService.findMyContracts(req.user.userId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.LAWYER)
  create(@Body() dto: CreateContractDto, @Req() req) {
    return this.contractsService.create(dto, req.user.userId);
  }

  @Get('application/:applicationId')
  getByApplication(@Param('applicationId') applicationId: string) {
    return this.contractsService.findByApplication(applicationId);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.contractsService.findById(id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.LAWYER)
  update(@Param('id') id: string, @Body() body: any, @Req() req) {
    return this.contractsService.update(id, req.user.userId, body);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles(UserRole.LAWYER)
  updateStatus(
    @Param('id') id: string,
    @Req() req,
    @Body('status') status: string,
  ) {
    return this.contractsService.updateStatus(id, req.user.userId, status);
  }

  @Post(':id/sign')
  signContract(
    @Param('id') id: string,
    @Req() req,
    @Body('signatureBase64') signatureBase64?: string,
  ) {
    return this.contractsService.sign(id, req.user.userId, signatureBase64);
  }

  @Post(':id/request-revision')
  requestRevision(
    @Param('id') id: string,
    @Req() req,
    @Body('reason') reason?: string,
  ) {
    return this.contractsService.requestRevision(id, req.user.userId, reason);
  }

  @Post(':id/upload-document')
  @UseGuards(RolesGuard)
  @Roles(UserRole.LAWYER)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/contracts',
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname);
          cb(null, `${randomBytes(16).toString('hex')}${ext}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
        cb(null, allowed.includes(extname(file.originalname).toLowerCase()));
      },
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadDocument(
    @Param('id') id: string,
    @Req() req,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.contractsService.uploadDocument(
      id,
      req.user.userId,
      `/uploads/contracts/${file.filename}`,
    );
  }
}
