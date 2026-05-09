import { ApiProperty } from '@nestjs/swagger';

export class DependencyHealthDto {
  @ApiProperty({
    description: 'Whether the dependency responded successfully',
    example: true,
  })
  ok!: boolean;

  @ApiProperty({
    description: 'Error message returned when the dependency check failed',
    required: false,
    example: 'connect ECONNREFUSED 127.0.0.1:5432',
  })
  error?: string;
}

export class HealthResponseDto {
  @ApiProperty({
    description: 'Overall service health status',
    enum: ['ok', 'degraded'],
    example: 'ok',
  })
  status!: 'ok' | 'degraded';

  @ApiProperty({ type: DependencyHealthDto, description: 'Database health' })
  db!: DependencyHealthDto;

  @ApiProperty({ type: DependencyHealthDto, description: 'Redis health' })
  redis!: DependencyHealthDto;

  @ApiProperty({
    description:
      'HTTP status code surfaced when the service is degraded. Omitted when healthy.',
    required: false,
    example: 503,
  })
  statusCode?: number;
}
