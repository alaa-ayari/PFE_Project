import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { Type } from './Type_enum';

@Schema({timestamps: true })
export class Cases extends Document  {
    @Prop({ required: true })
    Type: Type;
    @Prop({ required: true })
    description: string
    
    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
    landlord: Types.ObjectId;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
    tenant: Types.ObjectId;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Property' })
    property: Types.ObjectId;
}
export const Caseschema = SchemaFactory.createForClass(Cases);