import { Controller, Get, Inject } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';

import { AppService } from './app.service';
import { Public } from '@core/decorators/public.decorator';
import { ResponseCodeEnum } from '@constant/response-code.enum';
import { ROLE_ENUM } from '@constant/p2p-lending.enum';
import { UserRepositoryInterface } from '@database/repository/user/user.repository.interface';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    @Inject('UserRepositoryInterface')
    private readonly userRepository: UserRepositoryInterface,
  ) {}

  @ApiOperation({
    tags: ['Base'],
    summary: 'Hello world',
    description: 'Hello world',
  })
  @ApiResponse({
    status: 200,
    description: 'Success',
  })
  @SkipThrottle()
  @Get('/')
  @Public()
  getHello(): string {
    return this.appService.getHello();
  }

  @ApiOperation({
    tags: ['Base'],
    summary: 'Ping',
    description: 'Ping',
  })
  @ApiResponse({
    status: 200,
    description: 'Success',
  })
  @Get('/ping')
  @Public()
  ping(): string {
    return 'pong';
  }

  @ApiOperation({
    tags: ['Base'],
    summary: 'Health check',
    description: 'Health check',
  })
  @ApiResponse({
    status: 200,
    description: 'Success',
  })
  @Get('/health-check')
  @Public()
  healthCheck(): { statusCode: ResponseCodeEnum; message: string } {
    return { statusCode: ResponseCodeEnum.SUCCESS, message: 'OK' };
  }

  @ApiOperation({
    tags: ['Base'],
    summary: 'Seed admin & verifier accounts (one-time)',
    description: 'Tạo tài khoản Admin + Verifier mặc định nếu chưa có',
  })
  @Get('/seed-admin')
  @Public()
  async seedAdmin() {
    const accounts = [
      {
        email: 'admin@loanmanager.com',
        fullName: 'System Administrator',
        password: 'admin123',
        phone: '0900000001',
        role: ROLE_ENUM.ADMIN,
      },
      {
        email: 'verifier@loanmanager.com',
        fullName: 'KYC Verifier',
        password: 'verifier123',
        phone: '0900000002',
        role: ROLE_ENUM.USER, // Verifier dùng role USER, phân quyền bên admin portal
      },
    ];

    const results = [];

    for (const acc of accounts) {
      const existing = await this.userRepository.findOne({ email: acc.email });
      if (existing) {
        results.push({
          email: acc.email,
          status: 'already_exists',
          role: existing.role,
        });
        continue;
      }

      // User schema có pre-save hook tự hash passwordHash
      const entity = this.userRepository.createEntity({
        email: acc.email,
        fullName: acc.fullName,
        passwordHash: acc.password, // pre-save hook sẽ tự bcrypt.hash
        phone: acc.phone,
        role: acc.role,
        isVerified: true,
        status: 'active',
      } as any);
      await entity.save();

      results.push({
        email: acc.email,
        status: 'created',
        role: acc.role,
        password: acc.password,
      });
    }

    return {
      statusCode: 200,
      message: 'Seed accounts completed',
      accounts: results,
    };
  }
}
