import * as moment from 'moment';
import { isEmpty } from 'lodash';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';

import { User } from '@database/schemas/user.model';
import { UserRepositoryInterface } from './user.repository.interface';
import { convertOrderMongo, getRegexByValue, SortOrder } from '@utils/common';
import { BaseAbstractRepository } from '@core/repository/base.abstract.repository';
import { GetListUserRequestDto } from '@components/user/dto/request/get-list-user.request.dto';
import { CreateUserRequestDto } from '@components/user/dto/request/create-user.request.dto';
import { UpdateUserRequestDto } from '@components/user/dto/request/update-user.request.dto';
import { UpdateMeRequestDto } from '@components/auth/dto/request/update-me.request.dto';
import { KYC_STATUS_ENUM, USER_STATUS_ENUM } from '@constant/p2p-lending.enum';

export class UserRepository
  extends BaseAbstractRepository<User>
  implements UserRepositoryInterface
{
  constructor(
    @InjectModel('User')
    private readonly userModel: Model<User>,
  ) {
    super(userModel);
  }

  createEntity(data: CreateUserRequestDto): User {
    const entity = new this.userModel();

    // Basic Info
    entity.email = data.email;
    entity.phone = data.phone;
    entity.passwordHash = data.passwordHash;
    entity.fullName = data.fullName;
    entity.avatarUrl = data.avatarUrl;
    entity.dateOfBirth = data.dateOfBirth;
    entity.gender = data.gender;
    entity.address = data.address;
    entity.city = data.city;
    entity.country = data.country;

    // KYC
    entity.idCardNumber = data.idCardNumber;
    entity.idCardFrontUrl = data.idCardFrontUrl;
    entity.idCardBackUrl = data.idCardBackUrl;
    entity.selfieUrl = data.selfieUrl;

    // Wallet
    entity.walletAddress = data.walletAddress;

    // Status
    entity.role = data.role;
    entity.status = data.status as USER_STATUS_ENUM;

    // Reference
    entity.createdBy = data.createdBy;

    return entity;
  }

  updateEntity(entity: User, data: UpdateUserRequestDto): User {
    // Basic Info
    if (data.email !== undefined) entity.email = data.email;
    if (data.phone !== undefined) entity.phone = data.phone;
    if (data.fullName !== undefined) entity.fullName = data.fullName;

    // Status
    if (data.role !== undefined) entity.role = data.role;
    if (data.gender !== undefined) entity.gender = data.gender;

    return entity;
  }

  updateMe(entity: User, data: UpdateMeRequestDto): User {
    if (data.fullName !== undefined) entity.fullName = data.fullName;
    if (data.avatarUrl !== undefined) entity.avatarUrl = data.avatarUrl;
    if (data.phone !== undefined) entity.phone = data.phone;
    if (data.gender !== undefined) entity.gender = data.gender;

    return entity;
  }

  // ...existing code...

  async getDetail(id: string): Promise<User | null> {
    return await this.userModel
      .findOne({
        _id: id,
        deletedAt: null,
      })
      .select('-passwordHash')
      .exec();
  }

  async list(
    request: GetListUserRequestDto,
    isExport = false,
  ): Promise<{ data: User[]; total: number }> {
    const { keyword, sort, filter, page, limit } = request;

    const take = limit;
    const skip = (page - 1) * limit;

    let filterObj: any = {};
    let sortObj: any = { createdAt: SortOrder.DESC };

    if (!isEmpty(keyword)) {
      const filterByKeyword = getRegexByValue(keyword);
      filterObj = {
        $or: [
          { email: filterByKeyword },
          { fullName: filterByKeyword },
          { phone: filterByKeyword },
          { idCardNumber: filterByKeyword },
        ],
      };
    }

    if (!isEmpty(filter)) {
      filter.forEach((item) => {
        const value = item ? item.text : null;
        switch (item.column) {
          case 'email':
            filterObj = {
              ...filterObj,
              email: getRegexByValue(value),
            };
            break;
          case 'phone':
            filterObj = {
              ...filterObj,
              phone: getRegexByValue(value),
            };
            break;
          case 'fullName':
            filterObj = {
              ...filterObj,
              fullName: getRegexByValue(value),
            };
            break;
          case 'idCardNumber':
            filterObj = {
              ...filterObj,
              idCardNumber: getRegexByValue(value),
            };
            break;
          case 'status':
            filterObj = {
              ...filterObj,
              status: {
                $in: value.split(',')?.map((item) => item.trim()),
              },
            };
            break;
          case 'kycStatus':
            filterObj = {
              ...filterObj,
              kycStatus: {
                $in: value.split(',')?.map((item) => item.trim()),
              },
            };
            break;
          case 'gender':
            filterObj = {
              ...filterObj,
              gender: {
                $in: value.split(',')?.map((item) => item.trim()),
              },
            };
            break;
          case 'role':
            filterObj = {
              ...filterObj,
              role: value,
            };
            break;
          case 'roles':
            filterObj = {
              ...filterObj,
              role: {
                $in: value.split(',')?.map((item) => item.trim()),
              },
            };
            break;
          case 'isVerified':
            filterObj = {
              ...filterObj,
              isVerified: value === 'true',
            };
            break;
          case 'city':
            filterObj = {
              ...filterObj,
              city: getRegexByValue(value),
            };
            break;
          case 'country':
            filterObj = {
              ...filterObj,
              country: getRegexByValue(value),
            };
            break;
          case 'creditScoreMin':
            filterObj = {
              ...filterObj,
              creditScore: { ...filterObj.creditScore, $gte: Number(value) },
            };
            break;
          case 'creditScoreMax':
            filterObj = {
              ...filterObj,
              creditScore: { ...filterObj.creditScore, $lte: Number(value) },
            };
            break;
          case 'createdAt':
            const [startCreateAt, endCreateAt] = item.text.split('|');
            filterObj = {
              ...filterObj,
              createdAt: {
                $lte: moment(endCreateAt).endOf('day').toDate(),
                $gte: moment(startCreateAt).startOf('day').toDate(),
              },
            };
            break;
          case 'updatedAt':
            const [startUpdateAt, endUpdateAt] = item.text.split('|');
            filterObj = {
              ...filterObj,
              updatedAt: {
                $lte: moment(endUpdateAt).endOf('day').toDate(),
                $gte: moment(startUpdateAt).startOf('day').toDate(),
              },
            };
            break;
          default:
            break;
        }
      });
    }

    if (!isEmpty(sort)) {
      sort.forEach((item) => {
        const order = convertOrderMongo(item.order);
        switch (item.column) {
          case 'email':
            sortObj = { ...sortObj, email: order };
            break;
          case 'fullName':
            sortObj = { ...sortObj, fullName: order };
            break;
          case 'createdAt':
            sortObj = { ...sortObj, createdAt: order };
            break;
          case 'updatedAt':
            sortObj = { ...sortObj, updatedAt: order };
            break;
          case 'gender':
            sortObj = { ...sortObj, gender: order };
            break;
          case 'status':
            sortObj = { ...sortObj, status: order };
            break;
          case 'kycStatus':
            sortObj = { ...sortObj, kycStatus: order };
            break;
          case 'creditScore':
            sortObj = { ...sortObj, creditScore: order };
            break;
          case 'reputationScore':
            sortObj = { ...sortObj, reputationScore: order };
            break;
          case 'balance':
            sortObj = { ...sortObj, balance: order };
            break;
          case 'totalBorrowed':
            sortObj = { ...sortObj, totalBorrowed: order };
            break;
          case 'totalLent':
            sortObj = { ...sortObj, totalLent: order };
            break;
          default:
            break;
        }
      });
    }

    const pipeline: any[] = [
      { $match: { deletedAt: null, ...filterObj } },
      { $sort: sortObj },
      {
        $project: {
          passwordHash: 0,
        },
      },
    ];

    if (!isExport) {
      pipeline.push({ $skip: skip });
      pipeline.push({ $limit: take });
    }

    const [users, total] = await Promise.all([
      this.userModel.aggregate(pipeline),
      !isExport
        ? this.userModel
            .countDocuments({ deletedAt: null, ...filterObj })
            .exec()
        : 0,
    ]);

    return { data: users, total };
  }

  async getSummaryUsers(): Promise<{ role: string; count: number }[]> {
    const summary = await this.userModel.aggregate([
      { $match: { deletedAt: null } },
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          role: '$_id',
          count: 1,
        },
      },
    ]);

    return summary;
  }

  // ==================== KYC Methods ====================
  async updateKycInfo(
    id: string,
    data: {
      idCardNumber?: string;
      idCardFrontUrl?: string;
      idCardBackUrl?: string;
      selfieUrl?: string;
    },
  ): Promise<User | null> {
    const updateData: any = { updatedAt: new Date() };

    if (data.idCardNumber) updateData.idCardNumber = data.idCardNumber;
    if (data.idCardFrontUrl) updateData.idCardFrontUrl = data.idCardFrontUrl;
    if (data.idCardBackUrl) updateData.idCardBackUrl = data.idCardBackUrl;
    if (data.selfieUrl) updateData.selfieUrl = data.selfieUrl;

    // Reset KYC status to pending when updating KYC info
    updateData.kycStatus = KYC_STATUS_ENUM.PENDING;

    return this.userModel.findByIdAndUpdate(id, updateData, { new: true });
  }

  async updateKycStatus(
    id: string,
    status: KYC_STATUS_ENUM,
    rejectionReason?: string,
  ): Promise<User | null> {
    const updateData: any = {
      kycStatus: status,
      updatedAt: new Date(),
    };

    if (status === KYC_STATUS_ENUM.VERIFIED) {
      updateData.kycVerifiedAt = new Date();
      updateData.isVerified = true;
    } else if (status === KYC_STATUS_ENUM.REJECTED) {
      updateData.kycRejectionReason = rejectionReason;
    }

    return this.userModel.findByIdAndUpdate(id, updateData, { new: true });
  }

  // ==================== User Status Methods ====================
  async updateUserStatus(
    id: string,
    status: USER_STATUS_ENUM,
  ): Promise<User | null> {
    return this.userModel.findByIdAndUpdate(
      id,
      { status, updatedAt: new Date() },
      { new: true },
    );
  }

  // ==================== Balance & Wallet Methods ====================
  async updateBalance(id: string, amount: number): Promise<User | null> {
    return this.userModel.findByIdAndUpdate(
      id,
      {
        $inc: { balance: amount },
        updatedAt: new Date(),
      },
      { new: true },
    );
  }

  async updateWalletAddress(
    id: string,
    walletAddress: string,
  ): Promise<User | null> {
    return this.userModel.findByIdAndUpdate(
      id,
      { walletAddress, updatedAt: new Date() },
      { new: true },
    );
  }

  // ==================== Reputation Methods ====================
  async updateCreditScore(id: string, score: number): Promise<User | null> {
    // Ensure score is within valid range (300-850)
    const validScore = Math.max(300, Math.min(850, score));
    return this.userModel.findByIdAndUpdate(
      id,
      { creditScore: validScore, updatedAt: new Date() },
      { new: true },
    );
  }

  async updateReputationScore(id: string, score: number): Promise<User | null> {
    return this.userModel.findByIdAndUpdate(
      id,
      { reputationScore: score, updatedAt: new Date() },
      { new: true },
    );
  }

  async updateLoanStats(
    id: string,
    stats: {
      totalBorrowed?: number;
      totalLent?: number;
      successfulLoans?: number;
      defaultedLoans?: number;
    },
  ): Promise<User | null> {
    const incData: any = {};

    if (stats.totalBorrowed !== undefined) {
      incData.totalBorrowed = stats.totalBorrowed;
    }
    if (stats.totalLent !== undefined) {
      incData.totalLent = stats.totalLent;
    }
    if (stats.successfulLoans !== undefined) {
      incData.successfulLoans = stats.successfulLoans;
    }
    if (stats.defaultedLoans !== undefined) {
      incData.defaultedLoans = stats.defaultedLoans;
    }

    return this.userModel.findByIdAndUpdate(
      id,
      {
        $inc: incData,
        updatedAt: new Date(),
      },
      { new: true },
    );
  }

  // ==================== Search Methods ====================
  async findByEmail(email: string): Promise<User | null> {
    return this.userModel.findOne({ email, deletedAt: null });
  }

  async findByPhone(phone: string): Promise<User | null> {
    return this.userModel.findOne({ phone, deletedAt: null });
  }

  async findByWalletAddress(walletAddress: string): Promise<User | null> {
    return this.userModel.findOne({ walletAddress, deletedAt: null });
  }

  async findByIdCardNumber(idCardNumber: string): Promise<User | null> {
    return this.userModel.findOne({ idCardNumber, deletedAt: null });
  }
}
