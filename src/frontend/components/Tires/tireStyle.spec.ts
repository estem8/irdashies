import { describe, expect, it } from 'vitest';
import { formatPressure } from './tireStyle';

describe('formatPressure', () => {
  it('converts the sim kPa to the unit shown', () => {
    expect(formatPressure(158.6, 'kPa')).toBe('159');
    expect(formatPressure(158.6, 'psi')).toBe('23.0');
    expect(formatPressure(100, 'bar')).toBe('1.00');
    expect(formatPressure(176, 'bar')).toBe('1.76');
  });
});
