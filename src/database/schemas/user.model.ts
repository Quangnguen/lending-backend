import * as bcrypt from 'bcrypt';
import * as mongoose from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import {
  USER_ROLE_ENUM,
  USER_LOCKED_ENUM,
  USER_GENDER_ENUM,
  SALT_ROUNDS_PASSWORD,
} from '@components/user/user.constant';
import { BaseModel } from '@core/schema/base.model';

@Schema({
  timestamps: true,
  collection: 'users',
  collation: { locale: 'vi' },
})
export class User extends BaseModel {
  @Prop({
    type: String,
    index: true,
    unique: true,
    required: true,
  })
  email: string;

  @Prop({
    type: String,
    required: true,
  })
  fullname: string;

  @Prop({
    type: String,
    default:
      'https://file.maplife.com/uploads/1743488711346-avatar-default.jpg',
  })
  avatar: string;

  @Prop({
    type: String,
    required: true,
  })
  password: string;

  @Prop({
    type: Number,
    enum: USER_ROLE_ENUM,
    default: USER_ROLE_ENUM.USER,
  })
  role: USER_ROLE_ENUM;

  @Prop({
    type: Number,
    enum: USER_LOCKED_ENUM,
    default: USER_LOCKED_ENUM.UNLOCKED,
  })
  isLocked: USER_LOCKED_ENUM;

  @Prop({
    type: Number,
    enum: USER_GENDER_ENUM,
    default: USER_GENDER_ENUM.FEMALE,
  })
  gender: USER_GENDER_ENUM;

  @Prop({
    type: String,
    required: false,
  })
  phone?: string;

  @Prop({
    type: Number,
    default: 0,
  })
  accountBalance: number;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
  })
  createdBy: string;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
  })
  deletedBy: string;

  @Prop({
    type: String,
    required: false,
  })
  bio: string;
}

export const UserSchema = SchemaFactory.createForClass(User);

export type UserDocument = User & mongoose.Document;

UserSchema.pre<User>('save', async function (next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, SALT_ROUNDS_PASSWORD);
  }
  next();
});
