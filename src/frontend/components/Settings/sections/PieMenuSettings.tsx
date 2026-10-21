import { useEffect, useState } from 'react';
import { BaseSettingsSection } from '../components/BaseSettingsSection';
import { WidgetScaleSettings } from '../components/WidgetScaleSettings';
import { SettingsSection } from '../components/SettingSection';
import { SettingProps, settingPropFor } from '../components/SettingProp';
import { BindingRow } from './KeybindingsSettings';
import {
  PieMenuWidgetSettings,
  getWidgetDefaultConfig,
  type KeybindingEntry,
  type KeybindingsMap,
  type PieMenuInput,
} from '@irdashies/types';
import { PIE_MENU_INPUTS, pieMenuActionId } from '@irdashies/shared';
import { useDashboard } from '@irdashies/context';

const SETTING_ID = 'piemenu';
const SettingProp = settingPropFor(SETTING_ID);

const defaultConfig = getWidgetDefaultConfig('piemenu');

const INPUT_TEXT: Record<PieMenuInput, [string, string]> = {
  open: [
    'Open / Back',
    'Show the main menu, go back from a submenu, close from the main menu',
  ],
  up: ['Up', 'Tear-off. In the fuel menu: back'],
  right: ['Right', 'Repair. In the tires menu: back'],
  down: ['Down', 'Fuel menu. Pressed with the menu closed it opens directly'],
  left: ['Left', 'Tires menu. Pressed with the menu closed it opens directly'],
};

export const PieMenuSettings = () => {
  const { currentDashboard } = useDashboard();
  const savedSettings = currentDashboard?.widgets.find(
    (w) => w.id === SETTING_ID
  ) as PieMenuWidgetSettings | undefined;
  const [settings, setSettings] = useState<PieMenuWidgetSettings>({
    enabled: savedSettings?.enabled ?? false,
    config:
      (savedSettings?.config as PieMenuWidgetSettings['config']) ??
      defaultConfig,
  });
  const [bindings, setBindings] = useState<KeybindingsMap | null>(null);

  useEffect(() => {
    window.keybindingsBridge?.getKeybindings().then(setBindings);
  }, []);

  if (!currentDashboard || !bindings) {
    return <>Loading...</>;
  }

  return (
    <BaseSettingsSection
      title="Pie Menu"
      description="Pit-stop pie menu driven by keys or controller buttons, for example the wheel thumbstick. Sends the same pit commands as typing #lf rf$ in chat. Only works while you are in the car."
      settings={settings}
      onSettingsChange={setSettings}
      widgetId={SETTING_ID}
    >
      {(handleConfigChange) => (
        <SettingProps
          widget={SETTING_ID}
          config={settings.config}
          onChange={handleConfigChange}
        >
          <div className="space-y-4">
            <WidgetScaleSettings widgetId={SETTING_ID} className="px-4" />
            <SettingsSection title="Options">
              <SettingProp path="timeoutSeconds" />
              <SettingProp path="fuelStep" />
            </SettingsSection>
            <SettingsSection title="Navigation">
              <div className="flex flex-col gap-1">
                {PIE_MENU_INPUTS.map((input) => {
                  const actionId = pieMenuActionId(input);
                  const [label, description] = INPUT_TEXT[input];
                  const entry: KeybindingEntry = bindings[actionId] ?? {
                    accelerator: '',
                    label: `Pie Menu: ${label}`,
                    description,
                    isDefault: true,
                  };
                  return (
                    <BindingRow
                      key={actionId}
                      actionId={actionId}
                      entry={{ ...entry, label, description }}
                      onUpdated={setBindings}
                    />
                  );
                })}
              </div>
            </SettingsSection>
          </div>
        </SettingProps>
      )}
    </BaseSettingsSection>
  );
};
