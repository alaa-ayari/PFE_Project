import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { PropertyType, PropertyStatus } from './property_enum';

@Schema({ timestamps: true })
export class Property extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  owner: Types.ObjectId;

  @Prop({ required: true })
  Propertyaddresse: string;

  @Prop({ required: false })
  longitude: string;

  @Prop({ required: false })
  latitude: string;

  @Prop({ required: true, enum: PropertyType })
  PropertyType: PropertyType;

  @Prop({ required: true, enum: PropertyStatus, default: PropertyStatus.unavailable })
  propertyStatus: PropertyStatus;

  @Prop({ required: false })
  contractId: string;

  @Prop({ required: false, type: [String], default: [] })
  propertyimages: string[];

  @Prop({ required: false })
  description: string;

  @Prop({ required: false })
  Registrationdocument: string;
}

export const PropertySchema = SchemaFactory.createForClass(Property);