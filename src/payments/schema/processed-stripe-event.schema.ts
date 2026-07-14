import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class ProcessedStripeEvent extends Document {
  @Prop({ type: String, required: true, unique: true, index: true })
  eventId: string;

  @Prop({ type: String })
  type: string;
}

export const ProcessedStripeEventSchema = SchemaFactory.createForClass(
  ProcessedStripeEvent,
);

ProcessedStripeEventSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 30 },
);
