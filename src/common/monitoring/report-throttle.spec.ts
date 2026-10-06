import { ReportThrottle, throttleKey } from './report-throttle.js';

describe('ReportThrottle', () => {
  it('deja pasar 10 de la misma clave por minuto y rechaza el 11.º', () => {
    const throttle = new ReportThrottle();
    const results = Array.from({ length: 11 }, () => throttle.allow('a', 0));
    expect(results.filter(Boolean)).toHaveLength(10);
    expect(results[10]).toBe(false);
  });

  it('cuenta cada clave por separado', () => {
    const throttle = new ReportThrottle();
    for (let i = 0; i < 10; i++) throttle.allow('a', 0);
    expect(throttle.allow('b', 0)).toBe(true);
  });

  it('vuelve a dejar pasar pasados 60 segundos', () => {
    const throttle = new ReportThrottle();
    for (let i = 0; i < 11; i++) throttle.allow('a', 0);
    expect(throttle.allow('a', 59_999)).toBe(false);
    expect(throttle.allow('a', 60_000)).toBe(true);
  });
});

describe('throttleKey', () => {
  it('usa el tipo más el mensaje', () => {
    expect(throttleKey(new TypeError('boom'))).toBe('TypeError:boom');
  });
});
