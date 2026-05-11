import { Global, Module } from '@nestjs/common';
import { RedisService } from 'src/cache/redis.service';
import { PrismaService } from 'src/db/prisma.service';
import { SaleController } from './sale.controller';
import { SaleGateway } from './sale.gateway';
import { SaleService } from './sale.service';

@Global()
@Module({
  imports: [],
  controllers: [SaleController],
  providers: [PrismaService, RedisService, SaleService, SaleGateway],
  exports: [SaleGateway, SaleService],
})
export class SaleModule {}
