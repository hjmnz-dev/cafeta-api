import { describe, it, expect } from 'vitest';
import { pendingKeyOf } from './report-keys.js';

describe('pendingKeyOf', () => {
  it('arma USER:<id> para un usuario', () => {
    expect(pendingKeyOf('USER', 'abc')).toBe('USER:abc');
  });

  it('arma POST:<id> para una publicación', () => {
    expect(pendingKeyOf('POST', 'xyz')).toBe('POST:xyz');
  });

  it('cabe en el varchar(80) de la columna con un uuid', () => {
    const uuid = '0192f6a0-7b1e-7c3a-9d2f-0123456789ab';
    expect(pendingKeyOf('POST', uuid).length).toBeLessThanOrEqual(80);
  });
});
