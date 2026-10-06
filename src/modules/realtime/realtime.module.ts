import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RealtimeGateway } from './realtime.gateway.js';
import { RealtimePublisher } from './realtime.publisher.js';

// Tiempo real con Socket.io (spec 0008, decisión 25). Una sola instancia en el
// plan B1, así que no hace falta adaptador de Redis.
@Module({
  imports: [AuthModule],
  providers: [RealtimeGateway, RealtimePublisher],
  exports: [RealtimePublisher],
})
export class RealtimeModule {}
