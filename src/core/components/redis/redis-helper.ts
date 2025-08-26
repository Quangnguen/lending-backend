import Redis from 'ioredis';
import { Injectable } from '@nestjs/common';

@Injectable()
export class RedisHelper {
  private redisClient: Redis;

  constructor() {
    const redisHost: string = process.env.REDIS_HOST || 'localhost';
    const redisPort: number = Number(process.env.REDIS_PORT) || 6379;

    this.redisClient = new Redis({
      host: redisHost,
      port: redisPort,
    });
  }

  /**
   * Xóa tất cả các cache key có chứa prefix
   * @param prefix - Tiền tố của cache key cần xóa (ví dụ: '/products', '/categories')
   */
  async clearCache(prefix: string): Promise<void> {
    try {
      const keys = await this.redisClient.keys(`*${prefix}*`);
      if (keys.length > 0) {
        await this.redisClient.unlink(...keys);
      }
    } catch (error) {
      console.error(`Error clearing cache with prefix ${prefix}:`, error);
    }
  }
}
