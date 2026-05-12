import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import {
  PURCHASE_CONFIRMED_PATTERN,
  type PurchaseConfirmedEvent,
} from './mq.constants';

@Controller()
export class PurchaseEventsConsumer {
  private readonly logger = new Logger(PurchaseEventsConsumer.name);

  @EventPattern(PURCHASE_CONFIRMED_PATTERN)
  handlePurchaseConfirmed(@Payload() event: PurchaseConfirmedEvent): void {
    this.logger.log(
      `[audit] order=${event.orderId} email=${event.email} ` +
        `remainingStock=${event.remainingStock} at=${event.occurredAt}`,
    );
  }
}
