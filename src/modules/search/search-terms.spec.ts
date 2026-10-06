import {
  isSearchable,
  queryTerms,
  SEARCH_MAX_TERMS,
  toLikePattern,
} from './search-terms.js';

describe('search-terms', () => {
  it('separa en palabras sin espacios de sobra y con tope', () => {
    expect(queryTerms('  ana   gómez ')).toEqual(['ana', 'gómez']);
    expect(queryTerms('a b c d e f g h')).toHaveLength(SEARCH_MAX_TERMS);
    expect(queryTerms('   ')).toEqual([]);
  });

  it('exige al menos 2 caracteres sin contar los bordes', () => {
    expect(isSearchable('a')).toBe(false);
    expect(isSearchable('  a  ')).toBe(false);
    expect(isSearchable('jo')).toBe(true);
    // Un emoji es un solo carácter.
    expect(isSearchable('😀')).toBe(false);
  });

  it('escapa los comodines de LIKE para que sean texto', () => {
    expect(toLikePattern('jose')).toBe('%jose%');
    expect(toLikePattern('100%')).toBe('%100\\%%');
    expect(toLikePattern('a_b')).toBe('%a\\_b%');
    expect(toLikePattern('a\\b')).toBe('%a\\\\b%');
  });
});
