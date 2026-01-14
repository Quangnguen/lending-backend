import * as bcrypt from 'bcrypt';
import * as mongoose from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { SALT_ROUNDS_PASSWORD } from '@components/user/user.constant';
import { BaseModel } from '@core/schema/base.model';
import {
  KYC_STATUS_ENUM,
  USER_STATUS_ENUM,
  GENDER_ENUM,
  ROLE_ENUM,
} from '@constant/p2p-lending.enum';

@Schema({
  timestamps: true,
  collection: 'users',
  collation: { locale: 'vi' },
})
export class User extends BaseModel {
  // ==================== BASIC INFO ====================
  @Prop({
    type: String,
    index: true,
    unique: true,
    required: true,
    maxlength: 255,
  })
  email: string;

  @Prop({
    type: String,
    unique: true,
    sparse: true,
    maxlength: 20,
  })
  phone: string;

  @Prop({
    type: String,
    required: true,
    maxlength: 255,
  })
  passwordHash: string;

  @Prop({
    type: String,
    required: true,
    maxlength: 255,
  })
  fullName: string;

  @Prop({
    type: String,
    default:
      'https://i.pinimg.com/736x/cd/74/c6/cd74c6ecffb83116692ca51da358284e.jpg',
  })
  avatarUrl: string;

  @Prop({ type: Date })
  dateOfBirth: Date;

  @Prop({
    type: String,
    enum: Object.values(GENDER_ENUM),
  })
  gender: GENDER_ENUM;

  @Prop({ type: String })
  address: string;

  @Prop({ type: String, maxlength: 100 })
  city: string;

  @Prop({ type: String, maxlength: 100, default: 'Vietnam' })
  country: string;

  // ==================== KYC - Identity Verification ====================
  @Prop({
    type: String,
    unique: true,
    sparse: true,
    maxlength: 20,
  })
  idCardNumber: string;

  @Prop({ type: String })
  idCardFrontUrl: string;

  @Prop({ type: String })
  idCardBackUrl: string;

  @Prop({ type: String })
  selfieUrl: string;

  @Prop({
    type: String,
    enum: Object.values(KYC_STATUS_ENUM),
    default: KYC_STATUS_ENUM.PENDING,
  })
  kycStatus: KYC_STATUS_ENUM;

  @Prop({ type: Date })
  kycVerifiedAt: Date;

  @Prop({ type: String })
  kycRejectionReason: string;

  // ==================== Wallet & Balance ====================
  @Prop({
    type: String,
    maxlength: 42,
  })
  walletAddress: string; // Ethereum address

  @Prop({
    type: mongoose.Schema.Types.Decimal128,
    default: 0,
    get: (v: mongoose.Types.Decimal128) => parseFloat(v?.toString() || '0'),
  })
  balance: number;

  // ==================== Reputation ====================
  @Prop({ type: Number, default: 500, min: 300, max: 850 })
  creditScore: number; // 300-850

  @Prop({ type: Number, default: 0 })
  reputationScore: number;

  @Prop({
    type: mongoose.Schema.Types.Decimal128,
    default: 0,
    get: (v: mongoose.Types.Decimal128) => parseFloat(v?.toString() || '0'),
  })
  totalBorrowed: number;

  @Prop({
    type: mongoose.Schema.Types.Decimal128,
    default: 0,
    get: (v: mongoose.Types.Decimal128) => parseFloat(v?.toString() || '0'),
  })
  totalLent: number;

  @Prop({ type: Number, default: 0 })
  successfulLoans: number;

  @Prop({ type: Number, default: 0 })
  defaultedLoans: number;

  // ==================== Status ====================
  @Prop({
    type: String,
    enum: Object.values(ROLE_ENUM),
    default: ROLE_ENUM.USER,
  })
  role: ROLE_ENUM;

  @Prop({
    type: String,
    enum: Object.values(USER_STATUS_ENUM),
    default: USER_STATUS_ENUM.ACTIVE,
  })
  status: USER_STATUS_ENUM;

  @Prop({ type: Boolean, default: false })
  isVerified: boolean;

  // ==================== References ====================
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  })
  createdBy: mongoose.Types.ObjectId;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  })
  deletedBy: mongoose.Types.ObjectId;
}

export const UserSchema = SchemaFactory.createForClass(User);
export type UserDocument = User & mongoose.Document;

// Hash password before save
UserSchema.pre<User>('save', async function (next) {
  if (this.isModified('passwordHash')) {
    this.passwordHash = await bcrypt.hash(
      this.passwordHash,
      SALT_ROUNDS_PASSWORD,
    );
  }
  next();
});

// Enable getters for Decimal128
UserSchema.set('toJSON', { getters: true });
UserSchema.set('toObject', { getters: true });
