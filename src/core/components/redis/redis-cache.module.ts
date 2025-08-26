import KeyvRedis from '@keyv/redis';
import { Module, Global } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';

import { RedisHelper } from './redis-helper';
import { RedisHealthService } from './redis-health.service';

@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      inject: [],
      useFactory: async () => {
        const redisPort: number = Number(process.env.REDIS_PORT) || 6379;
        const redisHost: string = process.env.REDIS_HOST || 'localhost';

        const keyvRedis = new KeyvRedis({
          url: `redis://${redisHost}:${redisPort}`,
        });

        return {
          stores: [keyvRedis],
          ttl: 0.5 * 60 * 1000, // 0.5 minutes
        };
      },
    }),
  ],
  providers: [RedisHealthService, RedisHelper],
  exports: [CacheModule, RedisHealthService, RedisHelper],
})
export class RedisCacheModule {}
