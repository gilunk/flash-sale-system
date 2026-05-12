import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { BusinessErrorFilter } from './common/filters/business-error.filter';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = new DocumentBuilder()
    .setTitle('Flash Sale System API')
    .setDescription('Backend API for the flash sale system')
    .setVersion('1.0')
    .build();

  app.setGlobalPrefix('api');
  app.enableCors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:3201' });
  app.useGlobalFilters(new BusinessErrorFilter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  // Hybrid app: same Nest process serves HTTP (REST + WebSocket) AND consumes
  // RabbitMQ events. The @EventPattern handlers in MqModule only fire after
  // startAllMicroservices() — without this, the queue would still receive
  // published messages but nothing would consume them.
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [process.env.RABBITMQ_URL ?? 'amqp://flashsale:flashsale@localhost:5672'],
      queue: process.env.RABBITMQ_PURCHASE_QUEUE ?? 'purchase.events',
      queueOptions: { durable: true },
      noAck: false,
    },
  });

  await app.startAllMicroservices();
  await app.listen(process.env.NEST_PORT ?? 3200);
}
bootstrap();
