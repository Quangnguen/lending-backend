import { Expose } from 'class-transformer';

export class LoginOtpRequiredResponseDto {
  @Expose()
  requireOtp: boolean;

  @Expose()
  email: string;

  @Expose()
  message: string;
}
