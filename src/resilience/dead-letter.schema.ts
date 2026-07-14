import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class DeadLetter extends Document {

  @Prop({ type: String, required: true, index: true })
  channel: string;

  @Prop({ type: Object, required: true })
  payload: Record<string, any>;

  @Prop({ type: String })
  error: string;

  @Prop({ type: Number, default: 0 })
  attempts: number;

  @Prop({ type: Boolean, default: false, index: true })
  replayed: boolean;
}

export const DeadLetterSchema = SchemaFactory.createForClass(DeadLetter);
