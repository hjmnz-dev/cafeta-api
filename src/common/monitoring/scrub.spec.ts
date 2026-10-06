import type { ErrorEvent } from '@sentry/node';
import { Prisma } from '../../generated/prisma/client.js';
import { scrubEvent } from './scrub.js';

const fullEvent = (): ErrorEvent => ({
  type: undefined,
  server_name: 'cafeta-api-hj01',
  request: {
    method: 'POST',
    url: 'https://api/api/v1/posts?token=abc',
    data: { content: 'texto privado' },
    headers: { Authorization: 'Bearer x', Cookie: 'a=b' },
    cookies: { a: 'b' },
    query_string: 'token=abc',
  },
  user: { id: 'u-1', email: 'ana@est.intec.edu.do', ip_address: '1.2.3.4' },
  breadcrumbs: [{ message: 'paso previo' }],
  exception: {
    values: [
      { type: 'Error', value: 'causa enlazada' },
      { type: 'Error', value: 'principal' },
    ],
  },
});

describe('scrubEvent', () => {
  it('deja solo el método, la URL sin query y el id del usuario', () => {
    const scrubbed = scrubEvent(fullEvent(), {
      originalException: new Error('principal'),
    });
    expect(scrubbed.request).toEqual({
      method: 'POST',
      url: 'https://api/api/v1/posts',
    });
    expect(scrubbed.user).toEqual({ id: 'u-1' });
    expect(scrubbed.server_name).toBeUndefined();
    expect(scrubbed.breadcrumbs).toBeUndefined();
    expect(scrubbed.exception?.values).toHaveLength(2);
  });

  it('quita el mensaje de un error de Prisma y la cadena enlazada', () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed: Key (email)=(x@y)',
      { code: 'P2002', clientVersion: '7.0.0' },
    );
    const scrubbed = scrubEvent(fullEvent(), { originalException: error });
    expect(scrubbed.exception?.values).toEqual([
      { type: 'Error', value: 'PrismaClientKnownRequestError P2002' },
    ]);
    expect(JSON.stringify(scrubbed)).not.toContain('x@y');
  });

  it('quita el mensaje de un DatabaseError de pg', () => {
    class DatabaseError extends Error {
      code = '23505';
    }
    const scrubbed = scrubEvent(fullEvent(), {
      originalException: new DatabaseError('Key (email)=(x@y)'),
    });
    expect(scrubbed.exception?.values?.[0]?.value).toBe('DatabaseError 23505');
  });
});
