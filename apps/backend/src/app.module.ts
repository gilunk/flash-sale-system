import { Module } from '@nestjs/common';
import { RedisModule } from './cache/redis.module';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { DbModule } from './db/db.module';
import { SaleModule } from './sale/sale.module';
import { CommandModule } from './command/command.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DbModule,
    SaleModule,
    RedisModule,
    HealthModule,
    CommandModule
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
