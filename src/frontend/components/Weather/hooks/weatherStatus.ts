import type { ForecastHour } from './forecast';

export interface SurfaceStatus {
  label: string;
  className: string;
}

/** iRacing TrackWetness: 1 dry .. 7 extremely wet, 0 unknown. */
export const surfaceStatus = (wetness: number | undefined): SurfaceStatus => {
  if (!wetness) return { label: '--', className: 'bg-slate-600 text-white' };
  if (wetness <= 2)
    return { label: 'DRY', className: 'bg-emerald-400 text-slate-950' };
  if (wetness <= 4)
    return { label: 'DAMP', className: 'bg-amber-400 text-slate-950' };
  return { label: 'WET', className: 'bg-sky-400 text-slate-950' };
};

const TREND_STEP = 2;

/** Air temperature change over the forecast window as an arrow. */
export const tempTrend = (
  airTemp: number | undefined,
  forecast: readonly ForecastHour[]
): { arrow: string; className: string } => {
  const last = forecast[forecast.length - 1];
  if (airTemp === undefined || !last) {
    return { arrow: '→', className: 'text-white/40' };
  }
  const diff = last.airTemp - airTemp;
  if (diff >= TREND_STEP) return { arrow: '↑', className: 'text-orange-400' };
  if (diff <= -TREND_STEP) return { arrow: '↓', className: 'text-sky-400' };
  return { arrow: '→', className: 'text-white/40' };
};

export const RAIN_ALERT_PCT = 30;

/** Hour of the first forecast tile where rain is likely, if any. */
export const rainAlertHour = (
  forecast: readonly ForecastHour[]
): number | undefined =>
  forecast.find((h) => h.precipitationPct >= RAIN_ALERT_PCT)?.hour;

/** Forecast tile colours: the bluer, the more likely rain. */
export const rainTileClass = (pct: number) => {
  if (pct <= 0) return 'bg-slate-800 text-white/50';
  if (pct < 35) return 'bg-blue-950 text-blue-200';
  if (pct < 65) return 'bg-blue-700 text-white';
  return 'bg-blue-600 text-white';
};
