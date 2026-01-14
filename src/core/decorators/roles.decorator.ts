import { SetMetadata } from '@nestjs/common';

import { ROLES_KEY } from '@constant/app.enum';
import { ROLE_ENUM } from '@constant/p2p-lending.enum';

export const Roles = (...roles: ROLE_ENUM[]) => SetMetadata(ROLES_KEY, roles);
