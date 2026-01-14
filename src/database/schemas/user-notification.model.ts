import * as mongoose from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { BaseModel } from '@core/schema/base.model';
import { NOTIFICATION_TYPE_ENUM } from '@constant/p2p-lending.enum';

@Schema({
  timestamps: true,
  collection: 'user_notifications',
  collation: { locale: 'vi' },
})
export class UserNotification extends BaseModel {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId: mongoose.Types.ObjectId;

  @Prop({ type: String, maxlength: 255 })
  title: string;

  @Prop({ type: String })
  message: string;

  @Prop({
    type: String,
    enum: Object.values(NOTIFICATION_TYPE_ENUM),
  })
  type: NOTIFICATION_TYPE_ENUM;

  @Prop({ type: mongoose.Schema.Types.Mixed })
  data: Record<string, any>; // Additional data

  @Prop({ type: Boolean, default: false })
  isRead: boolean;
}

export const UserNotificationSchema =
  SchemaFactory.createForClass(UserNotification);
export type UserNotificationDocument = UserNotification & mongoose.Document;
