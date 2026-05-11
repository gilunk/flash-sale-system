import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { SaleStatusDto } from './dto/sale-status.dto';

@WebSocketGateway({
  namespace: '/sale-stream',
  cors: {
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3201',
    credentials: true,
  },
})
export class SaleGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(SaleGateway.name);

  @WebSocketServer()
  private server!: Server;

  handleConnection(client: Socket): void {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // Called by SaleService after a successful purchase. Pushes the fresh
  // status to all connected clients in one shot.
  emitStatus(status: SaleStatusDto): void {
    this.server.emit('sale:status', status);
  }
}
