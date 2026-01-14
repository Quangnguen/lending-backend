import * as mongoose from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { BaseModel } from '@core/schema/base.model';
import { DEVICE_TYPE_ENUM } from '@constant/p2p-lending.enum';

@Schema({
  timestamps: true,
  collection: 'user_sessions',
  collation: { locale: 'vi' },
})
export class UserSession extends BaseModel {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId: mongoose.Types.ObjectId;

  @Prop({ type: String, maxlength: 255 })
  deviceId: string;

  @Prop({ type: String, maxlength: 255 })
  deviceName: string;

  @Prop({
    type: String,
    enum: Object.values(DEVICE_TYPE_ENUM),
  })
  deviceType: DEVICE_TYPE_ENUM;

  @Prop({ type: String, maxlength: 45 })
  ipAddress: string;

  @Prop({ type: String })
  accessToken: string;

  @Prop({ type: String })
  refreshToken: string;

  @Prop({ type: Date })
  expiresAt: Date;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;
}

export const UserSessionSchema = SchemaFactory.createForClass(UserSession);
export type UserSessionDocument = UserSession & mongoose.Document;

// Index for cleanup expired sessions
UserSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
