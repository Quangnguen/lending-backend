import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BankConnectionDocument = BankConnection & Document;

@Schema({ timestamps: true, collection: 'bank_connections' })
export class BankConnection {
  @Prop({ type: Types.ObjectId, required: true, ref: 'User' })
  userId: Types.ObjectId;

  @Prop({ required: true })
  accessToken: string; // Plaid access token

  @Prop({ required: true })
  itemId: string; // Plaid item ID

  @Prop({ required: true })
  institutionId: string; // Plaid institution ID

  @Prop({ required: true })
  institutionName: string; // Plaid institution name

  @Prop({ type: [String], default: [] })
  accounts: string[]; // List of linked account IDs

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  lastSyncedAt: Date;

  @Prop()
  consentExpriesAt: Date; // User consent expiration date
}

export const BankConnectionSchema =
  SchemaFactory.createForClass(BankConnection);
