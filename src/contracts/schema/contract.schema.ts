import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class Contract extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Application', required: true })
  applicationId: any;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  lawyerId: any;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Property', required: true })
  propertyId: any;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  tenantId: any;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  ownerId: any;

  @Prop({ type: String, default: 'rental', enum: ['rental', 'sale', 'rental_annex'] })
  type: string;

  @Prop({
    type: String,
    default: 'draft',
    enum: ['draft', 'pending_review', 'pending_signatures', 'signed_by_owner', 'signed_by_tenant', 'completed', 'cancelled'],
  })
  status: string;

  @Prop({ type: String, default: '' })
  content: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  fields: Record<string, string>;

  @Prop({ type: Number, default: 0 })
  dealAmount: number;

  @Prop({ type: Date })
  startDate?: Date;

  @Prop({ type: Date })
  endDate?: Date;

  @Prop({ type: String })
  documentUrl?: string;

  @Prop({ type: String })
  ownerSignatureUrl?: string;

  @Prop({ type: String })
  tenantSignatureUrl?: string;

  @Prop({ type: String })
  lawyerSignatureUrl?: string;

  @Prop({ type: String })
  hederaTopicId?: string;

  @Prop({ type: String })
  ownerSignatureTxId?: string;

  @Prop({ type: String })
  tenantSignatureTxId?: string;

  @Prop({ type: Number, default: 1 })
  version: number;

  @Prop({
    type: [
      {
        requestId: { type: String, required: true },
        requestedBy: { type: MongooseSchema.Types.ObjectId, ref: 'User', required: true },
        reason: { type: String },
        resolved: { type: Boolean, default: false },
        resolvedAt: { type: Date },
        hcsTxId: { type: String },
        hcsSequenceNumber: { type: Number },
        createdAt: { type: Date, default: () => new Date() },
      },
    ],
    default: [],
  })
  revisionRequests: any[];
}

export const ContractSchema = SchemaFactory.createForClass(Contract);
