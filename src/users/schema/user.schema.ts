import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { UserRole } from './Role_enum';

@Schema({ _id: false, timestamps: false })
class Device {
    @Prop({ required: true })
    deviceId: string;

    @Prop({ required: false })
    deviceModel: string;

    @Prop({ required: false })
    platform: string;

    @Prop({ required: false })
    deviceName: string;

    @Prop({ required: true, type: Date })
    firstLoginAt: Date;

    @Prop({ required: true, type: Date })
    lastLoginAt: Date;

    @Prop({ required: false })
    ipAddress: string;
}

const DeviceSchema = SchemaFactory.createForClass(Device);

@Schema({timestamps: true })
export class User extends Document  {
    @Prop({ required: true })
    name: string;
    @Prop({ required: true })
    lastName: string;
    @Prop({ required: false })
    identitynumber : string;
    @Prop({ required: true, unique: true, lowercase: true, trim: true })
    email: string;

    @Prop({ required: false, select: false })
    password: string
    @Prop({ required: true, enum: UserRole, default: UserRole.USER })
    role: UserRole;
    @Prop({ required: false })
    phoneNumber: string;
    @Prop()
    profileImageUrl: string;
    @Prop({ required: false })
    fullName: string;
    @Prop({ default: false })
    isVerified: boolean;
    @Prop({ required: false, type: Number })
    latitude: number;
    @Prop({ required: false, type: Number })
    longitude: number;
    @Prop({ required: false })
    dateOfBirth: string;
    @Prop({ required: false })
    placeOfBirth: string;
    @Prop({ required: false })
    address: string;
    @Prop({ required: false })
    issueDate: string;
    @Prop({ required: false })
    issuePlace: string;
    @Prop({ required: false })
    barcodeNumber: string;
    @Prop({ required: false })
    lineage: string;
    @Prop({ required: false, default: 'not_started' })
    verificationStatus: string;
    @Prop({ required: false })
    googleId: string;
    @Prop({ default: 'local' })
    authProvider: string;
    @Prop({ type: [DeviceSchema], default: [] })
    devices: Device[];
    @Prop({ required: false, default: null })
    signatureUrl: string;
    @Prop({ default: false })
    faceRegistered: boolean;
    @Prop({ type: [{ type: MongooseSchema.Types.ObjectId, ref: 'Property' }], default: [] })
    favorites: Types.ObjectId[];
    @Prop({ required: false, default: null })
    fcmToken: string;

    @Prop({ default: false })
    subscriptionActive: boolean;
    @Prop({ required: false, type: Date, default: null })
    subscriptionStartedAt: Date;
    @Prop({ required: false, type: Date, default: null })
    subscriptionExpiresAt: Date;

    @Prop({ required: false, default: null })
    stripeSubscriptionId: string;
}
export const UserSchema = SchemaFactory.createForClass(User);