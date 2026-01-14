import * as mongoose from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { BaseModel } from '@core/schema/base.model';
import { LOAN_OFFER_STATUS_ENUM } from '@constant/p2p-lending.enum';

@Schema({
  timestamps: true,
  collection: 'loan_offers',
  collation: { locale: 'vi' },
})
export class LoanOffer extends BaseModel {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LoanRequest',
    required: true,
    index: true,
  })
  requestId: mongoose.Types.ObjectId;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  lenderId: mongoose.Types.ObjectId;

  @Prop({
    type: mongoose.Schema.Types.Decimal128,
    get: (v: mongoose.Types.Decimal128) => parseFloat(v?.toString() || '0'),
  })
  offeredAmount: number;

  @Prop({
    type: mongoose.Schema.Types.Decimal128,
    get: (v: mongoose.Types.Decimal128) => parseFloat(v?.toString() || '0'),
  })
  offeredInterestRate: number;

  @Prop({ type: String })
  message: string;

  @Prop({
    type: String,
    enum: Object.values(LOAN_OFFER_STATUS_ENUM),
    default: LOAN_OFFER_STATUS_ENUM.PENDING,
  })
  status: LOAN_OFFER_STATUS_ENUM;

  @Prop({ type: Date })
  respondedAt: Date;
}

export const LoanOfferSchema = SchemaFactory.createForClass(LoanOffer);
export type LoanOfferDocument = LoanOffer & mongoose.Document;

LoanOfferSchema.set('toJSON', { getters: true });
LoanOfferSchema.set('toObject', { getters: true });
