import { Injectable } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway.js';
import {
  userRoom,
  type ServerEventName,
  type ServerEvents,
} from './realtime-events.js';

// Lo que usan los services para avisar en tiempo real. Se llama después de
// confirmar la transacción, nunca dentro: un evento no puede anunciar algo que
// la base deshizo.
@Injectable()
export class RealtimePublisher {
  constructor(private readonly gateway: RealtimeGateway) {}

  toUsers<E extends ServerEventName>(
    userIds: readonly string[],
    event: E,
    payload: ServerEvents[E],
  ): void {
    if (userIds.length === 0) return;
    this.gateway.server.to(userIds.map(userRoom)).emit(event, payload);
  }
}
