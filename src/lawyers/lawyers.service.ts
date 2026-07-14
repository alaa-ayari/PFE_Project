// Lawyer directory and verification.

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../users/schema/user.schema';
import { UserRole } from '../users/schema/Role_enum';
import { UpdateLawyerProfileDto } from './dto/update-lawyer-profile.dto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class LawyersService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  findAll() {
    return this.userModel
      .find({ role: UserRole.LAWYER })
      .select('-password')
      .exec();
  }

  async findById(id: string) {
    const lawyer = await this.userModel.findById(id).exec();
    if (!lawyer) {
      throw new NotFoundException(`Lawyer with ID ${id} not found`);
    }
    if (lawyer.role !== UserRole.LAWYER) {
      throw new NotFoundException(`User with ID ${id} is not a lawyer`);
    }
    const { password, ...result } = lawyer.toObject();
    return result;
  }

  async updateProfile(
    id: string,
    dto: UpdateLawyerProfileDto,
    profileImagePath?: string,
  ) {
    const lawyer = await this.userModel.findById(id).exec();
    if (!lawyer) {
      throw new NotFoundException(`Lawyer with ID ${id} not found`);
    }
    if (lawyer.role !== UserRole.LAWYER) {
      throw new BadRequestException(`User with ID ${id} is not a lawyer`);
    }

    const updateFields: Record<string, any> = {};
    if (dto.name !== undefined)           updateFields.name           = dto.name;
    if (dto.lastName !== undefined)       updateFields.lastName       = dto.lastName;
    if (dto.email !== undefined)          updateFields.email          = dto.email;
    if (dto.phoneNumber !== undefined)    updateFields.phoneNumber    = dto.phoneNumber;
    if (dto.identitynumber !== undefined) updateFields.identitynumber = dto.identitynumber;
    if (dto.latitude !== undefined)       updateFields.latitude       = dto.latitude;
    if (dto.longitude !== undefined)      updateFields.longitude      = dto.longitude;
    if (profileImagePath)                 updateFields.profileImageUrl = profileImagePath;

    const updated = await this.userModel
      .findByIdAndUpdate(id, updateFields, { returnDocument: 'after' })
      .exec();

    const { password, ...result } = updated!.toObject();
    return result;
  }

  async verify(id: string, isVerified: boolean) {
    const lawyer = await this.userModel.findById(id).exec();
    if (!lawyer) {
      throw new NotFoundException(`Lawyer with ID ${id} not found`);
    }
    if (lawyer.role !== UserRole.LAWYER) {
      throw new BadRequestException(`User with ID ${id} is not a lawyer`);
    }

    const updated = await this.userModel
      .findByIdAndUpdate(id, { isVerified }, { returnDocument: 'after' })
      .exec();

    const { password, ...result } = updated!.toObject();
    return result;
  }

  async updateSignatureUrl(id: string, signatureUrl: string) {
    const lawyer = await this.userModel.findById(id).exec();
    if (!lawyer) {
      throw new NotFoundException(`Lawyer with ID ${id} not found`);
    }
    if (lawyer.role !== UserRole.LAWYER) {
      throw new BadRequestException(`User with ID ${id} is not a lawyer`);
    }
    const updated = await this.userModel
      .findByIdAndUpdate(id, { signatureUrl }, { returnDocument: 'after' })
      .exec();
    const { password, ...result } = updated!.toObject();
    return result;
  }

  async deleteSignature(id: string) {
    const lawyer = await this.userModel.findById(id).exec();
    if (!lawyer) {
      throw new NotFoundException(`Lawyer with ID ${id} not found`);
    }
    if (lawyer.role !== UserRole.LAWYER) {
      throw new BadRequestException(`User with ID ${id} is not a lawyer`);
    }
    if (lawyer.signatureUrl) {
      const filePath = path.join(process.cwd(), lawyer.signatureUrl);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    const updated = await this.userModel
      .findByIdAndUpdate(id, { signatureUrl: null }, { returnDocument: 'after' })
      .exec();
    const { password, ...result } = updated!.toObject();
    return result;
  }
}
