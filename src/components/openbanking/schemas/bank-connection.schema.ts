import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BankConnectionDocument = BankConnection & Document;

@Schema({ timestamps: true, collection: 'bank_connections' })
export class BankConnection {
  @Prop({ type: Types.ObjectId, required: true, ref: 'User' })
  userId: Types.ObjectId;

  @Prop({ required: true })
  bankCode: string; // VietQR bank code (VCB, TCB, MB, ...)

  @Prop({ required: true })
  bankName: string; // Tên ngắn ngân hàng

  @Prop()
  bankLogo: string; // URL logo từ VietQR CDN

  @Prop({ required: true })
  accountNumber: string; // Số tài khoản (encrypted)

  @Prop({ required: true })
  accountName: string; // Tên chủ tài khoản

  @Prop({ default: 0 })
  balance: number; // Số dư tại thời điểm liên kết (VND)

  @Prop({ default: 'VND' })
  currency: string;

  @Prop({ default: 'CURRENT' })
  accountType: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  lastSyncedAt: Date;
}

export const BankConnectionSchema =
  SchemaFactory.createForClass(BankConnection);
