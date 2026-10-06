import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Server, ServerOptions } from 'socket.io';

// Mismo CORS que la API REST: solo la web y el admin pueden abrir el socket.
export class SocketIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly origins: string[],
  ) {
    super(app);
  }

  // Nest pasa solo las opciones del gateway; socket.io completa el resto con
  // sus valores por defecto, por eso el tipo completo se afirma aquí.
  override createIOServer(
    port: number,
    options?: Partial<ServerOptions>,
  ): Server {
    const withCors = {
      ...options,
      cors: { origin: this.origins, credentials: true },
    } as ServerOptions;
    return super.createIOServer(port, withCors);
  }
}
