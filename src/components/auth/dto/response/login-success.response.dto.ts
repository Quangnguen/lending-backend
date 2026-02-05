import { Expose, Type } from 'class-transformer';

import { GetUserDetailResponseDto } from '@components/user/dto/response/get-user-detail.response.dto';

export class LoginSuccessResponseDto {
  @Expose()
  @Type(() => GetUserDetailResponseDto)
  user: GetUserDetailResponseDto;

  @Expose()
  accessToken: string;

  @Expose()
  refreshToken: string;

  @Expose()
  accessTokenExpires: Date;

  @Expose()
  refreshTokenExpires: Date;

  @Expose()
  isTrustedDevice: boolean;
}
