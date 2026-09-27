import { isTokenPayload } from './token-payload.js';

// Forma mínima del JWT antes de tocar la base (spec 0004, flujo del guard).
const SUB = '01926f00-0000-7000-8000-000000000001';
const JTI = '01926f00-0000-7000-8000-0000000000a1';

describe('isTokenPayload', () => {
  it('acepta un payload con sub y jti como UUID', () => {
    expect(isTokenPayload({ sub: SUB, jti: JTI, role: 'STUDENT' })).toBe(true);
  });

  it.each([
    ['null', null],
    ['un texto', 'token'],
    ['un objeto vacío', {}],
    ['sin jti', { sub: SUB }],
    ['sin sub', { jti: JTI }],
    ['sub que no es UUID', { sub: 'admin', jti: JTI }],
    ['jti que no es UUID', { sub: SUB, jti: '1' }],
    ['sub numérico', { sub: 1, jti: JTI }],
    ['UUID con texto extra', { sub: `${SUB}x`, jti: JTI }],
  ])('rechaza %s', (_caso, value) => {
    expect(isTokenPayload(value)).toBe(false);
  });
});
