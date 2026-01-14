import * as mongoose from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { BaseModel } from '@core/schema/base.model';
import {
  COLLATERAL_TYPE_ENUM,
  COLLATERAL_STATUS_ENUM,
} from '@constant/p2p-lending.enum';

@Schema({
  timestamps: true,
  collection: 'collaterals',
  collation: { locale: 'vi' },
})
export class Collateral extends BaseModel {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Loan',
    unique: true,
  })
  loanId: mongoose.Types.ObjectId;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  ownerId: mongoose.Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(COLLATERAL_TYPE_ENUM),
    required: true,
  })
  collateralType: COLLATERAL_TYPE_ENUM;

  // Crypto collateral
  @Prop({ type: String, maxlength: 42 })
  tokenAddress: string;

  @Prop({ type: String, maxlength: 10 })
  tokenSymbol: string;

  @Prop({
    type: mongoose.Schema.Types.Decimal128,
    get: (v: mongoose.Types.Decimal128) => parseFloat(v?.toString() || '0'),
  })
  tokenAmount: number;

  // Value
  @Prop({
    type: mongoose.Schema.Types.Decimal128,
    get: (v: mongoose.Types.Decimal128) => parseFloat(v?.toString() || '0'),
  })
  valueUsd: number;

  @Prop({ type: Date })
  lastPriceUpdate: Date;

  // Ratio
  @Prop({
    type: mongoose.Schema.Types.Decimal128,
    get: (v: mongoose.Types.Decimal128) => parseFloat(v?.toString() || '0'),
  })
  collateralRatio: number; // 150 = 150%

  @Prop({
    type: mongoose.Schema.Types.Decimal128,
    default: 120,
    get: (v: mongoose.Types.Decimal128) => parseFloat(v?.toString() || '0'),
  })
  liquidationThreshold: number;

  @Prop({
    type: String,
    enum: Object.values(COLLATERAL_STATUS_ENUM),
    default: COLLATERAL_STATUS_ENUM.LOCKED,
  })
  status: COLLATERAL_STATUS_ENUM;

  // Blockchain
  @Prop({ type: String, maxlength: 66 })
  depositTxHash: string;

  @Prop({ type: String, maxlength: 66 })
  releaseTxHash: string;
}

export const CollateralSchema = SchemaFactory.createForClass(Collateral);
export type CollateralDocument = Collateral & mongoose.Document;

CollateralSchema.set('toJSON', { getters: true });
CollateralSchema.set('toObject', { getters: true });
