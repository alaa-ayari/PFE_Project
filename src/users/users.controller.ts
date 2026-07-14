// User REST endpoints.

import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, UseInterceptors, UploadedFile, BadRequestException, ForbiddenException, Req } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import {
  ConfirmBackVerificationDto,
  ConfirmFrontVerificationDto,
  FinalizeVerificationDto,
  ScanIdCardDto,
} from './dto/scan-id-card.dto';
import { JwtAuthGuard } from '../config/guard/jwt-auth.guard';
import { UserVerificationService } from './user-verification.service';
import { FaceRecognitionService } from './face-recognition.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly userVerificationService: UserVerificationService,
    private readonly faceRecognitionService: FaceRecognitionService,
  ) {}

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll() {
    return this.usersService.findAll();
  }

  @Patch('fcm-token')
  @UseGuards(JwtAuthGuard)
  updateFcmToken(@Body('fcmToken') fcmToken: string, @Req() req) {
    return this.usersService.updateFcmToken(req.user.userId, fcmToken ?? null);
  }

  @Get('favorites')
  @UseGuards(JwtAuthGuard)
  getFavorites(@Req() req) {
    return this.usersService.getFavoriteIds(req.user.userId);
  }

  @Post('favorites/:propertyId')
  @UseGuards(JwtAuthGuard)
  addFavorite(@Param('propertyId') propertyId: string, @Req() req) {
    return this.usersService.addFavorite(req.user.userId, propertyId);
  }

  @Delete('favorites/:propertyId')
  @UseGuards(JwtAuthGuard)
  removeFavorite(@Param('propertyId') propertyId: string, @Req() req) {
    return this.usersService.removeFavorite(req.user.userId, propertyId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id/profile')
  @UseGuards(JwtAuthGuard)
  updateProfile(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: UpdateUserProfileDto,
  ) {
    if (req.user?.userId !== id) {
      throw new ForbiddenException('You can only update your own profile');
    }
    return this.usersService.updateProfile(id, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id') id: string,
    @Req() req: any,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    if (req.user?.userId !== id) {
      throw new ForbiddenException('You can only update your own account');
    }
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string, @Req() req: any) {
    if (req.user?.userId !== id) {
      throw new ForbiddenException('You can only delete your own account');
    }
    return this.usersService.remove(id);
  }

  @Post(':id/signature')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('signature', {
      storage: diskStorage({
        destination: './uploads/users/signatures',
        filename: (req, file, cb) => {
          const random = Array(32)
            .fill(null)
            .map(() => Math.round(Math.random() * 16).toString(16))
            .join('');
          cb(null, `${random}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/\/(png)$/)) {
          return cb(
            new BadRequestException('Only PNG files are allowed'),
            false,
          );
        }
        cb(null, true);
      },
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async uploadSignature(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Please upload a PNG signature file');
    }
    const signatureUrl = `/uploads/users/signatures/${file.filename}`;
    await this.usersService.updateSignatureUrl(id, signatureUrl);
    return { signatureUrl };
  }

  @Delete(':id/signature')
  @UseGuards(JwtAuthGuard)
  async deleteSignature(@Param('id') id: string) {
    await this.usersService.deleteSignature(id);
    return { message: 'Signature deleted successfully' };
  }

  @Post(':id/scan-id-card')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('image', {
    limits: { fileSize: 10 * 1024 * 1024 },
  }))
  async scanIdCard(
    @Param('id') id: string,
    @Body() dto: ScanIdCardDto,
    @UploadedFile() file: Express.Multer.File,
    @Req() req,
  ) {
    if (!file) {
      throw new BadRequestException('Please upload an image file');
    }

    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('Only JPEG, PNG, and WEBP images are allowed');
    }

    return this.userVerificationService.scanIdCard(
      id,
      req.user.userId,
      dto.side,
      file,
    );
  }

  @Patch(':id/verification/front-confirm')
  @UseGuards(JwtAuthGuard)
  confirmFront(
    @Param('id') id: string,
    @Req() req,
    @Body() dto: ConfirmFrontVerificationDto,
  ) {
    return this.userVerificationService.confirmFront(id, req.user.userId, dto);
  }

  @Patch(':id/verification/back-confirm')
  @UseGuards(JwtAuthGuard)
  confirmBack(
    @Param('id') id: string,
    @Req() req,
    @Body() dto: ConfirmBackVerificationDto,
  ) {
    return this.userVerificationService.confirmBack(id, req.user.userId, dto);
  }

  @Patch(':id/verification/finalize')
  @UseGuards(JwtAuthGuard)
  finalizeVerification(
    @Param('id') id: string,
    @Req() req,
    @Body() dto: FinalizeVerificationDto,
  ) {
    return this.userVerificationService.finalize(id, req.user.userId, dto);
  }

  @Get(':id/verification')
  @UseGuards(JwtAuthGuard)
  getVerification(@Param('id') id: string, @Req() req) {
    return this.userVerificationService.getVerification(id, req.user.userId);
  }

  @Post(':id/face/register')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  async registerFace(
    @Param('id') id: string,
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (req.user?.userId !== id) {
      throw new ForbiddenException('You can only register your own face');
    }
    return this.faceRecognitionService.registerFace(id, file);
  }

  @Post('face/recognize')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  recognizeFace(@UploadedFile() file: Express.Multer.File) {
    return this.faceRecognitionService.recognizeFace(file);
  }

  @Delete(':id/face')
  @UseGuards(JwtAuthGuard)
  unregisterFace(@Param('id') id: string, @Req() req: any) {
    if (req.user?.userId !== id) {
      throw new ForbiddenException('You can only remove your own face data');
    }
    return this.faceRecognitionService.unregisterFace(id);
  }
}
