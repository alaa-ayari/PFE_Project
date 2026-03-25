import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { OcrService } from './ocr.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { JwtAuthGuard } from '../config/guard/jwt-auth.guard';
import { RolesGuard } from '../config/guard/role.guard';
import { Roles } from '../config/decorator/role.decorators';
import { UserRole } from './schema/Role_enum';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly ocrService: OcrService,
  ) {}

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  findAll() {
    return this.usersService.findAll();
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

  /**
   * Scan ID card and extract identity number, then update user's identity number
   * @param id - User ID
   * @param file - The uploaded ID card image
   * @returns Object containing the extracted identity number and updated user
   */
  @Post(':id/scan-id-card')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('image'))
  async scanIdCard(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File
  ) {
    if (!file) {
      throw new BadRequestException('Please upload an image file');
    }

    // Validate file type
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('Only JPEG, PNG, and WEBP images are allowed');
    }

    const scanned = await this.ocrService.extractIdentityNumber(file.buffer);
    
    // Update user's identity number with the scanned value
    const updatedUser = await this.usersService.updateWithScanned(id, scanned);
    
    return {
      success: true,
      identityNumber: scanned,
      user: updatedUser,
      message: 'Identity number extracted and user updated successfully',
    };
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
