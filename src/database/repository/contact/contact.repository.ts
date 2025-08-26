import * as moment from 'moment';
import { isEmpty } from 'lodash';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';

import { Contact } from '@database/schemas/contact.model';
import { ContactRepositoryInterface } from './contact.repository.interface';
import { convertOrderMongo, getRegexByValue, SortOrder } from '@utils/common';
import { BaseAbstractRepository } from '@core/repository/base.abstract.repository';
import { CreateContactRequestDto } from '@components/contact/dto/request/create-contact.request.dto';
import { GetListContactRequestDto } from '@components/contact/dto/request/get-list-contact.request.dto';

export class ContactRepository
  extends BaseAbstractRepository<Contact>
  implements ContactRepositoryInterface
{
  constructor(
    @InjectModel('Contact')
    private readonly contactModel: Model<Contact>,
  ) {
    super(contactModel);
  }

  createEntity(data: CreateContactRequestDto): Contact {
    const entity = new this.contactModel();

    entity.email = data.email;
    entity.fullname = data.fullname;
    entity.phone = data.phone;
    entity.message = data.message;

    return entity;
  }

  async getDetail(id: string): Promise<Contact | null> {
    return await this.contactModel
      .findOne({
        _id: id,
        deletedAt: null,
      })
      .populate('respondedBy')
      .exec();
  }

  async list(
    request: GetListContactRequestDto,
    isExport = false,
  ): Promise<{ data: Contact[]; total: number }> {
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
          { phone: filterByKeyword },
          { fullname: filterByKeyword },
        ],
      };
    }

    if (!isEmpty(filter)) {
      filter.forEach((item) => {
        const value = item ? item.text : null;
        switch (item.column) {
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
          case 'fullname':
            filterObj = {
              ...filterObj,
              fullname: getRegexByValue(value),
            };
            break;
          case 'isResponded':
            filterObj = {
              ...filterObj,
              isResponded: {
                $in: value?.split(',')?.map(Number),
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
          case 'phone':
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
          case 'isResponded':
            sortObj = { ...sortObj, isResponded: order };
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

    const [contacts, total] = await Promise.all([
      this.contactModel.aggregate(pipeline),
      !isExport
        ? this.contactModel
            .countDocuments({ deletedAt: null, ...filterObj })
            .exec()
        : 0,
    ]);

    return { data: contacts, total };
  }
}
