import * as mongoose from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { BaseModel } from '@core/schema/base.model';
import {
  REPORT_ISSUE_TYPE_ENUM,
  REPORT_STATUS_ENUM,
} from '@constant/p2p-lending.enum';

@Schema({
  timestamps: true,
  collection: 'loan_reports',
  collation: { locale: 'vi' },
})
export class LoanReport extends BaseModel {
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
  reporterId: mongoose.Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(REPORT_ISSUE_TYPE_ENUM),
    required: true,
  })
  issueType: REPORT_ISSUE_TYPE_ENUM;

  @Prop({ type: String })
  description: string;

  @Prop({ type: [String] })
  evidenceUrls: string[]; // Array of URLs

  @Prop({
    type: String,
    enum: Object.values(REPORT_STATUS_ENUM),
    default: REPORT_STATUS_ENUM.OPEN,
  })
  status: REPORT_STATUS_ENUM;

  @Prop({ type: String })
  resolution: string;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  })
  resolvedBy: mongoose.Types.ObjectId;

  @Prop({ type: Date })
  resolvedAt: Date;
}

export const LoanReportSchema = SchemaFactory.createForClass(LoanReport);
export type LoanReportDocument = LoanReport & mongoose.Document;
