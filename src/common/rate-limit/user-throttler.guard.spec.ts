import { Reflector } from '@nestjs/core';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { UserThrottlerGuard } from './user-throttler.guard.js';

// Clave del límite de publicaciones (spec 0005, AC-12): por usuario, no por IP.
class ExposedGuard extends UserThrottlerGuard {
  tracker(req: Record<string, unknown>): Promise<string> {
    return this.getTracker(req);
  }
}

const guard = new ExposedGuard([], {} as ThrottlerStorage, new Reflector());

describe('UserThrottlerGuard', () => {
  it('AC-12: con sesión cuenta por el id del usuario', async () => {
    const tracker = await guard.tracker({
      user: { id: 'u-1', role: 'STUDENT', sessionId: 's-1' },
      ip: '10.0.0.7',
      ips: [],
    });
    expect(tracker).toBe('user:u-1');
  });

  it('AC-12: dos usuarios detrás de la misma IP tienen contadores distintos', async () => {
    const a = await guard.tracker({
      user: { id: 'u-1' },
      ip: '10.0.0.7',
      ips: [],
    });
    const b = await guard.tracker({
      user: { id: 'u-2' },
      ip: '10.0.0.7',
      ips: [],
    });
    expect(a).not.toBe(b);
  });

  it('sin usuario cae en la IP, como el guard base', async () => {
    const tracker = await guard.tracker({ ip: '10.0.0.7', ips: [] });
    expect(tracker).toBe('10.0.0.7');
  });
});
