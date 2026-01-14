import * as mongoose from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { BaseModel } from '@core/schema/base.model';
import {
  BANK_TRANSACTION_TYPE_ENUM,
  TRANSACTION_STATUS_ENUM,
} from '@constant/p2p-lending.enum';

@Schema({
  timestamps: true,
  collection: 'bank_transactions',
  collation: { locale: 'vi' },
})
export class BankTransaction extends BaseModel {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BankAccount',
    required: true,
    index: true,
  })
  bankAccountId: mongoose.Types.ObjectId;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId: mongoose.Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(BANK_TRANSACTION_TYPE_ENUM),
    required: true,
  })
  transactionType: BANK_TRANSACTION_TYPE_ENUM;

  @Prop({
    type: mongoose.Schema.Types.Decimal128,
    required: true,
    get: (v: mongoose.Types.Decimal128) => parseFloat(v?.toString() || '0'),
  })
  amount: number;

  @Prop({ type: String, default: 'VND', maxlength: 3 })
  currency: string;

  @Prop({ type: String, maxlength: 50 })
  referenceNumber: string;

  @Prop({ type: String })
  description: string;

  @Prop({
    type: String,
    enum: Object.values(TRANSACTION_STATUS_ENUM),
    default: TRANSACTION_STATUS_ENUM.PENDING,
  })
  status: TRANSACTION_STATUS_ENUM;

  // Open Banking response
  @Prop({ type: String, maxlength: 100 })
  bankReference: string;

  @Prop({ type: String, maxlength: 10 })
  bankResponseCode: string;

  @Prop({ type: String })
  bankResponseMessage: string;

  @Prop({ type: Date })
  completedAt: Date;
}

export const BankTransactionSchema =
  SchemaFactory.createForClass(BankTransaction);
export type BankTransactionDocument = BankTransaction & mongoose.Document;

BankTransactionSchema.set('toJSON', { getters: true });
BankTransactionSchema.set('toObject', { getters: true });
