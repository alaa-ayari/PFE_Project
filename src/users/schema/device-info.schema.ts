import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class DeviceInfo extends Document {
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

export const DeviceInfoSchema = SchemaFactory.createForClass(DeviceInfo);
