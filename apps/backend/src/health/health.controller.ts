import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RedisService } from '../cache/redis.service';
import { PrismaService } from 'src/db/prisma.service';
import { HealthResponseDto } from './dto/health-response.dto';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Service health check',
    description:
      'Reports liveness of the service together with the status of its critical dependencies (PostgreSQL and Redis).',
  })
  @ApiOkResponse({
    description: 'All dependencies are reachable.',
    type: HealthResponseDto,
  })
  @ApiServiceUnavailableResponse({
    description:
      'One or more dependencies are unreachable. The response shape matches HealthResponseDto with `status: "degraded"`.',
    type: HealthResponseDto,
  })
  async checkHealth(): Promise<HealthResponseDto> {
    const [dbResult, redisResult] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    const isHealthy = dbResult.ok && redisResult.ok;

    const response: HealthResponseDto = {
      status: isHealthy ? 'ok' : 'degraded',
      db: dbResult,
      redis: redisResult,
    };

    if (!isHealthy) {
      return {
        ...response,
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      };
    }

    return response;
  }

  private async checkDatabase() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;

      return {
        ok: true,
      };
    } catch (e) {
      return {
        ok: false,
        error: e.message,
      };
    }
  }

  private async checkRedis() {
    try {
      await this.redis.ping();

      return {
        ok: true,
      };
    } catch (e) {
      return {
        ok: false,
        error: e.message,
      };
    }
  }
}
