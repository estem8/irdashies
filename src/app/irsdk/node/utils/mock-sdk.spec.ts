import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { TelemetryVarList } from '../../types';
import { MockSDK } from './mock-sdk';

vi.mock('../../../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const decode = (
  view: DataView,
  varType: number,
  offset: number,
  index: number
): number | boolean => {
  if (varType === 1) return view.getUint8(offset + index) !== 0;
  if (varType === 4) return view.getFloat32(offset + index * 4, true);
  if (varType === 5) return view.getFloat64(offset + index * 8, true);
  return view.getInt32(offset + index * 4, true);
};

describe('MockSDK row buffer', () => {
  let sdk: MockSDK;

  beforeAll(async () => {
    sdk = new MockSDK();
    sdk.startSDK();
    await vi.waitFor(() => expect(sdk.isRunning()).toBe(true));
  });

  it('reports a layout version once the data is loaded', () => {
    expect(sdk.getTelemetryLayoutVersion()).toBe(1);
  });

  it('asks for a bigger buffer when the target is too small', () => {
    const needed = -sdk.copyTelemetryBuffer(new ArrayBuffer(0));
    expect(needed).toBeGreaterThan(0);
    expect(sdk.copyTelemetryBuffer(new ArrayBuffer(needed - 1))).toBe(-needed);
    expect(sdk.copyTelemetryBuffer(new ArrayBuffer(needed))).toBe(needed);
  });

  it('lays variables out without overlap and aligned to their size', () => {
    const bytes: Record<number, number> = { 1: 1, 2: 4, 3: 4, 4: 4, 5: 8 };
    let end = 0;
    for (const { varType, count, offset } of sdk.getTelemetryLayout()) {
      expect(offset % bytes[varType]).toBe(0);
      expect(offset).toBeGreaterThanOrEqual(end);
      end = offset + count * bytes[varType];
    }
    expect(end).toBe(-sdk.copyTelemetryBuffer(new ArrayBuffer(0)));
  });

  it('decodes to the values of the legacy getTelemetryData path', () => {
    const buffer = new ArrayBuffer(
      -sdk.copyTelemetryBuffer(new ArrayBuffer(0))
    );
    sdk.copyTelemetryBuffer(buffer);
    const view = new DataView(buffer);
    const legacy = sdk.getTelemetryData();
    const layout = sdk.getTelemetryLayout();

    expect(layout.map(({ name }) => name).sort()).toEqual(
      Object.keys(legacy).sort()
    );
    for (const { name, varType, count, offset } of layout) {
      const expected = legacy[name as keyof TelemetryVarList].value as (
        number | boolean
      )[];
      expect(count).toBe(expected.length);
      for (let i = 0; i < count; i++) {
        const want =
          varType === 4 ? Math.fround(Number(expected[i])) : expected[i];
        expect(decode(view, varType, offset, i), `${name}[${i}]`).toBe(want);
      }
    }
  });
});
