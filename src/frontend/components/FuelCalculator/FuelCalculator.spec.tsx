import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FuelCalculation } from './types';
import { FuelCalculator } from './FuelCalculator';

const mounts = vi.hoisted(() => new Map<string, number>());

vi.mock('@irdashies/context', () => ({
  useDashboard: () => ({ editMode: false, currentDashboard: undefined }),
  useFuelProjectionSnapshot: () => undefined,
}));
vi.mock('./useFuelCalculation', () => ({
  useFuelCalculation: () => undefined,
}));
// Each section records how many times it was mounted, not rendered.
vi.mock('./widgets/FuelCalculatorWidgets', async () => {
  const { useEffect: effect } = await import('react');
  const section = (name: string) => {
    const Section = () => {
      effect(() => {
        mounts.set(name, (mounts.get(name) ?? 0) + 1);
      }, []);
      return <div data-testid={name} />;
    };
    return Section;
  };
  return {
    FuelCalculatorHeader: section('header'),
    FuelCalculatorGauge: section('gauge'),
    FuelCalculatorConsumptionGrid: section('grid'),
    FuelCalculatorPitScenarios: section('scenarios'),
    FuelCalculatorTimeEmpty: section('timeEmpty'),
    FuelHistory: section('history'),
    FuelCalculatorTargetMessage: section('targetMessage'),
    FuelCalculatorConfidence: section('confidence'),
    FuelCalculatorEconomyPredict: section('economyPredict'),
    FuelCalculatorFinishFuel: section('finishFuel'),
  };
});

const data = (fuelLevel: number) =>
  ({
    fuelLevel,
    currentLap: 3,
    lastLapUsage: 2,
    avgLaps: 2,
    lapsRemaining: 10,
    fuelStatus: 'safe',
  }) as unknown as FuelCalculation;

beforeEach(() => mounts.clear());

describe('FuelCalculator', () => {
  it('keeps its sections mounted while the fuel data changes', () => {
    const view = render(
      <FuelCalculator showOnlyWhenOnTrack={false} previewData={data(40)} />
    );
    expect(mounts.size).toBeGreaterThan(0);
    const mountedOnce = new Map(mounts);

    // The projection publishes about five times a second.
    for (let level = 39; level > 35; level -= 1) {
      view.rerender(
        <FuelCalculator showOnlyWhenOnTrack={false} previewData={data(level)} />
      );
    }

    expect(mounts).toEqual(mountedOnce);
    expect([...mounts.values()].every((count) => count === 1)).toBe(true);
  });
});
