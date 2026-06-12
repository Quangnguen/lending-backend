import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { NotificationTypeEnum } from './enums/notification-type.enum';

export type NotificationDocument = Notification & Document;

@Schema({ timestamps: true })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  message: string;

  @Prop({
    type: String,
    enum: Object.values(NotificationTypeEnum),
    default: NotificationTypeEnum.SYSTEM,
  })
  type: string;

  @Prop({ default: false, index: true })
  isRead: boolean;

  @Prop({ type: Types.ObjectId })
  referenceId?: Types.ObjectId;

  // Dữ liệu để mobile điều hướng đến màn hình chi tiết
  @Prop({ type: Object, default: {} })
  metadata?: {
    loanId?: string;
    transactionHash?: string;
    role?: 'borrower' | 'lender';
    screen?: string;
    [key: string]: any;
  };

  @Prop({ default: null })
  deletedAt?: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, isRead: 1 });
