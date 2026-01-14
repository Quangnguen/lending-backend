import * as mongoose from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { BaseModel } from '@core/schema/base.model';
import { FEE_TYPE_ENUM } from '@constant/p2p-lending.enum';

@Schema({
  timestamps: true,
  collection: 'platform_fees',
  collation: { locale: 'vi' },
})
export class PlatformFee extends BaseModel {
  @Prop({
    type: String,
    enum: Object.values(FEE_TYPE_ENUM),
    required: true,
  })
  feeType: FEE_TYPE_ENUM;

  @Prop({
    type: mongoose.Schema.Types.Decimal128,
    get: (v: mongoose.Types.Decimal128) => parseFloat(v?.toString() || '0'),
  })
  feePercentage: number;

  @Prop({
    type: mongoose.Schema.Types.Decimal128,
    get: (v: mongoose.Types.Decimal128) => parseFloat(v?.toString() || '0'),
  })
  feeFixed: number;

  @Prop({
    type: mongoose.Schema.Types.Decimal128,
    get: (v: mongoose.Types.Decimal128) => parseFloat(v?.toString() || '0'),
  })
  minAmount: number;

  @Prop({
    type: mongoose.Schema.Types.Decimal128,
    get: (v: mongoose.Types.Decimal128) => parseFloat(v?.toString() || '0'),
  })
  maxAmount: number;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;
}

export const PlatformFeeSchema = SchemaFactory.createForClass(PlatformFee);
export type PlatformFeeDocument = PlatformFee & mongoose.Document;

PlatformFeeSchema.set('toJSON', { getters: true });
PlatformFeeSchema.set('toObject', { getters: true });
