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
export const PASSWORD_RESET_EXPIRES = 1000 * 60 * 60 * 12; // 12h (legacy)

// Forgot-password OTP: 6 chữ số, hết hạn sau 15 phút
export const KEY_FORGOT_OTP = 'forgot-otp';
export const FORGOT_OTP_EXPIRES = 1000 * 60 * 15; // 15 phút

// STT-15 FIX: OTP brute-force protection
export const KEY_OTP_ATTEMPTS = 'otp-attempts'; // Redis key prefix: otp-attempts:{email}
export const MAX_OTP_ATTEMPTS = 5; // Khóa sau 5 lần sai
export const OTP_LOCKOUT_TTL = 1000 * 60 * 15; // Khóa 15 phút
export const KEY_OTP_LOCKED = 'otp-locked'; // Redis key prefix: otp-locked:{email}
