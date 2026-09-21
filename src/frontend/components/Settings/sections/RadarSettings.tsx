import { useEffect, useState } from 'react';
import { BaseSettingsSection } from '../components/BaseSettingsSection';
import { useDashboard } from '@irdashies/context';
import {
  SettingsTabType,
  getWidgetDefaultConfig,
  type RadarConfig,
  type RadarWidgetSettings,
} from '@irdashies/types';
import { SessionVisibility } from '../components/SessionVisibility';
import { TabButton } from '../components/TabButton';
import { SettingSliderRow } from '../components/SettingSliderRow';
import { SettingNumberRow } from '../components/SettingNumberRow';
import { SettingSelectRow } from '../components/SettingSelectRow';
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
                <SettingSelectRow
                  title="View"
                  description="Disc puts every car on a bearing around you; portrait lays them out fore and aft by gap; bars show only the sides a car is on."
                  value={settings.config.displayMode}
                  options={[
                    { label: 'Disc', value: 'disc' },
                    { label: 'Portrait radar', value: 'portrait' },
                    { label: 'Side bars', value: 'bars' },
                  ]}
                  onChange={(v) =>
                    handleConfigChange({
                      displayMode: v as RadarConfig['displayMode'],
                    })
                  }
                />
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
                    label="Rivals"
                    value={settings.config.colorFar}
                    onChange={(v) => handleConfigChange({ colorFar: v })}
                  />
                  <ColorField
                    label="Nearby"
                    value={settings.config.colorNearby}
                    onChange={(v) => handleConfigChange({ colorNearby: v })}
                  />
                  <ColorField
                    label="Critical"
                    value={settings.config.colorCritical}
                    onChange={(v) => handleConfigChange({ colorCritical: v })}
                  />
                  <ColorField
                    label="Lapping you"
                    value={settings.config.colorLapping}
                    onChange={(v) => handleConfigChange({ colorLapping: v })}
                  />
                  <ColorField
                    label="In pit"
                    value={settings.config.colorInPit}
                    onChange={(v) => handleConfigChange({ colorInPit: v })}
                  />
                </div>
                <SettingDivider />
                <SettingToggleRow
                  title="Show only when a car is near"
                  description="Keep the radar off screen until a car comes within the near range. Nothing is drawn while the track around you is clear."
                  enabled={settings.config.showWhenNearby}
                  onToggle={(v) => handleConfigChange({ showWhenNearby: v })}
                />
                {settings.config.showWhenNearby && (
                  <SettingSliderRow
                    title="Near Range"
                    description="How close a car has to be to bring the radar on screen, in metres. Capped at the radar range, since nothing beyond it is drawn."
                    value={Math.min(
                      settings.config.showRange,
                      settings.config.radarRange
                    )}
                    units="m"
                    min={2}
                    max={settings.config.radarRange}
                    step={0.5}
                    onChange={(v) => handleConfigChange({ showRange: v })}
                  />
                )}
                <SettingSliderRow
                  title="Fade Duration"
                  description="Seconds the radar takes to appear and disappear. 0 makes it instant."
                  value={settings.config.fadeSeconds}
                  units="s"
                  min={0}
                  max={2}
                  step={0.1}
                  onChange={(v) => handleConfigChange({ fadeSeconds: v })}
                />
                <SettingToggleRow
                  title="Fade cars in at the range edge"
                  description="Cars ramp up from invisible as they come inside the range instead of appearing all at once on the edge."
                  enabled={settings.config.fadeInCars}
                  onToggle={(v) => handleConfigChange({ fadeInCars: v })}
                />
                {settings.config.fadeInCars && (
                  <SettingSliderRow
                    title="Fade Width"
                    description="How much of the outer range the fade covers, in metres. Cars are drawn at full strength inside it."
                    value={settings.config.fadeBandM}
                    units="m"
                    min={1}
                    max={10}
                    step={0.5}
                    onChange={(v) => handleConfigChange({ fadeBandM: v })}
                  />
                )}
                <SettingDivider />
                <SettingToggleRow
                  title="Car numbers on blips"
                  description="Label each car with its number, so you know who is alongside."
                  enabled={settings.config.showCarNumbers}
                  onToggle={(v) => handleConfigChange({ showCarNumbers: v })}
                />
                <SettingToggleRow
                  title="Pulse when critical"
                  description="Breathe the blip and the rim arch while a car is alongside."
                  enabled={settings.config.pulseWhenCritical}
                  onToggle={(v) => handleConfigChange({ pulseWhenCritical: v })}
                />
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
                <SettingSliderRow
                  title="Engage Range"
                  description="Gap at which a car starts being tracked, in metres. This is where a blip turns amber."
                  value={settings.config.nearbyRange}
                  units="m"
                  min={2}
                  max={15}
                  step={0.5}
                  onChange={(v) => handleConfigChange({ nearbyRange: v })}
                />
                <SettingSliderRow
                  title="Clear Range"
                  description="Gap at which a tracked car is released, in metres. Kept above the engage range so the warning cannot flicker on the threshold."
                  value={settings.config.clearRange}
                  units="m"
                  min={3}
                  max={20}
                  step={0.5}
                  onChange={(v) => handleConfigChange({ clearRange: v })}
                />
                <SettingSliderRow
                  title="Critical Range"
                  description="Gap at which a tracked car turns red, in metres. A car directly alongside is always critical."
                  value={settings.config.criticalRange}
                  units="m"
                  min={0.5}
                  max={5}
                  step={0.5}
                  onChange={(v) => handleConfigChange({ criticalRange: v })}
                />
                <SettingDivider />
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
