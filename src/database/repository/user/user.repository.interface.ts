import { User } from '@database/schemas/user.model';
import { BaseInterfaceRepository } from '@core/repository/base.interface.repository';
import { UpdateMeRequestDto } from '@components/auth/dto/request/update-me.request.dto';
import { UpdateUserRequestDto } from '@components/user/dto/request/update-user.request.dto';
import { CreateUserRequestDto } from '@components/user/dto/request/create-user.request.dto';
import { GetListUserRequestDto } from '@components/user/dto/request/get-list-user.request.dto';

export interface UserRepositoryInterface extends BaseInterfaceRepository<User> {
  createEntity(data: CreateUserRequestDto): User;

  updateMe(entity: User, data: UpdateMeRequestDto): User;

  updateEntity(entity: User, data: UpdateUserRequestDto): User;

  getDetail(id: string): Promise<User | null>;

  list(
    request: GetListUserRequestDto,
    isExport?: boolean,
  ): Promise<{ data: User[]; total: number }>;

  getSummaryUsers(): Promise<{ role: number; count: number }[]>;
}
