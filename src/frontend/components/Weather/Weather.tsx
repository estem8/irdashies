import { memo } from 'react';
import {
  useDashboard,
  sessionBarSelectors,
  trackStateSelectors,
  useSessionBarSelector,
  useTrackStateSelector,
  useSessionVisibility,
  useThrottledWeather,
} from '@irdashies/context';
import { speedFromMs } from '@irdashies/utils/units';
import { useWindDemoData } from '../../domain/weather/useWindDemoData';
import { getWindIntensityClass } from '../../domain/weather/wind';
import { useWeatherSettings } from './hooks/useWeatherSettings';
import { useWeatherForecast } from './hooks/useWeatherForecast';
import {
  rainAlertHour,
  rainTileClass,
  surfaceStatus,
  tempTrend,
} from './hooks/weatherStatus';
import { WindArrow } from './WindArrow';

const toDisplayTemp = (c: number, metric: boolean) =>
  Math.round(metric ? c : (c * 9) / 5 + 32);

const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

export const Weather = memo(() => {
  const { isDemoMode } = useDashboard();
  const settings = useWeatherSettings();
  const displayUnits = useSessionBarSelector(sessionBarSelectors.displayUnits);
  const isOnTrack = useTrackStateSelector(trackStateSelectors.isOnTrack);
  const isSessionVisible = useSessionVisibility(settings?.sessionVisibility);
  const temps = useSessionBarSelector(
    (s) => [s.airTemp, s.trackTemp] as const,
    { equality: (a, b) => a?.[0] === b?.[0] && a?.[1] === b?.[1] }
  );

  const unitSetting = settings?.units ?? 'auto';
  const isMetric =
    unitSetting === 'auto' ? displayUnits === 1 : unitSetting === 'Metric';

  const weather = useThrottledWeather();
  const showForecast = settings?.forecast?.enabled !== false;
  const forecast = useWeatherForecast(showForecast);

  const demoWind = useWindDemoData(isDemoMode, isMetric);
  const windMs = demoWind?.speedMs ?? weather.windVelocity;
  const windDir = demoWind?.direction ?? weather.windDirection;
  const windRelative =
    windDir === undefined ? undefined : windDir - (weather.windYaw ?? 0);
  const windSpeed =
    windMs === undefined
      ? undefined
      : speedFromMs(windMs, isMetric ? 'km/h' : 'mph');

  const [airTemp, trackTemp] = temps ?? [];
  const surface = surfaceStatus(weather.trackMoisture);
  const trend = tempTrend(airTemp, forecast);
  const alertHour = showForecast ? rainAlertHour(forecast) : undefined;

  if (settings?.showOnlyWhenOnTrack && !isOnTrack) return null;
  if (!isSessionVisible) return <></>;

  return (
    <div
      className="@container relative w-full rounded-md p-2.5 bg-slate-900/(--bg-opacity) text-white flex flex-col gap-2"
      style={{
        ['--bg-opacity' as string]: `${settings?.background?.opacity ?? 80}%`,
      }}
    >
      {alertHour !== undefined && (
        <div className="absolute -top-2.5 right-3 rounded-full bg-blue-600 px-2.5 py-0.5 text-xs font-bold tracking-wider">
          RAIN BY {hourLabel(alertHour)}
        </div>
      )}
      <div className="flex items-center gap-3">
        <div
          className={`rounded-md px-3 py-1.5 text-center text-3xl font-bold leading-none min-w-20 ${surface.className}`}
        >
          {surface.label}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-5xl font-bold leading-none tabular-nums">
            {airTemp === undefined
              ? '--'
              : `${toDisplayTemp(airTemp, isMetric)}°`}
            <span className={`ml-1 text-2xl ${trend.className}`}>
              {trend.arrow}
            </span>
          </div>
          {trackTemp !== undefined && (
            <div className="text-sm text-white/50 tabular-nums">
              track {toDisplayTemp(trackTemp, isMetric)}&deg;
            </div>
          )}
        </div>
        <div
          className={`flex flex-col items-center ${getWindIntensityClass(windSpeed)}`}
        >
          <WindArrow relative={windRelative} />
          <div className="text-base font-semibold leading-none tabular-nums">
            {windSpeed === undefined ? '--' : Math.round(windSpeed)}
          </div>
        </div>
      </div>
      {showForecast && forecast.length > 0 && (
        <div className="flex gap-1.5">
          {forecast.map((h) => (
            <div
              key={h.hour}
              className={`flex flex-1 items-baseline justify-between rounded-md px-2 py-1 text-sm ${rainTileClass(h.precipitationPct)}`}
            >
              <span className="opacity-80 tabular-nums">
                {hourLabel(h.hour)}
              </span>
              <b className="tabular-nums">
                {h.precipitationPct > 0
                  ? `${h.precipitationPct}%`
                  : `~${toDisplayTemp(h.airTemp, isMetric)}°`}
              </b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
Weather.displayName = 'Weather';
