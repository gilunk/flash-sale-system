import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { PURCHASE_MQ } from './mq.constants';
import { PurchaseEventsConsumer } from './purchase-events.consumer';
import { PurchaseEventsPublisher } from './purchase-events.publisher';

@Global()
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: PURCHASE_MQ,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [config.getOrThrow<string>('RABBITMQ_URL') ?? 'amqp://flashsale:flashsale@localhost:5672'],
            queue:
              config.get<string>('RABBITMQ_PURCHASE_QUEUE') ?? 'purchase.events',
            queueOptions: { durable: true },
          },
        }),
      },
    ]),
  ],
  controllers: [PurchaseEventsConsumer],
  providers: [PurchaseEventsPublisher],
  exports: [PurchaseEventsPublisher],
})
export class MqModule {}
