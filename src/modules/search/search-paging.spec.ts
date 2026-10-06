import { inOrderOf, windowAfter } from './search-paging.js';

const IDS = ['a', 'b', 'c', 'd', 'e'];

describe('search-paging', () => {
  it('da la primera página y avisa si hay más', () => {
    expect(windowAfter(IDS, undefined, 2)).toEqual({
      ok: true,
      ids: ['a', 'b'],
      hasMore: true,
    });
  });

  it('sigue después del cursor y termina sin más', () => {
    expect(windowAfter(IDS, 'b', 2)).toEqual({
      ok: true,
      ids: ['c', 'd'],
      hasMore: true,
    });
    expect(windowAfter(IDS, 'd', 2)).toEqual({
      ok: true,
      ids: ['e'],
      hasMore: false,
    });
    expect(windowAfter(IDS, 'c', 2)).toMatchObject({ hasMore: false });
  });

  it('un cursor fuera de la lista es inválido', () => {
    expect(windowAfter(IDS, 'zzz', 2)).toEqual({ ok: false });
  });

  it('una lista vacía no tiene páginas', () => {
    expect(windowAfter([], undefined, 20)).toEqual({
      ok: true,
      ids: [],
      hasMore: false,
    });
  });

  it('reordena las filas según los ids y descarta las que faltan', () => {
    const rows = [{ id: 'c' }, { id: 'a' }];
    expect(inOrderOf(['a', 'b', 'c'], rows)).toEqual([
      { id: 'a' },
      { id: 'c' },
    ]);
  });
});
