import { memo, useMemo } from 'react';
import {
  CloudIcon,
  CloudRainIcon,
  CloudSunIcon,
  DropIcon,
  SunIcon,
  ThermometerIcon,
  WavesIcon,
  WindIcon,
  type Icon,
} from '@phosphor-icons/react';
import {
  useDashboard,
  sessionBarSelectors,
  trackStateSelectors,
  useSessionBarSelector,
  useSessionStore,
  useTrackStateSelector,
  useSessionVisibility,
  useThrottledWeather,
} from '@irdashies/context';
import { useStore } from 'zustand';
import { speedFromMs } from '@irdashies/utils/units';
import { useWindDemoData } from '../../domain/weather/useWindDemoData';
import { getWindIntensityClass } from '../../domain/weather/wind';
import { useWeatherSettings } from './hooks/useWeatherSettings';
import { useWeatherForecast } from './hooks/useWeatherForecast';
import type { ForecastHour } from './hooks/forecast';
import { WeatherCompass } from './WeatherCompass';

const RAINING = 0.02;
const WETNESS_LEVELS: Record<number, string> = {
  1: 'Dry',
  2: 'Mostly Dry',
  3: 'Very Lightly Wet',
  4: 'Lightly Wet',
  5: 'Moderately Wet',
  6: 'Very Wet',
  7: 'Extremely Wet',
};

const skyIcon = (skies: string | undefined, raining: boolean): Icon => {
  if (raining) return CloudRainIcon;
  const s = skies?.toLowerCase() ?? '';
  if (s.includes('overcast') || s.includes('mostly')) return CloudIcon;
  if (s.includes('partly')) return CloudSunIcon;
  return SunIcon;
};

const toDisplayTemp = (c: number, metric: boolean) =>
  Math.round(metric ? c : (c * 9) / 5 + 32);

const Stat = ({
  icon: StatIcon,
  iconClass,
  label,
  value,
  unit,
}: {
  icon: Icon;
  iconClass: string;
  label: string;
  value: string | number;
  unit?: string;
}) => (
  <div className="flex-1 min-w-0 px-2">
    <div className="flex items-center gap-1 text-xs uppercase tracking-wider text-white/50">
      <StatIcon className={`flex-none ${iconClass}`} size={14} />
      <span className="truncate">{label}</span>
    </div>
    <div className="text-xl font-bold tabular-nums truncate">
      {value}
      {unit && (
        <span className="text-xs font-normal text-white/50">{unit}</span>
      )}
    </div>
  </div>
);

const ForecastTile = ({
  hour,
  metric,
  skies,
  first,
}: {
  hour: ForecastHour;
  metric: boolean;
  skies?: string;
  first: boolean;
}) => {
  const TileIcon = skyIcon(skies, hour.precipitationPct >= RAINING * 100);
  return (
    <div
      className={`flex-1 rounded-sm border px-2 py-1 text-center ${
        first
          ? 'border-blue-500/70 bg-blue-950/50'
          : 'border-white/10 bg-slate-900/50'
      }`}
    >
      <div
        className={`text-xs tabular-nums ${first ? 'text-blue-400' : 'text-white/50'}`}
      >
        {String(hour.hour).padStart(2, '0')}:00
      </div>
      <div className="flex items-center justify-center gap-1 text-white/60">
        <TileIcon size={16} />
        <DropIcon size={12} className="text-blue-400" />
        <span className="text-xs tabular-nums">{hour.precipitationPct}%</span>
      </div>
      <div className="text-sm font-bold tabular-nums">
        ~{toDisplayTemp(hour.airTemp, metric)}&deg;
      </div>
    </div>
  );
};

