import * as mongoose from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { BaseModel } from '@core/schema/base.model';
import { BANK_ACCOUNT_STATUS_ENUM } from '@constant/p2p-lending.enum';

@Schema({
  timestamps: true,
  collection: 'bank_accounts',
  collation: { locale: 'vi' },
})
export class BankAccount extends BaseModel {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId: mongoose.Types.ObjectId;

  @Prop({ type: String, required: true, maxlength: 20 })
  bankCode: string; // VCB, TCB, VPB...

  @Prop({ type: String, maxlength: 100 })
  bankName: string;

  @Prop({ type: String, required: true, maxlength: 30 })
  accountNumber: string;

  @Prop({ type: String, maxlength: 255 })
  accountHolderName: string;

  @Prop({ type: String, maxlength: 255 })
  branch: string;

  // Open Banking
  @Prop({ type: Boolean, default: false })
  isLinked: boolean;

  @Prop({ type: String })
  napasToken: string; // NAPAS connection token

  @Prop({ type: Date })
  lastSyncedAt: Date;

  @Prop({ type: Boolean, default: false })
  isPrimary: boolean;

  @Prop({
    type: String,
    enum: Object.values(BANK_ACCOUNT_STATUS_ENUM),
    default: BANK_ACCOUNT_STATUS_ENUM.PENDING,
  })
  status: BANK_ACCOUNT_STATUS_ENUM;
}

export const BankAccountSchema = SchemaFactory.createForClass(BankAccount);
export type BankAccountDocument = BankAccount & mongoose.Document;

// Compound unique index
BankAccountSchema.index({ userId: 1, accountNumber: 1 }, { unique: true });
