import { useEffect, useState } from 'react';
import { BaseSettingsSection } from '../components/BaseSettingsSection';
import { useDashboard } from '@irdashies/context';
import {
  SettingsTabType,
  getWidgetDefaultConfig,
  type RadarWidgetSettings,
} from '@irdashies/types';
import { SessionVisibility } from '../components/SessionVisibility';
import { TabButton } from '../components/TabButton';
import { SettingSliderRow } from '../components/SettingSliderRow';
import { SettingNumberRow } from '../components/SettingNumberRow';
import { SettingsSection } from '../components/SettingSection';
import { SettingDivider } from '../components/SettingDivider';
import { SettingToggleRow } from '../components/SettingToggleRow';

const SETTING_ID = 'radar';

const defaultConfig = getWidgetDefaultConfig('radar');

/** A compact labelled colour swatch, two of which sit per row in the grid. */
const ColorField = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) => (
  <label className="flex items-center gap-2 text-xs text-slate-400">
    <input
      type="color"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-6 w-8 flex-none cursor-pointer rounded bg-slate-700"
    />
    <span className="truncate">{label}</span>
  </label>
);

export const RadarSettings = () => {
  const { currentDashboard } = useDashboard();
  const savedSettings = currentDashboard?.widgets.find(
    (widget) => widget.id === SETTING_ID
  ) as RadarWidgetSettings | undefined;
  const [settings, setSettings] = useState<RadarWidgetSettings>({
    id: SETTING_ID,
    enabled: savedSettings?.enabled ?? false,
    config:
      (savedSettings?.config as RadarWidgetSettings['config']) ?? defaultConfig,
  });

  // useState only reads its initialiser on the first render, and the Loading
  // return below does not re-run it. Mounting before the dashboard has loaded —
  // or switching profile — would otherwise leave this holding defaults, and
  // BaseSettingsSection persists the whole settings object, so the next edit to
  // any one control would write those defaults over the saved config. Re-seed
  // whenever the saved widget changes, using the same guarded
  // set-during-render sync as BaseSettingsSection so there is no stale paint.
  const [prevSaved, setPrevSaved] = useState(savedSettings);
  if (JSON.stringify(savedSettings) !== JSON.stringify(prevSaved)) {
    setPrevSaved(savedSettings);
    if (savedSettings) {
      setSettings({
        id: SETTING_ID,
        enabled: savedSettings.enabled ?? false,
        config:
          (savedSettings.config as RadarWidgetSettings['config']) ??
          defaultConfig,
      });
    }
  }

  const [activeTab, setActiveTab] = useState<SettingsTabType>(
    () => (localStorage.getItem('radarTab') as SettingsTabType) || 'display'
  );

  useEffect(() => {
    localStorage.setItem('radarTab', activeTab);
  }, [activeTab]);

  if (!currentDashboard) {
    return <>Loading...</>;
  }

  return (
    <BaseSettingsSection
      title="Radar"
      description="Proximity radar showing the cars around you, placed by their real distance along the track."
      settings={settings}
      onSettingsChange={setSettings}
      widgetId={SETTING_ID}
    >
      {(handleConfigChange) => (
        <div className="space-y-4">
          <div className="flex border-b border-slate-700/50">
            <TabButton
              id="display"
              activeTab={activeTab}
              setActiveTab={setActiveTab}
            >
              Display
            </TabButton>
            <TabButton
              id="options"
              activeTab={activeTab}
              setActiveTab={setActiveTab}
            >
              Options
            </TabButton>
            <TabButton
              id="visibility"
              activeTab={activeTab}
              setActiveTab={setActiveTab}
            >
              Visibility
            </TabButton>
          </div>

          <div>
            {activeTab === 'display' && (
              <SettingsSection title="Display">
                <SettingSliderRow
                  title="Background Opacity"
                  value={settings.config.background?.opacity ?? 30}
                  units="%"
                  min={0}
                  max={100}
                  step={5}
                  onChange={(v) =>
                    handleConfigChange({ background: { opacity: v } })
                  }
                />
                <SettingDivider />
                <div className="grid grid-cols-2 gap-3">
                  <ColorField
                    label="Your car"
                    value={settings.config.colorPlayer}
                    onChange={(v) => handleConfigChange({ colorPlayer: v })}
                  />
                  <ColorField
                    label="Same lap"
                    value={settings.config.colorSameLap}
                    onChange={(v) => handleConfigChange({ colorSameLap: v })}
                  />
                  <ColorField
                    label="A lap ahead"
                    value={settings.config.colorLapsAhead}
                    onChange={(v) => handleConfigChange({ colorLapsAhead: v })}
                  />
                  <ColorField
                    label="A lap behind"
                    value={settings.config.colorLapsBehind}
                    onChange={(v) => handleConfigChange({ colorLapsBehind: v })}
                  />
                  <ColorField
                    label="In pit"
                    value={settings.config.colorInPit}
                    onChange={(v) => handleConfigChange({ colorInPit: v })}
                  />
                  <ColorField
                    label="Overlap nearby"
                    value={settings.config.colorNearby}
                    onChange={(v) => handleConfigChange({ colorNearby: v })}
                  />
                  <ColorField
                    label="Overlap critical"
                    value={settings.config.colorCritical}
                    onChange={(v) => handleConfigChange({ colorCritical: v })}
                  />
                </div>
              </SettingsSection>
            )}

            {activeTab === 'options' && (
              <SettingsSection title="Options">
                <SettingSliderRow
                  title="Radar Range"
                  description="How far from your car cars are still shown, in metres."
                  value={settings.config.radarRange}
                  units="m"
                  min={10}
                  max={25}
                  step={1}
                  onChange={(v) => handleConfigChange({ radarRange: v })}
                />
                <SettingNumberRow
                  title="Car Width"
                  description="Opponent car width in metres. The sim reports no per-car size, so blips use this."
                  value={settings.config.vehicleWidth}
                  min={1}
                  max={2.5}
                  step={0.1}
                  onChange={(v) => handleConfigChange({ vehicleWidth: v })}
                />
                <SettingNumberRow
                  title="Car Length"
                  description="Opponent car length in metres."
                  value={settings.config.vehicleLength}
                  min={3}
                  max={6}
                  step={0.1}
                  onChange={(v) => handleConfigChange({ vehicleLength: v })}
                />
                <SettingDivider />
                <SettingToggleRow
                  title="Hide cars in pit"
                  description="Cars on pit road sit on the same centreline as the track, so they would show as cars on the racing line."
                  enabled={settings.config.hideInPit}
                  onToggle={(v) => handleConfigChange({ hideInPit: v })}
                />
                <SettingToggleRow
                  title="Side overlap indicator"
                  description="Bars at the left and right edge when the sim reports a car alongside you."
                  enabled={settings.config.showOverlapIndicator}
                  onToggle={(v) =>
                    handleConfigChange({ showOverlapIndicator: v })
                  }
                />
              </SettingsSection>
            )}

            {activeTab === 'visibility' && (
              <SettingsSection title="Session Visibility">
                <SessionVisibility
                  sessionVisibility={settings.config.sessionVisibility}
                  handleConfigChange={handleConfigChange}
                />

                <SettingDivider />

                <SettingToggleRow
                  title="Show only when on track"
                  description="If enabled, the radar is only shown when driving."
                  enabled={settings.config.showOnlyWhenOnTrack}
                  onToggle={(v) =>
                    handleConfigChange({ showOnlyWhenOnTrack: v })
                  }
                />
              </SettingsSection>
            )}
          </div>
        </div>
      )}
    </BaseSettingsSection>
  );
};
