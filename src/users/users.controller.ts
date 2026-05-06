import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, UseInterceptors, UploadedFile, BadRequestException, Req } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { UsersService } from './users.service';
import { OcrService } from './ocr.service';
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
import { RolesGuard } from '../config/guard/role.guard';
import { Roles } from '../config/decorator/role.decorators';
import { UserRole } from './schema/Role_enum';
import { UserVerificationService } from './user-verification.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly ocrService: OcrService,
    private readonly userVerificationService: UserVerificationService,
  ) {}

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  // PATCH /users/fcm-token — register FCM device token
  @Patch('fcm-token')
  @UseGuards(JwtAuthGuard)
  updateFcmToken(@Body('fcmToken') fcmToken: string, @Req() req) {
    return this.usersService.updateFcmToken(req.user.userId, fcmToken ?? null);
  }

  // GET /users/favorites — get current user's favorited property IDs
  @Get('favorites')
  @UseGuards(JwtAuthGuard)
  getFavorites(@Req() req) {
    return this.usersService.getFavoriteIds(req.user.userId);
  }

  // POST /users/favorites/:propertyId — add property to favorites
  @Post('favorites/:propertyId')
  @UseGuards(JwtAuthGuard)
  addFavorite(@Param('propertyId') propertyId: string, @Req() req) {
    return this.usersService.addFavorite(req.user.userId, propertyId);
  }

  // DELETE /users/favorites/:propertyId — remove property from favorites
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

  // PATCH /users/:id/profile — update name, lastName, email, phoneNumber
  @Patch(':id/profile')
  @UseGuards(JwtAuthGuard)
  updateProfile(
    @Param('id') id: string,
    @Body() dto: UpdateUserProfileDto,
  ) {
    return this.usersService.updateProfile(id, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LAWYER)
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }

  // POST /users/:id/signature — upload user signature
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

  // DELETE /users/:id/signature — delete user signature
  @Delete(':id/signature')
  @UseGuards(JwtAuthGuard)
  async deleteSignature(@Param('id') id: string) {
    await this.usersService.deleteSignature(id);
    return { message: 'Signature deleted successfully' };
  }

  /**
   * Scan ID card and extract identity number, then update user's identity number
   * @param id - User ID
   * @param file - The uploaded ID card image
   * @returns Object containing the extracted identity number and updated user
   */
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

    // Validate file type
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

  /**
   * Extract all text from ID card (for debugging)
   * @param file - The uploaded ID card image
   * @returns Object containing all extracted text
   */
  @Post('scan-id-card/debug')
  @UseInterceptors(FileInterceptor('image'))
  async scanIdCardDebug(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Please upload an image file');
    }

    const allText = await this.ocrService.extractAllText(file.buffer);
    
    return {
      success: true,
      extractedText: allText,
      message: 'Text extracted successfully',
    };
  }
}
