import { describe, expect, it } from 'vitest';
import { getWidgetDefaultConfig, type RadarConfig } from '@irdashies/types';
import { normaliseRadarConfig } from './useRadarSettings';

const defaults = getWidgetDefaultConfig('radar');

describe('normaliseRadarConfig', () => {
  it('replaces malformed persisted fields with safe typed values', () => {
    const result = normaliseRadarConfig({
      ...defaults,
      radarRange: Number.POSITIVE_INFINITY,
      vehicleWidth: null,
      vehicleLength: 'bad',
      fadeSeconds: Number.NaN,
      rivalColorMode: 'unknown',
      sideIndicatorStyle: 'soft-glow',
      colorRival: 'not-a-color',
      background: null,
      sessionVisibility: null,
    } as unknown as RadarConfig);

    expect(result.radarRange).toBe(defaults.radarRange);
    expect(result.vehicleWidth).toBe(defaults.vehicleWidth);
    expect(result.vehicleLength).toBe(defaults.vehicleLength);
    expect(result.fadeSeconds).toBe(defaults.fadeSeconds);
    expect(result.rivalColorMode).toBe(defaults.rivalColorMode);
    expect(result.sideIndicatorStyle).toBe(defaults.sideIndicatorStyle);
    expect(result.colorRival).toBe(defaults.colorRival);
    expect(result.background).toEqual(defaults.background);
    expect(result.sessionVisibility).toEqual(defaults.sessionVisibility);
  });
});
