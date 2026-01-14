import { isEmpty } from 'lodash';
import { Reflector } from '@nestjs/core';
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

import { UserDocument } from '@database/schemas/user.model';
import { ROLE_ENUM } from '@constant/p2p-lending.enum';
import { REQUEST_USER_KEY, ROLES_KEY } from '@constant/app.enum';

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<ROLE_ENUM[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isEmpty(requiredRoles)) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request[REQUEST_USER_KEY] as UserDocument;

    if (!user) {
      return false;
    }

    return requiredRoles.includes(user.role);
  }
}
