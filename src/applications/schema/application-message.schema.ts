import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { Application } from './application.schema';
import { User } from '../../users/schema/user.schema';

@Schema({ timestamps: true })
export class ApplicationMessage extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Application', required: true })
  application: Application;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  sender: User;

  @Prop({ required: true })
  content: string;
}

export const ApplicationMessageSchema = SchemaFactory.createForClass(ApplicationMessage);
