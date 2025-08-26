import { ClientSession, Model } from 'mongoose';

import { BaseModel } from '@core/schema/base.model';

export interface BaseInterfaceRepository<T extends BaseModel> {
  get aggregate(): Model<T>['aggregate'];
  get bulkSave(): Model<T>['bulkSave'];
  get countDocuments(): Model<T>['countDocuments'];
  get deleteMany(): Model<T>['deleteMany'];
  get distinct(): Model<T>['distinct'];
  get exists(): Model<T>['exists'];
  get find(): Model<T>['find'];
  get findById(): Model<T>['findById'];
  get findByIdAndDelete(): Model<T>['findByIdAndDelete'];
  get findOne(): Model<T>['findOne'];
  get findOneAndDelete(): Model<T>['findOneAndDelete'];
  get findOneAndUpdate(): Model<T>['findOneAndUpdate'];
  get insertMany(): Model<T>['insertMany'];
  get deleteOne(): Model<T>['deleteOne'];
  get updateMany(): Model<T>['updateMany'];
  get updateOne(): Model<T>['updateOne'];
  create(data: T | any, options?: { session?: ClientSession }): Promise<T>;
  bulkWrite(
    operations: any[],
    options?: { session?: ClientSession },
  ): Promise<any>;
}
