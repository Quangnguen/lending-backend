import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type DeviceTokenDocument = DeviceToken & Document;

export enum DevicePlatformEnum {
  ANDROID = 'ANDROID',
  IOS = 'IOS',
  WEB = 'WEB',
}

@Schema({ timestamps: true })
export class DeviceToken {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  token: string;

  @Prop({
    type: String,
    enum: Object.values(DevicePlatformEnum),
    default: DevicePlatformEnum.ANDROID,
  })
  platform: string;

  @Prop({ default: '' })
  deviceId: string;

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const DeviceTokenSchema = SchemaFactory.createForClass(DeviceToken);
DeviceTokenSchema.index({ userId: 1, token: 1 }, { unique: true });
