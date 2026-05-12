import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  PURCHASE_CONFIRMED_PATTERN,
  PURCHASE_MQ,
  PurchaseConfirmedEvent,
} from './mq.constants';

@Injectable()
export class PurchaseEventsPublisher {
  private readonly logger = new Logger(PurchaseEventsPublisher.name);

  constructor(@Inject(PURCHASE_MQ) private readonly client: ClientProxy) {}

  // Fire-and-forget. The .emit() call returns an Observable; subscribing
  // sends the message but we don't await the broker's ack — the user's
  // purchase response is not blocked on queue confirmation. If the broker
  // is down we log and move on; the order is already committed in Postgres.
  publishPurchaseConfirmed(event: PurchaseConfirmedEvent): void {
    this.client.emit(PURCHASE_CONFIRMED_PATTERN, event).subscribe({
      error: (err) =>
        this.logger.warn(
          `Failed to publish ${PURCHASE_CONFIRMED_PATTERN}: ${err?.message ?? err}`,
        ),
    });
  }
}
