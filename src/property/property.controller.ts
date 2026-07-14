// Property REST endpoints.

import { Controller, Get, Post, Body, Patch, Param, Delete, HttpCode, HttpStatus, UseInterceptors, UploadedFile, UploadedFiles, BadRequestException, UseGuards } from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { PropertyService } from './property.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { JwtAuthGuard } from '../config/guard/jwt-auth.guard';
import { GetUser } from '../config/decorator/get-user.decorator';

@Controller('property')
@UseGuards(JwtAuthGuard)
export class PropertyController {
  constructor(private readonly propertyService: PropertyService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FilesInterceptor('images', 10, {
      storage: diskStorage({
        destination: './uploads/properties/images',
        filename: (req, file, cb) => {
          const randomName = Array(32)
            .fill(null)
            .map(() => Math.round(Math.random() * 16).toString(16))
            .join('');
          cb(null, `${randomName}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
          return cb(new BadRequestException('Only image files are allowed!'), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  create(
    @Body() createPropertyDto: CreatePropertyDto,
    @GetUser('userId') userId: string,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    createPropertyDto.owner = userId;
    if (files && files.length > 0) {
      createPropertyDto.propertyimages = files.map(
        (f) => `/uploads/properties/images/${f.filename}`,
      );
    }
    return this.propertyService.create(createPropertyDto);
  }

  @Get()
  findAll() {
    return this.propertyService.findAll();
  }

  @Get('for-sale')
  findForSale() {
    return this.propertyService.findForSale();
  }

  @Get('for-rent')
  findForRent() {
    return this.propertyService.findForRent();
  }

  @Get('my-properties')
  getMyProperties(@GetUser('userId') userId: string) {
    return this.propertyService.findByOwner(userId);
  }

  @Get('owner/:ownerId')
  getPropertiesByOwner(@Param('ownerId') ownerId: string) {
    return this.propertyService.findByOwner(ownerId);
  }

  @Get(':id/ledger')
  getLedger(@Param('id') id: string) {
    return this.propertyService.getLedger(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.propertyService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @GetUser('userId') userId: string,
    @Body() updatePropertyDto: UpdatePropertyDto,
  ) {
    return this.propertyService.update(id, userId, updatePropertyDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string, @GetUser('userId') userId: string) {
    return this.propertyService.remove(id, userId);
  }

  @Post(':id/upload-image')
  @UseInterceptors(
    FilesInterceptor('images', 10, {
      storage: diskStorage({
        destination: './uploads/properties/images',
        filename: (req, file, cb) => {
          const randomName = Array(32)
            .fill(null)
            .map(() => Math.round(Math.random() * 16).toString(16))
            .join('');
          cb(null, `${randomName}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
          return cb(new BadRequestException('Only image files are allowed!'), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async uploadPropertyImage(
    @Param('id') id: string,
    @GetUser('userId') userId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Please upload at least one image file');
    }

    const imagePaths = files.map((f) => `/uploads/properties/images/${f.filename}`);
    const updatedProperty = await this.propertyService.addImages(id, userId, imagePaths);

    return {
      success: true,
      imagePaths,
      property: updatedProperty,
      message: 'Property images uploaded successfully',
    };
  }

  @Post(':id/upload-document')
  @UseInterceptors(
    FileInterceptor('document', {
      storage: diskStorage({
        destination: './uploads/properties/documents',
        filename: (req, file, cb) => {
          const randomName = Array(32)
            .fill(null)
            .map(() => Math.round(Math.random() * 16).toString(16))
            .join('');
          cb(null, `${randomName}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|webp|pdf)$/)) {
          return cb(new BadRequestException('Only image or PDF files are allowed!'), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadRegistrationDocument(
    @Param('id') id: string,
    @GetUser('userId') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Please upload a document file');
    }

    const documentPath = `/uploads/properties/documents/${file.filename}`;
    const updatedProperty = await this.propertyService.updateDocument(id, userId, documentPath);

    return {
      success: true,
      documentPath,
      property: updatedProperty,
      message: 'Registration document uploaded successfully',
    };
  }
}
