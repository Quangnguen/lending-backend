import * as moment from 'moment';
import { isEmpty } from 'lodash';
import { Model } from 'mongoose';
import * as twoFactor from 'node-2fa';
import { InjectModel } from '@nestjs/mongoose';

import { User } from '@database/schemas/user.model';
import { UserRepositoryInterface } from './user.repository.interface';
import { convertOrderMongo, getRegexByValue, SortOrder } from '@utils/common';
import { BaseAbstractRepository } from '@core/repository/base.abstract.repository';
import { UpdateMeRequestDto } from '@components/auth/dto/request/update-me.request.dto';
import { UpdateUserRequestDto } from '@components/user/dto/request/update-user.request.dto';
import { CreateUserRequestDto } from '@components/user/dto/request/create-user.request.dto';
import { GetListUserRequestDto } from '@components/user/dto/request/get-list-user.request.dto';

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

    entity.email = data.email;
    entity.fullname = data.fullname;
    entity.password = data.password;
    entity.role = data.role;
    entity.gender = data.gender;
    entity.phone = data.phone;
    entity.avatar = data.avatar;
    entity.createdBy = data.userId;

    return entity;
  }

  updateEntity(entity: User, data: UpdateUserRequestDto): User {
    entity.email = data.email;
    entity.fullname = data.fullname;
    entity.role = data.role;
    entity.gender = data.gender;
    entity.phone = data.phone;

    return entity;
  }

  updateMe(entity: User, data: UpdateMeRequestDto): User {
    entity.avatar = data.avatar;
    entity.fullname = data.fullname;
    entity.gender = data.gender;
    entity.phone = data.phone;

    return entity;
  }

  async getDetail(id: string): Promise<User | null> {
    return await this.userModel
      .findOne({
        _id: id,
        deletedAt: null,
      })
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
        $or: [{ email: filterByKeyword }, { fullname: filterByKeyword }],
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
          case 'keyword':
            filterObj = {
              ...filterObj,
              $or: [
                { email: getRegexByValue(value) },
                { phone: getRegexByValue(value) },
                { fullname: getRegexByValue(value) },
              ],
            };
            break;
          case 'fullname':
            filterObj = {
              ...filterObj,
              fullname: getRegexByValue(value),
            };
            break;
          case 'isLocked':
            filterObj = {
              ...filterObj,
              isLocked: {
                $in: value.split(',')?.map((item) => Number(item.trim())),
              },
            };
            break;
          case 'gender':
            filterObj = {
              ...filterObj,
              gender: {
                $in: value.split(',')?.map((item) => Number(item.trim())),
              },
            };
            break;
          case 'role':
            filterObj = {
              ...filterObj,
              role: Number(value),
            };
            break;
          case 'roles':
            filterObj = {
              ...filterObj,
              role: {
                $in: value.split(',')?.map((item) => Number(item.trim())),
              },
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
          case 'fullname':
            sortObj = { ...sortObj, fullname: order };
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
          case 'isLocked':
            sortObj = { ...sortObj, isLocked: order };
            break;
          default:
            break;
        }
      });
    }

    const pipeline: any[] = [
      { $match: { deletedAt: null, ...filterObj } },
      { $sort: sortObj },
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

  async getSummaryUsers(): Promise<{ role: number; count: number }[]> {
    const summary = await this.userModel.aggregate([
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
}
