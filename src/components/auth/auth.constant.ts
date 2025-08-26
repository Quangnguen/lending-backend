export const AUTH_CONST = {
  OTP_2FA_LENGTH: 6,
  OTP_2FA_SECRET_LENGTH: 32,
  CODE_VERIFY_2FA_SUCCESS: [0, 2],
  PASSWORD: {
    MIN_LENGTH: 6,
    MAX_LENGTH: 50,
    LENGTH_DEFAULT: 8,
  },
};

export const TOKEN_TYPE_ENUM = {
  TWO_2FA: 'two_2fa',
  ACCESS_TOKEN: 'access_token',
  REFRESH_TOKEN: 'refresh_token',
};

export const KEY_PASSWORD_RESET = 'password_reset';

export const PASSWORD_RESET_EXPIRES = 1000 * 60 * 60 * 12; // 12h
