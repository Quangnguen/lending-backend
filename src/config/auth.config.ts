import { registerAs } from '@nestjs/config';
import { IsString, MinLength } from 'class-validator';

import { AuthConfig } from './config.type';
import validateConfig from '@utils/validate-config';

// STT-1 FIX: JWT secrets phải ít nhất 32 ký tự để đủ entropy
// Các secret mặc định như 'secret', 'refresh' bị block bởi MinLength
class EnvironmentVariablesValidator {
  @IsString()
  @MinLength(32, {
    message: 'AUTH_ACCESS_SECRET phải ít nhất 32 ký tự. Dùng: openssl rand -hex 32',
  })
  AUTH_ACCESS_SECRET: string;

  @IsString()
  AUTH_ACCESS_TOKEN_EXPIRES_IN: string;

  @IsString()
  @MinLength(32, {
    message: 'AUTH_REFRESH_SECRET phải ít nhất 32 ký tự. Dùng: openssl rand -hex 32',
  })
  AUTH_REFRESH_SECRET: string;

  @IsString()
  AUTH_REFRESH_TOKEN_EXPIRES_IN: string;

  @IsString()
  TWO_2FA_SECRET: string;

  @IsString()
  TWO_2FA_TOKEN_EXPIRES_IN: string;
}

// STT-1 FIX: Danh sách secret cực yếu — throw ngay khi khởi động nếu gặp
const INSECURE_SECRETS = new Set(['secret', 'refresh', '2fa', 'password', '123456', 'changeme']);

const assertSecretStrong = (name: string, value: string | undefined): void => {
  if (!value) return; // Đã được bắt bởi @IsString() ở trên
  if (INSECURE_SECRETS.has(value.toLowerCase())) {
    throw new Error(
      `[SECURITY] ${name} đang dùng giá trị cực yếu ("${value}"). ` +
      `Thay bằng chuỗi ngẫu nhiên: openssl rand -hex 32`,
    );
  }
};

export default registerAs<AuthConfig>('auth', () => {
  validateConfig(process.env, EnvironmentVariablesValidator);

  // STT-1 FIX: Chặn khởi động nếu dùng secret quá yếu
  assertSecretStrong('AUTH_ACCESS_SECRET', process.env.AUTH_ACCESS_SECRET);
  assertSecretStrong('AUTH_REFRESH_SECRET', process.env.AUTH_REFRESH_SECRET);

  return {
    accessSecret: process.env.AUTH_ACCESS_SECRET,
    accessExpires: process.env.AUTH_ACCESS_TOKEN_EXPIRES_IN,
    refreshSecret: process.env.AUTH_REFRESH_SECRET,
    refreshExpires: process.env.AUTH_REFRESH_TOKEN_EXPIRES_IN,
    two2FASecret: process.env.TWO_2FA_SECRET,
    two2FAExpires: process.env.TWO_2FA_TOKEN_EXPIRES_IN,
  };
});
