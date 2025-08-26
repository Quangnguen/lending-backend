import { SetMetadata } from '@nestjs/common';

import { ROLES_KEY } from '@constant/app.enum';
import { USER_ROLE_ENUM } from '@components/user/user.constant';

export const Roles = (...roles: USER_ROLE_ENUM[]) =>
  SetMetadata(ROLES_KEY, roles);
