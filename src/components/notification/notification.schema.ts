import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type NotificationDocument = Notification & Document;

@Schema({ timestamps: true })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  message: string;

  @Prop({ type: String, enum: ['LOAN', 'SYSTEM', 'TRANSACTION'], default: 'SYSTEM' })
  type: string;

  @Prop({ default: false })
  isRead: boolean;

  @Prop({ type: Types.ObjectId })
  referenceId?: Types.ObjectId;

  @Prop({ default: null })
  deletedAt?: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

