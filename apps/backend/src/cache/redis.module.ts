import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { ConfigService } from '@nestjs/config';

@Global()
@Module({
  imports: [],
  controllers: [],
  providers: [RedisService, ConfigService],
})
export class RedisModule {}
