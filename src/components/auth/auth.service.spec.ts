import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { User } from '@database/schemas/user.model';
import { UserSession } from '@database/schemas/user-session.model';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn().mockResolvedValue('hashed_password'),
  genSalt: jest.fn().mockResolvedValue('salt'),
}));

const mockUserModel = {
  findOne: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  findByIdAndUpdate: jest.fn(),
};

const mockSessionModel = {
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  deleteMany: jest.fn(),
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('mock.jwt.token'),
  verify: jest.fn(),
  decode: jest.fn(),
};

const mockCacheManager = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

const mockEventEmitter = { emit: jest.fn() };

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getModelToken(User.name), useValue: mockUserModel },
        { provide: getModelToken(UserSession.name), useValue: mockSessionModel },
        { provide: JwtService, useValue: mockJwtService },
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // ─────────────────────────── REGISTER ────────────────────────────────────

  describe('register()', () => {
    it('TC-AUTH-U01: throws ConflictException when email already exists', async () => {
      mockUserModel.findOne.mockResolvedValueOnce({ _id: 'existing', email: 'test@test.com' });

      await expect(
        service.register({
          email: 'test@test.com',
          password: 'Password1!',
          fullName: 'Test User',
          phone: '0901234567',
        } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('TC-AUTH-U02: creates user and emits OTP event on valid registration', async () => {
      mockUserModel.findOne.mockResolvedValue(null);
      const savedUser = { _id: 'new-id', email: 'new@test.com', save: jest.fn() };
      mockUserModel.create.mockResolvedValueOnce(savedUser);
      mockCacheManager.set.mockResolvedValue(undefined);

      await service.register({
        email: 'new@test.com',
        password: 'Password1!',
        fullName: 'New User',
        phone: '0901234567',
      } as any);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        expect.stringContaining('otp'),
        expect.objectContaining({ email: 'new@test.com' }),
      );
    });
  });

  // ─────────────────────────── LOGIN ───────────────────────────────────────

  describe('login()', () => {
    it('TC-AUTH-U03: throws UnauthorizedException for wrong password', async () => {
      mockUserModel.findOne.mockResolvedValueOnce({
        _id: 'uid',
        email: 'a@test.com',
        passwordHash: 'hashed',
        isVerified: true,
        role: 'user',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);

      await expect(
        service.login({ email: 'a@test.com', password: 'wrong', deviceType: 'MOBILE' } as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('TC-AUTH-U04: throws UnauthorizedException for unverified email', async () => {
      mockUserModel.findOne.mockResolvedValueOnce({
        _id: 'uid',
        email: 'a@test.com',
        passwordHash: 'hashed',
        isVerified: false,
        role: 'user',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);

      await expect(
        service.login({ email: 'a@test.com', password: 'correct', deviceType: 'MOBILE' } as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('TC-AUTH-U05: admin (WEB device) skips OTP and returns tokens directly', async () => {
      const adminUser = {
        _id: 'admin-id',
        email: 'admin@test.com',
        passwordHash: 'hashed',
        isVerified: true,
        role: 'admin',
        toObject: () => ({ _id: 'admin-id', email: 'admin@test.com' }),
      };
      mockUserModel.findOne.mockResolvedValueOnce(adminUser);
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);
      mockSessionModel.findOneAndUpdate.mockResolvedValueOnce({ _id: 'sess' });

      const result = await service.login({
        email: 'admin@test.com',
        password: 'correct',
        deviceType: 'WEB',
      } as any);

      expect(result).toHaveProperty('accessToken');
      expect(result).not.toHaveProperty('otpRequired');
    });

    it('TC-AUTH-U06: non-trusted MOBILE device returns otpRequired = true', async () => {
      const mobileUser = {
        _id: 'uid',
        email: 'user@test.com',
        passwordHash: 'hashed',
        isVerified: true,
        role: 'user',
      };
      mockUserModel.findOne.mockResolvedValueOnce(mobileUser);
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);
      mockSessionModel.findOne.mockResolvedValueOnce(null); // not trusted
      mockCacheManager.set.mockResolvedValue(undefined);

      const result = await service.login({
        email: 'user@test.com',
        password: 'correct',
        deviceType: 'MOBILE',
        deviceId: 'device-123',
      } as any);

      expect(result).toHaveProperty('otpRequired', true);
    });
  });

  // ─────────────────────────── VERIFY LOGIN OTP ────────────────────────────

  describe('verifyLoginOtp()', () => {
    it('TC-AUTH-U07: throws UnauthorizedException for wrong OTP', async () => {
      mockCacheManager.get.mockResolvedValueOnce('654321'); // stored OTP

      await expect(
        service.verifyLoginOtp({ email: 'u@test.com', otp: '000000', deviceType: 'MOBILE' } as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('TC-AUTH-U08: throws UnauthorizedException when OTP expired (null in cache)', async () => {
      mockCacheManager.get.mockResolvedValueOnce(null); // expired

      await expect(
        service.verifyLoginOtp({ email: 'u@test.com', otp: '123456', deviceType: 'MOBILE' } as any),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─────────────────────────── FORGOT PASSWORD ─────────────────────────────

  describe('forgotPassword()', () => {
    it('TC-AUTH-U09: throws NotFoundException for non-existent email', async () => {
      mockUserModel.findOne.mockResolvedValueOnce(null);

      await expect(
        service.forgotPassword({ email: 'notexist@test.com' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('TC-AUTH-U10: stores OTP in Redis with 15-minute TTL for valid email', async () => {
      mockUserModel.findOne.mockResolvedValueOnce({
        _id: 'uid',
        email: 'exist@test.com',
        fullName: 'Exist User',
      });
      mockCacheManager.set.mockResolvedValue(undefined);

      await service.forgotPassword({ email: 'exist@test.com' } as any);

      expect(mockCacheManager.set).toHaveBeenCalledWith(
        expect.stringContaining('forgot-otp:exist@test.com'),
        expect.any(String),
        900000, // 15 minutes in ms
      );
    });
  });

  // ─────────────────────────── RESET PASSWORD ──────────────────────────────

  describe('resetPassword()', () => {
    it('TC-AUTH-U11: throws BadRequestException for wrong reset OTP', async () => {
      mockCacheManager.get.mockResolvedValueOnce('999999'); // stored OTP

      await expect(
        service.resetPassword({
          email: 'u@test.com',
          otp: '000000',
          newPassword: 'NewPass1!',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('TC-AUTH-U12: deletes OTP from Redis after successful password reset', async () => {
      mockCacheManager.get.mockResolvedValueOnce('123456');
      mockUserModel.findOne.mockResolvedValueOnce({
        _id: 'uid',
        email: 'u@test.com',
        save: jest.fn().mockResolvedValue(undefined),
      });
      mockCacheManager.del.mockResolvedValue(undefined);

      await service.resetPassword({
        email: 'u@test.com',
        otp: '123456',
        newPassword: 'NewPass1!',
      } as any);

      expect(mockCacheManager.del).toHaveBeenCalledWith(
        expect.stringContaining('forgot-otp:u@test.com'),
      );
    });
  });

  // ─────────────────────────── REFRESH TOKEN ───────────────────────────────

  describe('refreshToken()', () => {
    it('TC-AUTH-U13: throws UnauthorizedException for expired/invalid refresh token', async () => {
      mockJwtService.verify.mockImplementationOnce(() => {
        throw new Error('jwt expired');
      });

      await expect(
        service.refreshToken({ refreshToken: 'expired.token.here' } as any),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─────────────────────────── WALLET UPDATE ───────────────────────────────

  describe('updateWallet()', () => {
    it('TC-AUTH-U14: throws BadRequestException for invalid Ethereum address', async () => {
      await expect(
        service.updateWallet({ _id: 'uid' } as any, 'not-an-eth-address'),
      ).rejects.toThrow(BadRequestException);
    });

    it('TC-AUTH-U15: accepts valid checksummed Ethereum address', async () => {
      mockUserModel.findByIdAndUpdate.mockResolvedValueOnce({
        _id: 'uid',
        walletAddress: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
      });

      await expect(
        service.updateWallet(
          { _id: 'uid' } as any,
          '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
        ),
      ).resolves.not.toThrow();
    });
  });
});
