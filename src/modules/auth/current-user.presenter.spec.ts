import { describe, expect, it } from 'vitest';
import type { MediaUrlService } from '../uploads/media-url.service.js';
import type { CurrentUser } from '../users/users.service.js';
import { CurrentUserPresenter } from './current-user.presenter.js';

// Bug 1072: la sesión lleva mi foto firmada, nunca la clave del blob.
const presenter = new CurrentUserPresenter({
  urlFor: (key: string) => `https://blob.test/${key}`,
} as MediaUrlService);

const user = (avatarKey: string | null): CurrentUser => ({
  id: 'u1',
  email: 'ana@est.intec.edu.do',
  role: 'STUDENT',
  verificationStatus: 'VERIFIED',
  createdAt: '2026-10-02T14:00:00.000Z',
  profile: { handle: 'ana', displayName: 'Ana', careerId: null, avatarKey },
});

describe('CurrentUserPresenter', () => {
  it('con foto, la firma y no expone la clave', () => {
    const view = presenter.toView(user('image/ana.jpg'));
    expect(view.profile.avatarUrl).toBe('https://blob.test/image/ana.jpg');
    expect(view.profile).not.toHaveProperty('avatarKey');
  });

  it('sin foto, avatarUrl es null', () => {
    expect(presenter.toView(user(null)).profile.avatarUrl).toBeNull();
  });
});
