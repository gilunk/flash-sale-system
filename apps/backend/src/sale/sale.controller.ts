import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from "@nestjs/swagger";
import { IdempotencyKey } from "src/common/pipes/idempotency-key.pipe";
import { PurchaseRequestDto, PurchaseResponseDto } from "./dto/purchase.dto";
import { SaleStatusDto } from "./dto/sale-status.dto";
import { SaleService } from "./sale.service";

@ApiTags('Sale')
@Controller('sale')
export class SaleController {
  constructor(private readonly sale: SaleService) {}

  @Get('status')
  @ApiOperation({
    summary: 'Get the current state of the flash sale',
    description:
      'Returns the active sale (most recent row in the sales table) along with its derived state (PENDING / ACTIVE / ENDED / SOLD_OUT). Cached in Redis with a short TTL.',
  })
  @ApiOkResponse({ type: SaleStatusDto })
  @ApiServiceUnavailableResponse({
    description: 'No sale exists in the database.',
  })
  async status(): Promise<SaleStatusDto> {
    return await this.sale.getStatus();
  }

  @Post('purchase')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Attempt to purchase one item from the flash sale',
    description:
      'Atomically decrements stock and records an order. The Idempotency-Key header makes retries safe — replaying the same key returns the original order. The unique (user_id, sale_id) index enforces the one-item-per-user rule.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'A client-generated UUID v4 unique to this purchase attempt.',
    example: '11111111-1111-4111-8111-111111111111',
  })
  @ApiCreatedResponse({ type: PurchaseResponseDto })
  @ApiBadRequestResponse({
    description: 'Missing/invalid Idempotency-Key header or invalid email.',
  })
  @ApiConflictResponse({
    description:
      'Business error. Body shape: { error: "SALE_NOT_STARTED" | "SALE_ENDED" | "SOLD_OUT" | "ALREADY_PURCHASED" }.',
  })
  async purchase(
    @Body() body: PurchaseRequestDto,
    @IdempotencyKey() idempotencyKey?: string,
  ): Promise<PurchaseResponseDto> {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required.');
    }
    return await this.sale.purchase(body, idempotencyKey);
  }
}
