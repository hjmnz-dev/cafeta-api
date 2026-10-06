import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayInit,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { AccessTokenService } from '../auth/access-token.service.js';
import { userRoom } from './realtime-events.js';
import { socketToken } from './socket-token.js';

interface SocketData {
  userId: string;
}

// Único canal de tiempo real de la API (spec 0008, decisión 25). Solo
// autentica y agrupa por usuario: el cliente no envía nada por aquí, todo
// cambio entra por REST y se emite con RealtimePublisher.
@WebSocketGateway()
export class RealtimeGateway implements OnGatewayInit {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly tokens: AccessTokenService) {}

  // El middleware corre antes de aceptar la conexión: sin token válido, el
  // cliente recibe connect_error con el code y nunca entra a una sala.
  afterInit(server: Server): void {
    server.use((socket: Socket, next) => {
      this.tokens
        .authenticate(socketToken(socket.handshake.auth))
        .then(async (user) => {
          (socket.data as SocketData).userId = user.id;
          await socket.join(userRoom(user.id));
          next();
        })
        .catch((error: unknown) => {
          const code = codeOf(error);
          this.logger.debug(`Socket rechazado: ${code}`);
          next(Object.assign(new Error(code), { data: { code } }));
        });
    });
  }
}

function codeOf(error: unknown): string {
  const response = (error as { getResponse?: () => unknown }).getResponse?.();
  const code = (response as { code?: unknown } | undefined)?.code;
  return typeof code === 'string' ? code : 'UNAUTHORIZED';
}
