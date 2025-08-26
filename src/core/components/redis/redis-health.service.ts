import { Cache } from 'cache-manager';
import { Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';

@Injectable()
export class RedisHealthService implements OnModuleInit {
  private readonly logger = new Logger(RedisHealthService.name);

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  async onModuleInit() {
    await this.checkConnection();
  }

  async checkConnection() {
    try {
      await this.cacheManager.set('maplife-test_connection', 'ok', 5000);

      const testValue = await this.cacheManager.get('maplife-test_connection');

      if (testValue === 'ok') {
        this.logger.log('Successfully connected to Redis');
        return true;
      } else {
        this.logger.error('Failed to verify Redis connection');
        return false;
      }
    } catch (error) {
      this.logger.error('Redis connection error:', error);
      return false;
    }
  }
}