export const Weather = memo(() => {
  const { isDemoMode } = useDashboard();
  const settings = useWeatherSettings();
  const displayUnits = useSessionBarSelector(sessionBarSelectors.displayUnits);
  const isOnTrack = useTrackStateSelector(trackStateSelectors.isOnTrack);
  const isSessionVisible = useSessionVisibility(settings?.sessionVisibility);
  const skies = useStore(
    useSessionStore,
    (state) => state.session?.WeekendInfo?.TrackSkies
  );
  const temps = useSessionBarSelector(
    (s) => [s.airTemp, s.trackTemp] as const,
    {
      equality: (a, b) => a?.[0] === b?.[0] && a?.[1] === b?.[1],
    }
  );

  const unitSetting = settings?.units ?? 'auto';
  const isMetric =
    unitSetting === 'auto' ? displayUnits === 1 : unitSetting === 'Metric';

  const weather = useThrottledWeather();
  const forecast = useWeatherForecast(settings?.forecast?.enabled ?? true);

  const demoWind = useWindDemoData(isDemoMode, isMetric);
  const windMs = demoWind?.speedMs ?? weather.windVelocity;
  const windDir = demoWind?.direction ?? weather.windDirection;
  const windRelative =
    windDir === undefined ? undefined : windDir - (weather.windYaw ?? 0);
  const windSpeed =
    windMs === undefined
      ? undefined
      : speedFromMs(windMs, isMetric ? 'km/h' : 'mph');
  const windDeg =
    windDir === undefined
      ? undefined
      : Math.round(((windDir * 180) / Math.PI + 360) % 360);

  const raining = (weather.precipitation ?? 0) >= RAINING;
  const SkyIcon = skyIcon(skies, raining);
  const [airTemp, trackTemp] = temps ?? [];
  const surface = WETNESS_LEVELS[weather.trackMoisture ?? 0] ?? '--';
  const tempUnit = isMetric ? '°C' : '°F';

  const skyLabel = useMemo(
    () => (raining ? 'Rain' : (skies ?? '--')),
    [raining, skies]
  );

  if (settings?.showOnlyWhenOnTrack && !isOnTrack) return null;
  if (!isSessionVisible) return <></>;

  return (
    <div
      className="@container w-full rounded-sm p-3 bg-slate-800/(--bg-opacity) text-white"
      style={{
        ['--bg-opacity' as string]: `${settings?.background?.opacity ?? 80}%`,
      }}
    >
      <div className="flex items-center gap-3">
        <div className="flex-none size-28 @max-[320px]:size-20">
          <WeatherCompass
            heading={weather.windYaw}
            windRelative={windRelative}
            windClassName={getWindIntensityClass(windSpeed)}
          />
        </div>
        <div className="w-px self-stretch bg-white/10" />
        <div className="flex-1 min-w-0 text-center">
          <div className="flex items-center justify-center gap-2 text-xl font-semibold">
            <SkyIcon className="flex-none" size={32} />
            <span className="truncate">{skyLabel}</span>
          </div>
          <div className="text-5xl font-bold tabular-nums">
            {airTemp === undefined ? '--' : toDisplayTemp(airTemp, isMetric)}
            <span className="text-xl font-normal text-white/50">
              {tempUnit}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-2 flex divide-x divide-white/10 border-t border-white/10 pt-2">
        <Stat
          icon={ThermometerIcon}
          iconClass="text-orange-400"
          label="Track"
          value={
            trackTemp === undefined ? '--' : toDisplayTemp(trackTemp, isMetric)
          }
          unit={tempUnit}
        />
        <Stat
          icon={DropIcon}
          iconClass="text-blue-400"
          label="Humidity"
          value={
            weather.humidity === undefined
              ? '--'
              : Math.round(weather.humidity * 100)
          }
          unit="%"
        />
        <Stat
          icon={WavesIcon}
          iconClass="text-amber-400"
          label="Surface"
          value={surface}
        />
        <Stat
          icon={WindIcon}
          iconClass="text-amber-400"
          label={`Wind ${windDeg ?? '--'}°`}
          value={windSpeed === undefined ? '--' : Math.round(windSpeed)}
          unit={isMetric ? ' km/h' : ' mph'}
        />
      </div>

      {settings?.forecast?.enabled !== false && forecast.length > 0 && (
        <div className="mt-2 flex gap-2">
          {forecast.map((h, i) => (
            <ForecastTile
              key={h.hour}
              hour={h}
              metric={isMetric}
              skies={skies}
              first={i === 0}
            />
          ))}
        </div>
      )}
    </div>
  );
});
Weather.displayName = 'Weather';
