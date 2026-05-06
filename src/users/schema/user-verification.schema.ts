import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { User } from './user.schema';

export const VERIFICATION_STATUSES = [
  'not_started',
  'front_uploaded',
  'front_confirmed',
  'back_uploaded',
  'back_confirmed',
  'pending_final_verification',
  'verified',
  'rejected',
  'manual_review',
] as const;

@Schema({ timestamps: true })
export class UserVerification extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: User.name, required: true, unique: true })
  userId: User;

  @Prop({ enum: VERIFICATION_STATUSES, default: 'not_started' })
  status: string;

  @Prop()
  identityNumber: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  frontData: Record<string, unknown>;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  backData: Record<string, unknown>;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  combinedData: Record<string, unknown>;

  @Prop()
  frontImageUrl: string;

  @Prop()
  backImageUrl: string;

  @Prop()
  frontRawText: string;

  @Prop()
  backRawText: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  frontOcrResponse: Record<string, unknown> | null;

  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  backOcrResponse: Record<string, unknown> | null;

  @Prop({ default: false })
  frontConfirmed: boolean;

  @Prop({ default: false })
  backConfirmed: boolean;

  @Prop({ default: false })
  finalConfirmed: boolean;

  @Prop({ default: false })
  requiresManualReview: boolean;

  @Prop({ type: [String], default: [] })
  reviewNotes: string[];

  @Prop({ type: Date, default: null })
  verifiedAt: Date | null;

  @Prop({ type: Date, default: null })
  verificationTimestamp: Date | null;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  machineExtracted: Record<string, unknown>;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  userConfirmed: Record<string, unknown>;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  finalVerifiedData: Record<string, unknown>;
}

export const UserVerificationSchema = SchemaFactory.createForClass(UserVerification);
