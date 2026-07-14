import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class Rental extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Contract', required: true })
  contractId: any;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Property', required: true })
  propertyId: any;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  ownerId: any;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  tenantId: any;

  @Prop({ type: Number, required: true })
  monthlyAmount: number;

  @Prop({ type: Date, required: true })
  startDate: Date;

  @Prop({ type: Date, required: true })
  nextDueDate: Date;

  @Prop({ type: String, default: 'active', enum: ['active', 'terminated'] })
  status: string;

  @Prop({
    type: [
      {
        paidAt: { type: Date },
        amount: { type: Number },
        paymentId: { type: String },
      },
    ],
    default: [],
  })
  paymentHistory: Array<{ paidAt: Date; amount: number; paymentId?: string }>;

  @Prop({ type: String, default: '' })
  propertyAddress: string;

  @Prop({ type: String, default: '' })
  ownerName: string;

  @Prop({ type: String, default: '' })
  tenantName: string;

  @Prop({ type: Number, default: 0 })
  electricityKwh: number;

  @Prop({ type: Number, default: 0 })
  waterCount: number;

  @Prop({ type: Date })
  utilitiesUpdatedAt?: Date;
}

export const RentalSchema = SchemaFactory.createForClass(Rental);
