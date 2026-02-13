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
    @Prop({ required: true, unique: true })
    email: string;
    @Prop({ required: false })
    password: string
    @Prop({ required: true, enum: UserRole, default: UserRole.USER })
    role: UserRole;
    @Prop({ required: false })
    phoneNumber: string;
    @Prop()
    profileImageUrl: string;
    @Prop({ required: false })
    googleId: string;
    @Prop({ default: 'local' })
    authProvider: string; // 'local', 'google', or 'both'
    @Prop({ type: [DeviceSchema], default: [] })
    devices: Device[];
}
export const UserSchema = SchemaFactory.createForClass(User);