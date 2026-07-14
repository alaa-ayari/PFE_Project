import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { LawyersService } from './lawyers.service';
import { UpdateLawyerProfileDto } from './dto/update-lawyer-profile.dto';
import { JwtAuthGuard } from '../config/guard/jwt-auth.guard';

@Controller('lawyers')
export class LawyersController {
  constructor(private readonly lawyersService: LawyersService) {}

  // GET /lawyers — list all lawyers (public)
  @Get()
  findAll() {
    return this.lawyersService.findAll();
  }

  // GET /lawyers/:id — single lawyer details (public)
  @Get(':id')
  findById(@Param('id') id: string) {
    return this.lawyersService.findById(id);
  }

  // PATCH /lawyers/:id/profile — update picture, latitude, longitude (JWT required)
  @Patch(':id/profile')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('picture', {
      storage: diskStorage({
        destination: './uploads/lawyers/pictures',
        filename: (req, file, cb) => {
          const random = Array(32)
            .fill(null)
            .map(() => Math.round(Math.random() * 16).toString(16))
            .join('');
          cb(null, `${random}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
          return cb(
            new BadRequestException('Only jpg, jpeg, png, webp files are allowed'),
            false,
          );
        }
        cb(null, true);
      },
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    }),
  )
  updateProfile(
    @Param('id') id: string,
    @Body() dto: UpdateLawyerProfileDto,
    @UploadedFile() picture?: Express.Multer.File,
  ) {
    const picturePath = picture
      ? `/uploads/lawyers/pictures/${picture.filename}`
      : undefined;
    return this.lawyersService.updateProfile(id, dto, picturePath);
  }

  // POST /lawyers/:id/signature — upload lawyer signature
  @Post(':id/signature')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('signature', {
      storage: diskStorage({
        destination: './uploads/lawyers/signatures',
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
    const signatureUrl = `/uploads/lawyers/signatures/${file.filename}`;
    await this.lawyersService.updateSignatureUrl(id, signatureUrl);
    return { signatureUrl };
  }

  // DELETE /lawyers/:id/signature — delete lawyer signature
  @Delete(':id/signature')
  @UseGuards(JwtAuthGuard)
  async deleteSignature(@Param('id') id: string) {
    await this.lawyersService.deleteSignature(id);
    return { message: 'Signature deleted successfully' };
  }

  // PATCH /lawyers/:id/verify — set isVerified true/false (JWT required)
  @Patch(':id/verify')
  @UseGuards(JwtAuthGuard)
  verify(
    @Param('id') id: string,
    @Body('isVerified') isVerified: boolean,
  ) {
    return this.lawyersService.verify(id, isVerified);
  }
}
