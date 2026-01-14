import * as mongoose from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { BaseModel } from '@core/schema/base.model';
import {
  WALLET_TRANSACTION_TYPE_ENUM,
  TRANSACTION_DIRECTION_ENUM,
  REFERENCE_TYPE_ENUM,
  TRANSACTION_STATUS_ENUM,
} from '@constant/p2p-lending.enum';

@Schema({
  timestamps: true,
  collection: 'wallet_transactions',
  collation: { locale: 'vi' },
})
export class WalletTransaction extends BaseModel {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId: mongoose.Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(WALLET_TRANSACTION_TYPE_ENUM),
    required: true,
  })
  type: WALLET_TRANSACTION_TYPE_ENUM;

  @Prop({
    type: String,
    enum: Object.values(TRANSACTION_DIRECTION_ENUM),
    required: true,
  })
  direction: TRANSACTION_DIRECTION_ENUM;

  @Prop({
    type: mongoose.Schema.Types.Decimal128,
    get: (v: mongoose.Types.Decimal128) => parseFloat(v?.toString() || '0'),
  })
  amount: number;

  @Prop({ type: String, default: 'USDT', maxlength: 10 })
  currency: string;

  @Prop({
    type: mongoose.Schema.Types.Decimal128,
    get: (v: mongoose.Types.Decimal128) => parseFloat(v?.toString() || '0'),
  })
  balanceBefore: number;

  @Prop({
    type: mongoose.Schema.Types.Decimal128,
    get: (v: mongoose.Types.Decimal128) => parseFloat(v?.toString() || '0'),
  })
  balanceAfter: number;

  // Reference
  @Prop({
    type: String,
    enum: Object.values(REFERENCE_TYPE_ENUM),
  })
  referenceType: REFERENCE_TYPE_ENUM;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  referenceId: mongoose.Types.ObjectId;

  @Prop({ type: String })
  description: string;

  @Prop({
    type: String,
    enum: Object.values(TRANSACTION_STATUS_ENUM),
    default: TRANSACTION_STATUS_ENUM.PENDING,
  })
  status: TRANSACTION_STATUS_ENUM;

  // Blockchain
  @Prop({ type: String, maxlength: 66 })
  txHash: string;
}

export const WalletTransactionSchema =
  SchemaFactory.createForClass(WalletTransaction);
export type WalletTransactionDocument = WalletTransaction & mongoose.Document;

WalletTransactionSchema.set('toJSON', { getters: true });
WalletTransactionSchema.set('toObject', { getters: true });
