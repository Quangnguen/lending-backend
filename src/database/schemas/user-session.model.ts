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

  // ========== TRUSTED DEVICE FIELDS ==========
  @Prop({ type: Boolean, default: false })
  isTrusted: boolean; // Thiết bị đáng tin cậy - không cần OTP khi đăng nhập

  @Prop({ type: Date })
  trustedAt: Date; // Thời điểm được đánh dấu tin cậy

  @Prop({ type: String, maxlength: 500 })
  userAgent: string; // Lưu thông tin trình duyệt/app
}

export const UserSessionSchema = SchemaFactory.createForClass(UserSession);
export type UserSessionDocument = UserSession & mongoose.Document;

// Index for cleanup expired sessions
UserSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

UserSessionSchema.index({ userId: 1, deviceId: 1, isTrusted: 1 });
