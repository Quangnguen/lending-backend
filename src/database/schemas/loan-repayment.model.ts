import * as mongoose from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { BaseModel } from '@core/schema/base.model';
import {
  PAYMENT_METHOD_ENUM,
  REPAYMENT_STATUS_ENUM,
} from '@constant/p2p-lending.enum';

@Schema({
  timestamps: true,
  collection: 'loan_repayments',
  collation: { locale: 'vi' },
})
export class LoanRepayment extends BaseModel {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Loan',
    required: true,
    index: true,
  })
  loanId: mongoose.Types.ObjectId;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  payerId: mongoose.Types.ObjectId;

  @Prop({ type: Number })
  installmentNumber: number; // Kỳ thanh toán

  @Prop({
    type: mongoose.Schema.Types.Decimal128,
    get: (v: mongoose.Types.Decimal128) => parseFloat(v?.toString() || '0'),
  })
  principalAmount: number;

  @Prop({
    type: mongoose.Schema.Types.Decimal128,
    get: (v: mongoose.Types.Decimal128) => parseFloat(v?.toString() || '0'),
  })
  interestAmount: number;

  @Prop({
    type: mongoose.Schema.Types.Decimal128,
    default: 0,
    get: (v: mongoose.Types.Decimal128) => parseFloat(v?.toString() || '0'),
  })
  lateFeeAmount: number;

  @Prop({
    type: mongoose.Schema.Types.Decimal128,
    get: (v: mongoose.Types.Decimal128) => parseFloat(v?.toString() || '0'),
  })
  totalAmount: number;

  @Prop({
    type: String,
    enum: Object.values(PAYMENT_METHOD_ENUM),
  })
  paymentMethod: PAYMENT_METHOD_ENUM;

  @Prop({
    type: String,
    enum: Object.values(REPAYMENT_STATUS_ENUM),
    default: REPAYMENT_STATUS_ENUM.PENDING,
  })
  status: REPAYMENT_STATUS_ENUM;

  // Blockchain
  @Prop({ type: String, maxlength: 66 })
  txHash: string;

  @Prop({ type: Date })
  dueDate: Date;

  @Prop({ type: Date })
  paidAt: Date;
}

export const LoanRepaymentSchema = SchemaFactory.createForClass(LoanRepayment);
export type LoanRepaymentDocument = LoanRepayment & mongoose.Document;

LoanRepaymentSchema.set('toJSON', { getters: true });
LoanRepaymentSchema.set('toObject', { getters: true });
