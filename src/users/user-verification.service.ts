import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  ConfirmBackVerificationDto,
  ConfirmFrontVerificationDto,
  FinalizeVerificationDto,
} from './dto/scan-id-card.dto';
import { OcrService } from './ocr.service';
import {
  UserVerification,
  VERIFICATION_STATUSES,
} from './schema/user-verification.schema';
import { User } from './schema/user.schema';

type VerificationSide = 'front' | 'back';

@Injectable()
export class UserVerificationService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(UserVerification.name)
    private readonly verificationModel: Model<UserVerification>,
    private readonly ocrService: OcrService,
  ) {}

  async scanIdCard(
    targetUserId: string,
    requesterUserId: string,
    side: VerificationSide,
    file: Express.Multer.File,
  ) {
    this.ensureSelfAccess(targetUserId, requesterUserId);
    this.validateUpload(file);

    const user = await this.getUserOrThrow(targetUserId);
    const verification = await this.getOrCreateVerification(targetUserId);

    const scanResult = await this.ocrService.extractStructuredIdCardData(
      file.buffer,
      side,
      {
        firstName: user.name,
        lastName: user.lastName,
      },
    );

    const imageUrl = await this.storeProcessedImage(
      targetUserId,
      side,
      scanResult.normalizedImageBuffer,
    );

    const existingNotes = verification.reviewNotes ?? [];
    const mergedNotes = this.mergeNotes(existingNotes, scanResult.confidenceHints);
    const status = side === 'front' ? 'front_uploaded' : 'back_uploaded';

    const update: Record<string, unknown> = {
      status,
      verificationTimestamp: new Date(),
      requiresManualReview:
        Boolean(verification.requiresManualReview) || scanResult.requiresManualReview,
      reviewNotes: mergedNotes,
      [side === 'front' ? 'frontImageUrl' : 'backImageUrl']: imageUrl,
      [side === 'front' ? 'frontRawText' : 'backRawText']: scanResult.rawText,
      [side === 'front' ? 'frontOcrResponse' : 'backOcrResponse']:
        scanResult.providerResponse,
      [side === 'front' ? 'frontConfirmed' : 'backConfirmed']: false,
      [side === 'front' ? 'frontData' : 'backData']: {
        ...scanResult.extractedFields,
        missingFields: scanResult.missingFields,
        confidenceHints: scanResult.confidenceHints,
      },
      [`machineExtracted.${side}`]: scanResult.extractedFields,
      [`userConfirmed.${side}`]: {},
    };

    if (side === 'front' && scanResult.extractedFields.identityNumber) {
      update.identityNumber = scanResult.extractedFields.identityNumber;
    }

    await this.verificationModel.findOneAndUpdate(
      { userId: targetUserId },
      { $set: update },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    return {
      side,
      rawText: scanResult.rawText,
      extractedFields: scanResult.extractedFields,
      missingFields: scanResult.missingFields,
      confidenceHints: scanResult.confidenceHints,
      requiresManualReview:
        Boolean(verification.requiresManualReview) || scanResult.requiresManualReview,
    };
  }

  async confirmFront(
    targetUserId: string,
    requesterUserId: string,
    dto: ConfirmFrontVerificationDto,
  ) {
    this.ensureSelfAccess(targetUserId, requesterUserId);
    const verification = await this.getVerificationOrThrow(targetUserId);

    if (!verification.frontImageUrl) {
      throw new BadRequestException('Front side must be uploaded before confirmation');
    }

    const mergedFront = {
      ...(verification.machineExtracted?.front as Record<string, unknown> ?? {}),
      ...dto,
    };
    const notes = this.validateFrontData(mergedFront, []);
    const status = verification.backConfirmed
      ? 'pending_final_verification'
      : 'front_confirmed';

    return this.verificationModel
      .findOneAndUpdate(
        { userId: targetUserId },
        {
          $set: {
            status,
            frontConfirmed: true,
            verificationTimestamp: new Date(),
            frontData: mergedFront,
            identityNumber:
              this.getStringField(mergedFront, 'identityNumber') ??
              verification.identityNumber,
            'userConfirmed.front': dto,
            requiresManualReview:
              Boolean(verification.requiresManualReview) || notes.length > 0,
            reviewNotes: this.mergeNotes(verification.reviewNotes, notes),
          },
        },
        { new: true },
      )
      .exec();
  }

  async confirmBack(
    targetUserId: string,
    requesterUserId: string,
    dto: ConfirmBackVerificationDto,
  ) {
    this.ensureSelfAccess(targetUserId, requesterUserId);
    const verification = await this.getVerificationOrThrow(targetUserId);

    if (!verification.backImageUrl) {
      throw new BadRequestException('Back side must be uploaded before confirmation');
    }

    const mergedBack = {
      ...(verification.machineExtracted?.back as Record<string, unknown> ?? {}),
      ...dto,
    };
    const notes = this.validateBackData(mergedBack, []);
    const status = verification.frontConfirmed
      ? 'pending_final_verification'
      : 'back_confirmed';

    return this.verificationModel
      .findOneAndUpdate(
        { userId: targetUserId },
        {
          $set: {
            status,
            backConfirmed: true,
            verificationTimestamp: new Date(),
            backData: mergedBack,
            'userConfirmed.back': dto,
            requiresManualReview:
              Boolean(verification.requiresManualReview) || notes.length > 0,
            reviewNotes: this.mergeNotes(verification.reviewNotes, notes),
          },
        },
        { new: true },
      )
      .exec();
  }

  async finalize(
    targetUserId: string,
    requesterUserId: string,
    dto: FinalizeVerificationDto,
  ) {
    this.ensureSelfAccess(targetUserId, requesterUserId);

    const user = await this.getUserOrThrow(targetUserId);
    const verification = await this.getVerificationOrThrow(targetUserId);

    if (!verification.frontImageUrl || !verification.backImageUrl) {
      throw new BadRequestException('Both front and back images are required');
    }
    if (!verification.frontConfirmed || !verification.backConfirmed) {
      throw new BadRequestException(
        'Both front and back data must be confirmed before finalization',
      );
    }

    const frontConfirmed =
      (verification.userConfirmed?.front as Record<string, unknown> | undefined) ?? {};
    const backConfirmed =
      (verification.userConfirmed?.back as Record<string, unknown> | undefined) ?? {};
    const combinedData = {
      ...frontConfirmed,
      ...backConfirmed,
      ...dto,
    };

    const notes = [
      ...this.validateFrontData(combinedData, []),
      ...this.validateBackData(combinedData, []),
    ];

    const identityNumber = this.getStringField(combinedData, 'identityNumber');
    if (!identityNumber || !/^\d{8}$/.test(identityNumber)) {
      notes.push('Identity number must be exactly 8 digits');
    }

    const extractedIdentity = this.getStringField(
      verification.machineExtracted?.front as Record<string, unknown> | undefined,
      'identityNumber',
    );
    if (identityNumber && extractedIdentity && identityNumber !== extractedIdentity) {
      notes.push('Final identity number differs from OCR-extracted front identity number');
    }

    const nameMismatch = this.nameDiffersFromProfile(user, combinedData);
    if (nameMismatch) {
      notes.push(nameMismatch);
    }

    const requiresManualReview =
      Boolean(verification.requiresManualReview) || notes.length > 0;
    const finalStatus = requiresManualReview ? 'manual_review' : 'verified';
    const finalVerifiedData = {
      identityNumber: identityNumber ?? verification.identityNumber ?? null,
      firstName: this.getStringField(combinedData, 'firstName') ?? user.name ?? null,
      lastName: this.getStringField(combinedData, 'lastName') ?? user.lastName ?? null,
      fullName:
        this.getStringField(combinedData, 'fullName') ??
        this.buildFullName(
          this.getStringField(combinedData, 'firstName') ?? user.name,
          this.getStringField(combinedData, 'lastName') ?? user.lastName,
        ),
      dateOfBirth: this.getStringField(combinedData, 'dateOfBirth') ?? null,
      placeOfBirth: this.getStringField(combinedData, 'placeOfBirth') ?? null,
      address: this.getStringField(combinedData, 'address') ?? null,
      issueDate: this.getStringField(combinedData, 'issueDate') ?? null,
      issuePlace: this.getStringField(combinedData, 'issuePlace') ?? null,
      lineage: this.getStringField(combinedData, 'lineage') ?? null,
      artifactReferences: {
        frontImageUrl: verification.frontImageUrl,
        backImageUrl: verification.backImageUrl,
      },
      verificationMetadata: {
        requiresManualReview,
        reviewNotes: this.mergeNotes(verification.reviewNotes, notes),
        finalizedAt: new Date(),
      },
    };

    const updatedVerification = await this.verificationModel
      .findOneAndUpdate(
        { userId: targetUserId },
        {
          $set: {
            status: finalStatus,
            finalConfirmed: true,
            requiresManualReview,
            reviewNotes: this.mergeNotes(verification.reviewNotes, notes),
            verificationTimestamp: new Date(),
            verifiedAt: finalStatus === 'verified' ? new Date() : null,
            combinedData,
            finalVerifiedData,
          },
        },
        { new: true },
      )
      .exec();

    await this.userModel.findByIdAndUpdate(targetUserId, {
      identitynumber: finalVerifiedData.identityNumber,
      name: finalVerifiedData.firstName,
      lastName: finalVerifiedData.lastName,
      fullName: finalVerifiedData.fullName,
      dateOfBirth: finalVerifiedData.dateOfBirth,
      placeOfBirth: finalVerifiedData.placeOfBirth,
      address: finalVerifiedData.address,
      issueDate: finalVerifiedData.issueDate,
      issuePlace: finalVerifiedData.issuePlace,
      lineage: finalVerifiedData.lineage,
      verificationStatus: finalStatus,
      isVerified: finalStatus === 'verified',
    });

    return updatedVerification;
  }

  async getVerification(targetUserId: string, requesterUserId: string) {
    this.ensureSelfAccess(targetUserId, requesterUserId);
    const verification = await this.getOrCreateVerification(targetUserId);
    return verification;
  }

  private validateUpload(file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Please upload an image file');
    }

    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('Only JPEG, PNG, and WEBP images are allowed');
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('ID card images must be smaller than 10MB');
    }
  }

  private ensureSelfAccess(targetUserId: string, requesterUserId: string) {
    if (targetUserId !== requesterUserId) {
      throw new ForbiddenException('You can only access your own verification record');
    }
  }

  private async getUserOrThrow(userId: string) {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
    return user;
  }

  private async getVerificationOrThrow(userId: string) {
    const verification = await this.verificationModel.findOne({ userId }).exec();
    if (!verification) {
      throw new NotFoundException('Verification record not found');
    }
    return verification;
  }

  private async getOrCreateVerification(userId: string) {
    const existing = await this.verificationModel.findOne({ userId }).exec();
    if (existing) {
      return existing;
    }

    const created = new this.verificationModel({
      userId,
      status: VERIFICATION_STATUSES[0],
      verificationTimestamp: new Date(),
    });
    return created.save();
  }

  private async storeProcessedImage(
    userId: string,
    side: VerificationSide,
    buffer: Buffer,
  ) {
    const directory = path.join(
      process.cwd(),
      'uploads',
      'users',
      'verifications',
      side,
    );
    await fs.mkdir(directory, { recursive: true });
    const filename = `${userId}-${Date.now()}-${Math.round(Math.random() * 1e9)}.png`;
    const absolutePath = path.join(directory, filename);
    await fs.writeFile(absolutePath, buffer);
    return `/uploads/users/verifications/${side}/${filename}`;
  }

  private mergeNotes(existing: string[] = [], incoming: string[] = []) {
    return Array.from(new Set([...existing, ...incoming].filter(Boolean)));
  }

  private validateFrontData(data: Record<string, unknown>, notes: string[]) {
    const nextNotes = [...notes];
    if (!this.getStringField(data, 'identityNumber')) {
      nextNotes.push('Front side is missing identity number');
    }
    if (!this.getStringField(data, 'firstName')) {
      nextNotes.push('Front side is missing first name');
    }
    if (!this.getStringField(data, 'lastName')) {
      nextNotes.push('Front side is missing last name');
    }
    if (!this.getStringField(data, 'dateOfBirth')) {
      nextNotes.push('Front side date of birth is uncertain');
    }
    return nextNotes;
  }

  private validateBackData(data: Record<string, unknown>, notes: string[]) {
    const nextNotes = [...notes];
    if (!this.getStringField(data, 'address')) {
      nextNotes.push('Back side address is missing');
    }
    if (!this.getStringField(data, 'issueDate')) {
      nextNotes.push('Back side issue date is uncertain');
    }
    return nextNotes;
  }

  private nameDiffersFromProfile(user: User, data: Record<string, unknown>) {
    const firstName = this.normalizeForCompare(this.getStringField(data, 'firstName'));
    const lastName = this.normalizeForCompare(this.getStringField(data, 'lastName'));
    const profileFirstName = this.normalizeForCompare(user.name);
    const profileLastName = this.normalizeForCompare(user.lastName);

    if (firstName && profileFirstName && firstName !== profileFirstName) {
      return 'Extracted first name differs from existing profile data';
    }
    if (lastName && profileLastName && lastName !== profileLastName) {
      return 'Extracted last name differs from existing profile data';
    }
    return null;
  }

  private getStringField(
    data: Record<string, unknown> | undefined,
    key: string,
  ) {
    const value = data?.[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private normalizeForCompare(value?: string | null) {
    return value
      ?.toLowerCase()
      .replace(/\s+/g, ' ')
      .trim() ?? '';
  }

  private buildFullName(firstName?: string | null, lastName?: string | null) {
    return [firstName, lastName].filter(Boolean).join(' ').trim() || null;
  }
}
