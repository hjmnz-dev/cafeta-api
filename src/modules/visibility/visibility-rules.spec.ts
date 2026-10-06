import {
  canFollow,
  canSeeContent,
  canSeeProfile,
  contentVisibleTo,
  type VisibilityFacts,
} from './visibility-rules.js';

// La regla de la decisión 15 como tabla de casos. Las e2e la prueban contra
// PostgreSQL; aquí se fija cada combinación.
const STRANGER: VisibilityFacts = {
  isSelf: false,
  ownerActive: true,
  visibility: 'PUBLIC',
  followStatus: null,
  blocked: false,
};

describe('canSeeContent', () => {
  it.each([
    ['PUBLIC', null, true],
    ['PUBLIC', 'PENDING', true],
    ['FOLLOWERS', null, false],
    ['FOLLOWERS', 'PENDING', false],
    ['FOLLOWERS', 'ACCEPTED', true],
    ['PRIVATE', null, false],
    ['PRIVATE', 'ACCEPTED', false],
  ] as const)('%s con seguimiento %s → %s', (visibility, followStatus, ok) => {
    expect(canSeeContent({ ...STRANGER, visibility, followStatus })).toBe(ok);
  });

  it('el dueño siempre ve lo suyo, aunque sea PRIVATE', () => {
    expect(
      canSeeContent({ ...STRANGER, isSelf: true, visibility: 'PRIVATE' }),
    ).toBe(true);
  });

  it('un bloqueo o una cuenta desactivada lo ocultan todo, aunque sea PUBLIC', () => {
    expect(canSeeContent({ ...STRANGER, blocked: true })).toBe(false);
    expect(canSeeContent({ ...STRANGER, ownerActive: false })).toBe(false);
  });
});

describe('canSeeProfile', () => {
  it('el perfil limitado se ve aunque el contenido no', () => {
    expect(canSeeProfile({ ...STRANGER, visibility: 'PRIVATE' })).toBe(true);
  });

  it('con bloqueo o cuenta desactivada no se ve', () => {
    expect(canSeeProfile({ ...STRANGER, blocked: true })).toBe(false);
    expect(canSeeProfile({ ...STRANGER, ownerActive: false })).toBe(false);
  });
});

describe('canFollow', () => {
  it('PUBLIC y FOLLOWERS muestran Seguir; PRIVATE y el propio perfil no', () => {
    expect(canFollow(STRANGER)).toBe(true);
    expect(canFollow({ ...STRANGER, visibility: 'FOLLOWERS' })).toBe(true);
    expect(canFollow({ ...STRANGER, visibility: 'PRIVATE' })).toBe(false);
    expect(canFollow({ ...STRANGER, isSelf: true })).toBe(false);
  });
});

describe('contentVisibleTo', () => {
  const ME = '01926f00-0000-7000-8000-000000000001';

  it('deja pasar lo propio y exige seguimiento ACCEPTED solo en FOLLOWERS', () => {
    const where = contentVisibleTo(ME);
    expect(where.OR?.[0]).toEqual({ id: ME });
    const text = JSON.stringify(where);
    expect(text).toContain('"visibility":"PUBLIC"');
    expect(text).toContain('"visibility":"FOLLOWERS"');
    expect(text).not.toContain('PRIVATE');
    expect(text).toContain('"status":"ACCEPTED"');
  });

  it('excluye bloqueos activos en las dos direcciones', () => {
    const text = JSON.stringify(contentVisibleTo(ME));
    expect(text).toContain(
      `"blocksMade":{"none":{"blockedId":"${ME}","deactivatedAt":null}}`,
    );
    expect(text).toContain(
      `"blocksReceived":{"none":{"blockerId":"${ME}","deactivatedAt":null}}`,
    );
  });
});
