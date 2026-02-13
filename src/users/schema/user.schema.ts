import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { UserRole } from './Role_enum';

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
}
export const UserSchema = SchemaFactory.createForClass(User);