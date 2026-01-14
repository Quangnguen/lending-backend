import * as mongoose from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { BaseModel } from '@core/schema/base.model';
import {
  LOAN_PURPOSE_ENUM,
  COLLATERAL_TYPE_ENUM,
  LOAN_REQUEST_STATUS_ENUM,
} from '@constant/p2p-lending.enum';

@Schema({
  timestamps: true,
  collection: 'loan_requests',
  collation: { locale: 'vi' },
})
export class LoanRequest extends BaseModel {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  borrowerId: mongoose.Types.ObjectId;

  // ==================== Loan Info ====================
  @Prop({
    type: mongoose.Schema.Types.Decimal128,
    required: true,
    get: (v: mongoose.Types.Decimal128) => parseFloat(v?.toString() || '0'),
  })
  loanAmount: number;

  @Prop({ type: String, default: 'VND', maxlength: 3 })
  currency: string;

  @Prop({
    type: mongoose.Schema.Types.Decimal128,
    required: true,
    get: (v: mongoose.Types.Decimal128) => parseFloat(v?.toString() || '0'),
  })
  interestRate: number; // Annual %

  @Prop({ type: Number, required: true })
  durationDays: number;

  // ==================== Purpose ====================
  @Prop({
    type: String,
    enum: Object.values(LOAN_PURPOSE_ENUM),
  })
  purpose: LOAN_PURPOSE_ENUM;

  @Prop({ type: String })
  purposeDescription: string;

  // ==================== Collateral ====================
  @Prop({
    type: String,
    enum: Object.values(COLLATERAL_TYPE_ENUM),
    default: COLLATERAL_TYPE_ENUM.NONE,
  })
  collateralType: COLLATERAL_TYPE_ENUM;

  @Prop({ type: String })
  collateralDescription: string;

  @Prop({
    type: mongoose.Schema.Types.Decimal128,
    get: (v: mongoose.Types.Decimal128) => parseFloat(v?.toString() || '0'),
  })
  collateralValue: number;

  @Prop({ type: String, maxlength: 42 })
  collateralTokenAddress: string;

  @Prop({
    type: mongoose.Schema.Types.Decimal128,
    get: (v: mongoose.Types.Decimal128) => parseFloat(v?.toString() || '0'),
  })
  collateralAmount: number;

  // ==================== Status ====================
  @Prop({
    type: String,
    enum: Object.values(LOAN_REQUEST_STATUS_ENUM),
    default: LOAN_REQUEST_STATUS_ENUM.PENDING,
    index: true,
  })
  status: LOAN_REQUEST_STATUS_ENUM;

  // ==================== Blockchain ====================
  @Prop({ type: String, maxlength: 66 })
  blockchainTxHash: string;

  @Prop({ type: String, maxlength: 42 })
  smartContractAddress: string;

  @Prop({ type: Date })
  expiresAt: Date;
}

export const LoanRequestSchema = SchemaFactory.createForClass(LoanRequest);
export type LoanRequestDocument = LoanRequest & mongoose.Document;

LoanRequestSchema.set('toJSON', { getters: true });
LoanRequestSchema.set('toObject', { getters: true });

// TTL index for auto-expire
LoanRequestSchema.index(
  { expiresAt: 1 },
  {
    expireAfterSeconds: 0,
    partialFilterExpression: { status: LOAN_REQUEST_STATUS_ENUM.PENDING },
  },
);
