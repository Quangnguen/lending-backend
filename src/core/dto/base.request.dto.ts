import { User } from '@database/schemas/user.model';

export class BaseDto {
  request: any;

  responseError: any;

  user?: User;

  userId?: string;

  lang?: string;
}
