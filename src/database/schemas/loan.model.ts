import * as mongoose from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { BaseModel } from '@core/schema/base.model';
import { LOAN_STATUS_ENUM } from '@constant/p2p-lending.enum';

@Schema({
  timestamps: true,
  collection: 'loans',
  collation: { locale: 'vi' },
})
export class Loan extends BaseModel {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LoanRequest',
    unique: true,
  })
  requestId: mongoose.Types.ObjectId;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  borrowerId: mongoose.Types.ObjectId;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  lenderId: mongoose.Types.ObjectId;

  // ==================== Loan Details ====================
  @Prop({
    type: mongoose.Schema.Types.Decimal128,
    required: true,
    get: (v: mongoose.Types.Decimal128) => parseFloat(v?.toString() || '0'),
  })
  principalAmount: number;

  @Prop({
    type: mongoose.Schema.Types.Decimal128,
    required: true,
    get: (v: mongoose.Types.Decimal128) => parseFloat(v?.toString() || '0'),
  })
  interestRate: number;

  @Prop({
    type: mongoose.Schema.Types.Decimal128,
    get: (v: mongoose.Types.Decimal128) => parseFloat(v?.toString() || '0'),
  })
  totalInterest: number;

  @Prop({
    type: mongoose.Schema.Types.Decimal128,
    required: true,
    get: (v: mongoose.Types.Decimal128) => parseFloat(v?.toString() || '0'),
  })
  totalAmount: number; // Principal + Interest

  @Prop({ type: Number })
  durationDays: number;

  @Prop({ type: Date })
  startDate: Date;

  @Prop({ type: Date, index: true })
  dueDate: Date;

  // ==================== Repayment ====================
  @Prop({
    type: mongoose.Schema.Types.Decimal128,
    default: 0,
    get: (v: mongoose.Types.Decimal128) => parseFloat(v?.toString() || '0'),
  })
  amountPaid: number;

  @Prop({
    type: mongoose.Schema.Types.Decimal128,
    get: (v: mongoose.Types.Decimal128) => parseFloat(v?.toString() || '0'),
  })
  remainingAmount: number;

  @Prop({
    type: mongoose.Schema.Types.Decimal128,
    default: 0,
    get: (v: mongoose.Types.Decimal128) => parseFloat(v?.toString() || '0'),
  })
  lateFee: number;

  // ==================== Status ====================
  @Prop({
    type: String,
    enum: Object.values(LOAN_STATUS_ENUM),
    default: LOAN_STATUS_ENUM.ACTIVE,
    index: true,
  })
  status: LOAN_STATUS_ENUM;

  // ==================== Blockchain ====================
  @Prop({ type: String, maxlength: 42 })
  loanContractAddress: string;

  @Prop({ type: String, maxlength: 66 })
  fundTxHash: string;

  @Prop({ type: String, maxlength: 66 })
  repayTxHash: string;

  @Prop({ type: Date })
  repaidAt: Date;
}

export const LoanSchema = SchemaFactory.createForClass(Loan);
export type LoanDocument = Loan & mongoose.Document;

LoanSchema.set('toJSON', { getters: true });
LoanSchema.set('toObject', { getters: true });
