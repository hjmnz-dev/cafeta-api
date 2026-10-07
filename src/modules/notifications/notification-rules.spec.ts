import { preferenceOf, shouldNotify } from './notification-rules.js';

const ALL_ON = {
  reactions: true,
  comments: true,
  follows: true,
  messages: true,
  stories: true,
};

describe('notification-rules', () => {
  it('asigna cada tipo a su interruptor (spec 0002)', () => {
    expect(preferenceOf('POST_REACTION')).toBe('reactions');
    expect(preferenceOf('POST_COMMENT')).toBe('comments');
    expect(preferenceOf('STORY_REACTION')).toBe('stories');
    expect(preferenceOf('STORY_COMMENT')).toBe('stories');
    expect(preferenceOf('FOLLOW')).toBe('follows');
    expect(preferenceOf('FOLLOW_REQUEST')).toBe('follows');
    expect(preferenceOf('FOLLOW_ACCEPTED')).toBe('follows');
    expect(preferenceOf('MESSAGE')).toBe('messages');
    expect(preferenceOf('VERIFICATION_RESULT')).toBeNull();
  });

  it('no avisa a quien hizo la acción', () => {
    expect(shouldNotify('FOLLOW', 'a', 'a', ALL_ON)).toBe(false);
  });

  it('apagar comentarios solo corta los comentarios (HU08 E1)', () => {
    const prefs = { ...ALL_ON, comments: false };
    expect(shouldNotify('POST_COMMENT', 'a', 'b', prefs)).toBe(false);
    expect(shouldNotify('POST_REACTION', 'a', 'b', prefs)).toBe(true);
    expect(shouldNotify('MESSAGE', 'a', 'b', prefs)).toBe(true);
  });

  it('el resultado de verificación siempre llega y sin fila todo está encendido', () => {
    const none = {
      reactions: false,
      comments: false,
      follows: false,
      messages: false,
      stories: false,
    };
    expect(shouldNotify('VERIFICATION_RESULT', 'a', null, none)).toBe(true);
    expect(shouldNotify('MESSAGE', 'a', 'b', null)).toBe(true);
  });
});
