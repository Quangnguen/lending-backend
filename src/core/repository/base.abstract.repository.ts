import { ClientSession, Model } from 'mongoose';

import { BaseModel } from '@core/schema/base.model';
import { BaseInterfaceRepository } from './base.interface.repository';

export abstract class BaseAbstractRepository<T extends BaseModel>
  implements BaseInterfaceRepository<T>
{
  protected model: Model<T>;

  constructor(model: Model<T>) {
    this.model = model;
  }

  public get aggregate(): Model<T>['aggregate'] {
    return this.model.aggregate.bind(this.model);
  }

  public get bulkSave(): Model<T>['bulkSave'] {
    return this.model.bulkSave.bind(this.model);
  }

  public get countDocuments(): Model<T>['countDocuments'] {
    return this.model.countDocuments.bind(this.model);
  }

  public get deleteMany(): Model<T>['deleteMany'] {
    return this.model.deleteMany.bind(this.model);
  }

  public get distinct(): Model<T>['distinct'] {
    return this.model.distinct.bind(this.model);
  }

  public get exists(): Model<T>['exists'] {
    return this.model.exists.bind(this.model);
  }

  public get find(): Model<T>['find'] {
    return this.model.find.bind(this.model);
  }

  public get findById(): Model<T>['findById'] {
    return this.model.findById.bind(this.model);
  }

  public get findByIdAndDelete(): Model<T>['findByIdAndDelete'] {
    return this.model.findByIdAndDelete.bind(this.model);
  }

  public get findOne(): Model<T>['findOne'] {
    return this.model.findOne.bind(this.model);
  }

  public get findOneAndDelete(): Model<T>['findOneAndDelete'] {
    return this.model.findOneAndDelete.bind(this.model);
  }

  public get findOneAndUpdate(): Model<T>['findOneAndUpdate'] {
    return this.model.findOneAndUpdate.bind(this.model);
  }

  public get insertMany(): Model<T>['insertMany'] {
    return this.model.insertMany.bind(this.model);
  }

  public get deleteOne(): Model<T>['deleteOne'] {
    return this.model.deleteOne.bind(this.model);
  }

  public get updateMany(): Model<T>['updateMany'] {
    return this.model.updateMany.bind(this.model);
  }

  public get updateOne(): Model<T>['updateOne'] {
    return this.model.updateOne.bind(this.model);
  }

  public async create(
    data: T | any,
    options?: { session?: ClientSession },
  ): Promise<T> {
    const entity = new this.model(data);
    return await entity.save(options);
  }

  public async bulkWrite(
    operations: any[],
    options?: { session?: ClientSession },
  ): Promise<any> {
    return await this.model.bulkWrite(operations, options);
  }
}
