import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis.Redis;

  constructor(
    private readonly configService: ConfigService
  ) {}

  async onModuleInit(): Promise<void> {
    const redisUrl = this.configService.get<string>('REDIS_URL');

    if (!redisUrl) {
      throw new Error('REDIS_URL is not defined');
    }

    this.client = new Redis.Redis(redisUrl);

    this.client.on('ready', () => {
      this.logger.log('Redis connection established');
    });

    this.client.on('error', (error) => {
      this.logger.error('Redis connection error', error);
    });

    await this.client.ping();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit();

      this.logger.log('Redis connection closed');
    }
  }

  getClient(): Redis.Redis {
    return this.client;
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }

  async getJSON<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);

    if (!value) {
      return null;
    }

    return JSON.parse(value) as T;
  }

  async setJSON<T>(
    key: string,
    value: T,
    ttlMs: number,
  ): Promise<'OK' | null> {
    return this.client.set(
      key,
      JSON.stringify(value),
      'PX',
      ttlMs,
    );
  }
}
