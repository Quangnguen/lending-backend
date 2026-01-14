import { User } from '@database/schemas/user.model';
import { BaseInterfaceRepository } from '@core/repository/base.interface.repository';
import { UpdateMeRequestDto } from '@components/auth/dto/request/update-me.request.dto';
import { UpdateUserRequestDto } from '@components/user/dto/request/update-user.request.dto';
import { CreateUserRequestDto } from '@components/user/dto/request/create-user.request.dto';
import { GetListUserRequestDto } from '@components/user/dto/request/get-list-user.request.dto';
import { KYC_STATUS_ENUM, USER_STATUS_ENUM } from '@constant/p2p-lending.enum';

export interface UserRepositoryInterface extends BaseInterfaceRepository<User> {
  createEntity(data: CreateUserRequestDto): User;

  updateMe(entity: User, data: UpdateMeRequestDto): User;

  updateEntity(entity: User, data: UpdateUserRequestDto): User;

  getDetail(id: string): Promise<User | null>;

  list(
    request: GetListUserRequestDto,
    isExport?: boolean,
  ): Promise<{ data: User[]; total: number }>;

  getSummaryUsers(): Promise<{ role: string; count: number }[]>;

  // KYC methods
  updateKycStatus(
    id: string,
    status: KYC_STATUS_ENUM,
    rejectionReason?: string,
  ): Promise<User | null>;

  updateUserStatus(id: string, status: USER_STATUS_ENUM): Promise<User | null>;

  updateBalance(id: string, amount: number): Promise<User | null>;

  updateCreditScore(id: string, score: number): Promise<User | null>;

  updateLoanStats(
    id: string,
    stats: {
      totalBorrowed?: number;
      totalLent?: number;
      successfulLoans?: number;
      defaultedLoans?: number;
    },
  ): Promise<User | null>;

  // Search methods
  findByEmail(email: string): Promise<User | null>;
  findByPhone(phone: string): Promise<User | null>;
  findByWalletAddress(walletAddress: string): Promise<User | null>;
}
