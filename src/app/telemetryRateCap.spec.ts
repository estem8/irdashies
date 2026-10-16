import { describe, expect, it } from 'vitest';
import {
  applyTelemetryRateCap,
  getTelemetryRateCapHz,
  normalizeTelemetryRateCap,
  setTelemetryRateCapHz,
} from './telemetryRateCap';

describe('telemetryRateCap', () => {
  it('accepts only the listed options', () => {
    expect(normalizeTelemetryRateCap(30)).toBe(30);
    expect(normalizeTelemetryRateCap(5)).toBe(5);
    expect(normalizeTelemetryRateCap(0)).toBe(0);
    expect(normalizeTelemetryRateCap(45)).toBe(0);
    expect(normalizeTelemetryRateCap('30')).toBe(0);
    expect(normalizeTelemetryRateCap(undefined)).toBe(0);
  });

  it('keeps the value that was set', () => {
    setTelemetryRateCapHz(20);
    expect(getTelemetryRateCapHz()).toBe(20);
    setTelemetryRateCapHz('junk');
    expect(getTelemetryRateCapHz()).toBe(0);
  });

  it('lowers the wanted rate but never raises it', () => {
    expect(applyTelemetryRateCap(60, 30)).toBe(30);
    expect(applyTelemetryRateCap(25, 60)).toBe(25);
    expect(applyTelemetryRateCap(25, 5)).toBe(5);
    expect(applyTelemetryRateCap(60, 0)).toBe(60);
  });
});
