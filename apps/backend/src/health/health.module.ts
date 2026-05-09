import { Global, Module } from '@nestjs/common';
import { RedisService } from 'src/cache/redis.service';
import { PrismaService } from 'src/db/prisma.service';
import { HealthController } from './health.controller';

@Global()
@Module({
  imports: [],
  controllers: [HealthController],
  providers: [PrismaService, RedisService],
})
export class HealthModule {}
