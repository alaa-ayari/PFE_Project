import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { Property } from '../../property/schema/property.schema';
import { User } from '../../users/schema/user.schema';

export const APPLICATION_STATUSES = [
  'pending',
  'under_review',
  'visit_scheduled',
  'pre_approved',
  'accepted',
  'negotiation',
  'awaiting_lawyer',
  'contract_drafting',
  'rejected',
  'cancelled',
] as const;

@Schema({ timestamps: true })
export class Application extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Property', required: true })
  property: Property;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  applicant: User;

  @Prop({ enum: ['rent', 'buy'], required: true })
  type: string;

  @Prop({ enum: APPLICATION_STATUSES, default: 'pending' })
  status: string;

  @Prop()
  message: string;

  @Prop()
  note: string;

  @Prop()
  rejectionReason: string;

  @Prop({ type: Date })
  visitDate: Date;

  @Prop({ type: Number })
  dealAmount: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  lawyer: User;

  @Prop({
    type: [
      {
        fromStatus: String,
        toStatus: String,
        changedBy: { type: MongooseSchema.Types.ObjectId, ref: 'User' },
        note: String,
        createdAt: { type: Date, default: () => new Date() },
      },
    ],
    default: [],
  })
  statusHistory: {
    fromStatus: string;
    toStatus: string;
    changedBy: string;
    note?: string;
    createdAt: Date;
  }[];
}

export const ApplicationSchema = SchemaFactory.createForClass(Application);
