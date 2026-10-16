import { orderedPair } from './conversation-queries.js';
import type { ConversationViewRow } from './conversation-queries.js';
import { toConversationView } from './conversation-view.mapper.js';

const A = '01926f00-0000-7000-8000-00000000000a';
const B = '01926f00-0000-7000-8000-00000000000b';

const user = (id: string) => ({
  id,
  verificationStatus: 'PENDING' as const,
  profile: {
    handle: id.slice(-1),
    displayName: id,
    avatarKey: null,
    career: null,
  },
});

function row(
  last: { senderId: string; createdAt: Date } | null,
  userALastReadAt: Date | null = null,
): ConversationViewRow {
  return {
    id: 'c1',
    userAId: A,
    userBId: B,
    userALastReadAt,
    userBLastReadAt: null,
    userA: user(A),
    userB: user(B),
    messages: last ? [{ id: 'm1', content: 'hola', ...last }] : [],
  };
}

describe('orderedPair', () => {
  it('pone el id menor en userAId sin importar el orden ni las mayúsculas', () => {
    expect(orderedPair(B, A)).toEqual({ userAId: A, userBId: B });
    expect(orderedPair(A.toUpperCase(), B)).toEqual({ userAId: A, userBId: B });
  });
});

const urlFor = (key: string) => `https://blob.test/${key}`;

describe('toConversationView', () => {
  const at = new Date('2026-10-06T12:00:00Z');

  it('muestra a la otra persona según quién mira', () => {
    expect(toConversationView(row(null), A, urlFor).otherUser.id).toBe(B);
    expect(toConversationView(row(null), B, urlFor).otherUser.id).toBe(A);
  });

  it('no leído solo si el último mensaje es del otro y es posterior a mi lectura', () => {
    expect(toConversationView(row(null), A, urlFor).unread).toBe(false);
    expect(
      toConversationView(row({ senderId: A, createdAt: at }), A, urlFor).unread,
    ).toBe(false);
    expect(
      toConversationView(row({ senderId: B, createdAt: at }), A, urlFor).unread,
    ).toBe(true);
    const readAfter = new Date(at.getTime() + 1);
    expect(
      toConversationView(
        row({ senderId: B, createdAt: at }, readAfter),
        A,
        urlFor,
      ).unread,
    ).toBe(false);
  });
});

describe('toConversationView · foto (bug 1072)', () => {
  it('lleva la foto firmada de la otra persona, o null si no tiene', () => {
    const base = row(null);
    const withPhoto = {
      ...base,
      userB: {
        ...base.userB,
        profile: { ...base.userB.profile!, avatarKey: 'image/b.jpg' },
      },
    };
    expect(toConversationView(withPhoto, A, urlFor).otherUser.avatarUrl).toBe(
      'https://blob.test/image/b.jpg',
    );
    expect(toConversationView(base, A, urlFor).otherUser.avatarUrl).toBeNull();
  });
});
