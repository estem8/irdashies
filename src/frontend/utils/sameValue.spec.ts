import { describe, expect, it } from 'vitest';
import { sameValue } from './sameValue';

describe('sameValue', () => {
  it('compares primitives, including NaN', () => {
    expect(sameValue(1, 1)).toBe(true);
    expect(sameValue(Number.NaN, Number.NaN)).toBe(true);
    expect(sameValue(1, 2)).toBe(false);
    expect(sameValue('a', 'a')).toBe(true);
    expect(sameValue(null, undefined)).toBe(false);
  });

  it('treats new objects with the same contents as equal', () => {
    const make = () => ({ gap: { value: 1.5, laps: 0 }, tags: ['a', 'b'] });
    expect(sameValue(make(), make())).toBe(true);
  });

  it('finds a difference at any depth', () => {
    expect(sameValue({ a: { b: { c: 1 } } }, { a: { b: { c: 2 } } })).toBe(
      false
    );
    expect(sameValue({ a: [1, 2, 3] }, { a: [1, 2, 4] })).toBe(false);
    expect(sameValue([1, 2], [1, 2, 3])).toBe(false);
  });

  it('tells apart missing keys from undefined values', () => {
    expect(sameValue({ a: undefined }, { b: undefined })).toBe(false);
    expect(sameValue({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it('does not equate an array with an object', () => {
    expect(sameValue([], {})).toBe(false);
  });
});
