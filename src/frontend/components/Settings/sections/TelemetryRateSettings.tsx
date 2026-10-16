import { useEffect, useState } from 'react';
import {
  TELEMETRY_RATE_CAP_OPTIONS,
  type TelemetryRateCapHz,
} from '@irdashies/types';
import { SettingSelectRow } from '../components/SettingSelectRow';
import { SettingsSection } from '../components/SettingSection';
import logger from '@irdashies/utils/logger';

const OPTIONS = TELEMETRY_RATE_CAP_OPTIONS.map((hz) => ({
  label: hz === 0 ? 'No cap (widgets decide)' : `${hz} Hz`,
  value: String(hz),
}));

export const TelemetryRateSettings = () => {
  const [capHz, setCapHz] = useState<TelemetryRateCapHz | null>(() =>
    window.telemetryRateBridge ? null : 0
  );

  useEffect(() => {
    if (!window.telemetryRateBridge) {
      logger.warn('telemetryRateBridge unavailable');
      return;
    }
    window.telemetryRateBridge
      .getCapHz()
      .then(setCapHz)
      .catch((err) => {
        logger.error('Failed to load telemetry rate cap', err);
        setCapHz(0);
      });
  }, []);

  if (capHz === null) {
    return <div className="px-4 text-sm text-slate-400">Loading...</div>;
  }

  const onChange = (value: string) => {
    const next = Number(value) as TelemetryRateCapHz;
    setCapHz(next);
    window.telemetryRateBridge
      ?.saveCapHz(next)
      .then(setCapHz)
      .catch((err) => {
        logger.error('Failed to save telemetry rate cap', err);
      });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto min-h-0 pb-4 space-y-6">
        <p className="text-sm text-slate-400 px-4">
          For measurements only. Caps how often irDashies reads iRacing
          telemetry, which lets you compare CPU use at a fixed rate. Widgets get
          fewer updates below their usual rate. The cap applies at once, lasts
          across restarts, and never raises the rate above what the visible
          widgets ask for.
        </p>
        <SettingsSection title="Telemetry loop">
          <SettingSelectRow
            title="Maximum telemetry rate"
            description="Upper limit for the iRacing telemetry loop."
            value={String(capHz)}
            options={OPTIONS}
            onChange={onChange}
          />
        </SettingsSection>
      </div>
    </div>
  );
};
