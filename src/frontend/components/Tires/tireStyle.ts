import type { TireCornerSnapshot } from '@irdashies/types';

/** Green at the optimum, fading to blue when colder and red when hotter. */
export const tempColor = (celsius: number, optimal: number, range: number) => {
  const away = Math.min(1, Math.abs(celsius - optimal) / range);
  const hue = celsius < optimal ? 120 + 90 * away : 120 - 120 * away;
  return `hsl(${Math.round(hue)} 100% 50%)`;
};

/** White while there is plenty of tread, yellow as it runs down, red at the limit. */
export const wearClass = (percent: number, limit: number) =>
  percent <= limit
    ? 'text-red-500'
    : percent <= limit + 20
      ? 'text-yellow-300'
      : 'text-white';

/** Whole laps until the worst zone reaches the limit, if a rate is known. */
export const lapsLeft = (tire: TireCornerSnapshot, limit: number) => {
  if (!tire.wearPerLap) return undefined;
  const laps = tire.wearPerLap
    .map((rate, i) => (rate > 0 ? (tire.wear[i] - limit) / rate : Infinity))
    .reduce((a, b) => Math.min(a, b), Infinity);
  return Number.isFinite(laps) ? Math.max(0, Math.floor(laps)) : undefined;
};

/** Pressure in the unit shown; the sim reports kPa. */
export const formatPressure = (kpa: number, unit: 'kPa' | 'psi') =>
  unit === 'psi' ? (kpa * 0.145038).toFixed(1) : kpa.toFixed(0);
