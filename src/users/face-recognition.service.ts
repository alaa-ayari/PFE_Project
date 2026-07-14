// Backend proxy for the Python face-recognition microservice.

import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import FormData from 'form-data';
import { User } from './schema/user.schema';

@Injectable()
export class FaceRecognitionService {
  private readonly logger = new Logger(FaceRecognitionService.name);
  private readonly baseUrl =
    process.env.FACE_RECOGNITION_URL || 'http://localhost:8000';
  private readonly internalToken = process.env.INTERNAL_API_TOKEN ?? '';

  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  private headers() {
    return this.internalToken
      ? { 'X-Internal-Token': this.internalToken }
      : undefined;
  }

  async registerFace(userId: string, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Please upload an image file');
    }
    const user = await this.userModel.findById(userId).select('email').exec();
    if (!user) throw new NotFoundException('User not found');

    const form = new FormData();
    form.append('user_id', user.email);
    form.append('file', file.buffer, {
      filename: file.originalname || 'face.jpg',
      contentType: file.mimetype || 'image/jpeg',
    });

    try {
      const res = await axios.post<{ message?: string }>(
        `${this.baseUrl}/register/`,
        form,
        {
          headers: { ...form.getHeaders(), ...this.headers() },
          timeout: 60_000,
        },
      );
      await this.userModel.findByIdAndUpdate(userId, { faceRegistered: true });
      return {
        success: true,
        message: res.data?.message ?? 'Face registered',
      };
    } catch (err: any) {
      const detail = err?.response?.data?.detail ?? err?.message ?? 'unknown';
      this.logger.warn(`registerFace failed for ${userId}: ${detail}`);
      throw new InternalServerErrorException(`Face registration failed: ${detail}`);
    }
  }

  async recognizeFace(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Please upload an image file');
    }
    const form = new FormData();
    form.append('file', file.buffer, {
      filename: file.originalname || 'face.jpg',
      contentType: file.mimetype || 'image/jpeg',
    });

    try {
      const res = await axios.post<{
        recognized?: boolean;
        user_email?: string;
        user_id?: string;
        confidence_score?: number;
      }>(`${this.baseUrl}/recognize/`, form, {
        headers: { ...form.getHeaders(), ...this.headers() },
        timeout: 60_000,
      });
      const data = res.data ?? {};
      const matchedEmail: string | null = data.user_email ?? data.user_id ?? null;
      let matchedUserId: string | null = null;
      if (matchedEmail && data.recognized) {
        const u = await this.userModel
          .findOne({ email: matchedEmail.toLowerCase().trim() })
          .select('_id')
          .exec();
        matchedUserId = u?._id?.toString() ?? null;
      }
      return {
        recognized: !!data.recognized,
        userId: matchedUserId,
        confidence: typeof data.confidence_score === 'number' ? data.confidence_score : null,
      };
    } catch (err: any) {
      const detail = err?.response?.data?.detail ?? err?.message ?? 'unknown';
      this.logger.warn(`recognizeFace failed: ${detail}`);
      throw new InternalServerErrorException(`Face recognition failed: ${detail}`);
    }
  }

  async unregisterFace(userId: string) {
    const user = await this.userModel.findById(userId).select('email').exec();
    if (!user) throw new NotFoundException('User not found');
    try {
      await axios.delete(
        `${this.baseUrl}/users/${encodeURIComponent(user.email)}`,
        { headers: this.headers(), timeout: 20_000 },
      );
    } catch (err: any) {

      const status = err?.response?.status;
      if (status !== 404) {
        const detail = err?.response?.data?.detail ?? err?.message ?? 'unknown';
        this.logger.warn(`unregisterFace failed for ${userId}: ${detail}`);
      }
    }
    await this.userModel.findByIdAndUpdate(userId, { faceRegistered: false });
    return { success: true };
  }
}
