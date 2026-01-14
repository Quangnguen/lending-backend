import { registerAs } from '@nestjs/config';
import { IsString } from 'class-validator';

import { AuthConfig } from './config.type';
import validateConfig from '@utils/validate-config';

class EnvironmentVariablesValidator {
  @IsString()
  AUTH_ACCESS_SECRET: string;

  @IsString()
  AUTH_ACCESS_TOKEN_EXPIRES_IN: string;

  @IsString()
  AUTH_REFRESH_SECRET: string;

  @IsString()
  AUTH_REFRESH_TOKEN_EXPIRES_IN: string;

  @IsString()
  TWO_2FA_SECRET: string;

  @IsString()
  TWO_2FA_TOKEN_EXPIRES_IN: string;

  // @IsString()
  // CAPTCHA_SECRET: string;

  // @IsString()
  // CAPTCHA_EXPIRES_IN: string;
}

export default registerAs<AuthConfig>('auth', () => {
  validateConfig(process.env, EnvironmentVariablesValidator);

  return {
    accessSecret: process.env.AUTH_ACCESS_SECRET,
    accessExpires: process.env.AUTH_ACCESS_TOKEN_EXPIRES_IN,
    refreshSecret: process.env.AUTH_REFRESH_SECRET,
    refreshExpires: process.env.AUTH_REFRESH_TOKEN_EXPIRES_IN,
    two2FASecret: process.env.TWO_2FA_SECRET,
    two2FAExpires: process.env.TWO_2FA_TOKEN_EXPIRES_IN,
    // captchaSecret: process.env.CAPTCHA_SECRET,
    // captchaExpires: (Number(process.env.CAPTCHA_EXPIRES_IN) || 30) * 1000, // default 30s
  };
});
