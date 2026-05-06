import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { EmailService } from 'src/config/email.service';
import { User } from './schema/user.schema';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { InjectModel } from '@nestjs/mongoose';
import { UserRole } from './schema/Role_enum';
import * as fs from 'fs';
import * as path from 'path';

export interface CreateGoogleUserDto {
  name: string;
  lastName: string;
  email: string;
  googleId: string;
  profileImageUrl?: string;
  role: UserRole;
  authProvider: string;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    private readonly emailService: EmailService
  ) {}

  async create(createUserDto: CreateUserDto) {
    const exist = await this.userModel.findOne({ email: createUserDto.email }).exec();
    if (exist) {
      throw new ConflictException('Email already exists');
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    const createdUser = new this.userModel({
      ...createUserDto,
      password: hashedPassword,
    });

    const saved = await createdUser.save();

    try {
      await this.emailService.sendMail(
        saved.email,
        'Welcome to Our Platform',
        `<h2>Hello ${saved.name} ${saved.lastName},</h2><p>Welcome! Your account has been created successfully as <strong>${saved.role}</strong>.</p><p>Best regards,<br/>The Team</p>`
      );
    } catch (error) {
      console.error('Failed to send welcome email:', error);
    }

    const { password, ...result } = saved.toObject();
    return result;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userModel.findOne({ email }).exec();
  }

  findAll() {
    return this.userModel.find().select('-password').exec();
  }

  async findOne(id: string) {
    const user = await this.userModel.findById(id).exec();
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    const { password, ...result } = user.toObject();
    return result;
  }

  async updateProfile(
    id: string,
    dto: UpdateUserProfileDto,
  ) {
    const user = await this.userModel.findById(id).exec();
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    if (dto.email) {
      const existing = await this.userModel
        .findOne({ email: dto.email, _id: { $ne: id } })
        .exec();
      if (existing) {
        throw new ConflictException('Email already in use');
      }
    }

    const updateFields: Record<string, any> = {};
    if (dto.name !== undefined)           updateFields.name           = dto.name;
    if (dto.lastName !== undefined)       updateFields.lastName       = dto.lastName;
    if (dto.email !== undefined)          updateFields.email          = dto.email;
    if (dto.phoneNumber !== undefined)    updateFields.phoneNumber    = dto.phoneNumber;
    if (dto.identitynumber !== undefined) updateFields.identitynumber = dto.identitynumber;

    const updated = await this.userModel
      .findByIdAndUpdate(id, updateFields, { returnDocument: 'after' })
      .exec();

    const { password, ...result } = updated!.toObject();
    return result;
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    // Prevent password updates through this endpoint
    if (updateUserDto.password) {
      throw new BadRequestException('Password cannot be update. Use the password reset.');
    }

    if (updateUserDto.email) {
      const existing = await this.userModel
        .findOne({ email: updateUserDto.email, _id: { $ne: id } })
        .exec();
      if (existing) {
        throw new ConflictException('Email already in use');
      }
    }

    const updated = await this.userModel
      .findByIdAndUpdate(id, updateUserDto, { returnDocument: 'after' })
      .exec();

    if (!updated) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    const { password, ...result } = updated.toObject();
    return result;
  }

  async remove(id: string) {
    const deleted = await this.userModel.findByIdAndDelete(id).exec();
    if (!deleted) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return {
      message: 'User deleted !',
      id: deleted._id,
    };
  }
  async updatePassword(userId: string, hashedPassword: string) {
  const updated = await this.userModel.findByIdAndUpdate(
    userId,
    { password: hashedPassword },
    { returnDocument: 'after' }
  ).exec();

  if (!updated) {
    throw new NotFoundException(`User with ID ${userId} not found`);
  }

  return updated;
}

  /**
   * Update user's identity number with the scanned value from OCR
   * @param id - User ID
   * @param scanned - The scanned identity number from OCR
   * @returns Updated user object without password
   */
  async updateWithScanned(id: string, scanned: string) {
    const updated = await this.userModel
      .findByIdAndUpdate(
        id,
        { identitynumber: scanned },
        { returnDocument: 'after' }
      )
      .exec();

    if (!updated) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    const { password, ...result } = updated.toObject();
    return result;
  }

  /**
   * Create a new user with Google authentication
   */
  async createGoogleUser(googleUserData: CreateGoogleUserDto) {
    const exist = await this.userModel.findOne({ email: googleUserData.email }).exec();
    if (exist) {
      throw new ConflictException('Email already exists');
    }

    const createdUser = new this.userModel({
      name: googleUserData.name,
      lastName: googleUserData.lastName,
      email: googleUserData.email,
      googleId: googleUserData.googleId,
      profileImageUrl: googleUserData.profileImageUrl,
      role: googleUserData.role,
      authProvider: googleUserData.authProvider,
      // No password for Google-only users
    });

    const saved = await createdUser.save();
    const { password, ...result } = saved.toObject();
    return result;
  }

  /**
   * Link Google account to existing user
   */
  async linkGoogleAccount(
    userId: string,
    googleId: string,
    authProvider: string,
    profileImageUrl?: string,
  ) {
    const updateData: any = { googleId, authProvider };
    
    // Update profile image if user doesn't have one
    if (profileImageUrl) {
      const user = await this.userModel.findById(userId).exec();
      if (user && !user.profileImageUrl) {
        updateData.profileImageUrl = profileImageUrl;
      }
    }

    const updated = await this.userModel
      .findByIdAndUpdate(userId, updateData, { returnDocument: 'after' })
      .exec();

    if (!updated) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const { password, ...result } = updated.toObject();
    return result;
  }

  /**
   * Find user by Google ID
   */
  async findByGoogleId(googleId: string): Promise<User | null> {
    return this.userModel.findOne({ googleId }).exec();
  }

  /**
   * Update or add device info for a user
   * If device already exists (by deviceId), update lastLoginAt
   * Otherwise, add new device with firstLoginAt and lastLoginAt
   */
  async updateDeviceInfo(userId: string, deviceData: any) {
    const user = await this.userModel.findById(userId).exec();
    
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const now = new Date();
    
    // Check if device already exists
    if (user.devices && user.devices.length > 0) {
      const existingDeviceIndex = user.devices.findIndex(
        (device: any) => device.deviceId === deviceData.deviceId
      );

      if (existingDeviceIndex !== -1) {
        // Update existing device
        user.devices[existingDeviceIndex] = {
          ...user.devices[existingDeviceIndex],
          ...deviceData,
          firstLoginAt: user.devices[existingDeviceIndex].firstLoginAt,
          lastLoginAt: now,
        };
      } else {
        // Add new device
        user.devices.push({
          ...deviceData,
          firstLoginAt: now,
          lastLoginAt: now,
        });
      }
    } else {
      // Create devices array with first device
      user.devices = [{
        ...deviceData,
        firstLoginAt: now,
        lastLoginAt: now,
      }];
    }

    const updated = await user.save();
    const { password, ...result } = updated.toObject();
    return result;
  }

  /**
   * Get all devices for a user
   */
  async getDevices(userId: string) {
    const user = await this.userModel.findById(userId).exec();
    
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    return user.devices || [];
  }

  /**
   * Remove a device from user's device list
   */
  async removeDevice(userId: string, deviceId: string) {
    const updated = await this.userModel
      .findByIdAndUpdate(
        userId,
        { $pull: { devices: { deviceId } } },
        { returnDocument: 'after' }
      )
      .exec();

    if (!updated) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const { password, ...result } = updated.toObject();
    return result;
  }

  async updateSignatureUrl(id: string, signatureUrl: string) {
    const updated = await this.userModel
      .findByIdAndUpdate(id, { signatureUrl }, { returnDocument: 'after' })
      .exec();
    if (!updated) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    const { password, ...result } = updated.toObject();
    return result;
  }

  async updateFcmToken(userId: string, fcmToken: string | null) {
    await this.userModel.findByIdAndUpdate(userId, { fcmToken }).exec();
  }

  async getFcmToken(userId: string): Promise<string | null> {
    const user = await this.userModel.findById(userId).select('fcmToken').exec();
    return user?.fcmToken ?? null;
  }

  async getFavoriteIds(userId: string): Promise<string[]> {
    const user = await this.userModel.findById(userId).select('favorites').exec();
    if (!user) throw new NotFoundException(`User with ID ${userId} not found`);
    return (user.favorites || []).map((id) => id.toString());
  }

  async addFavorite(userId: string, propertyId: string): Promise<string[]> {
    const updated = await this.userModel.findByIdAndUpdate(
      userId,
      { $addToSet: { favorites: propertyId } },
      { returnDocument: 'after' },
    ).exec();
    if (!updated) throw new NotFoundException(`User with ID ${userId} not found`);
    return (updated.favorites || []).map((id) => id.toString());
  }

  async removeFavorite(userId: string, propertyId: string): Promise<string[]> {
    const updated = await this.userModel.findByIdAndUpdate(
      userId,
      { $pull: { favorites: propertyId } },
      { returnDocument: 'after' },
    ).exec();
    if (!updated) throw new NotFoundException(`User with ID ${userId} not found`);
    return (updated.favorites || []).map((id) => id.toString());
  }

  async deleteSignature(id: string) {
    const user = await this.userModel.findById(id).exec();
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    if (user.signatureUrl) {
      const filePath = path.join(process.cwd(), user.signatureUrl);
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
