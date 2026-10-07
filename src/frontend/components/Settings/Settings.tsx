import { useDashboard } from '@irdashies/context';
import { SETTINGS_THEMES, type SettingsTheme } from '@irdashies/types';
import { SettingsLayout } from './SettingsLayout';

// Persisted config is untrusted: an unknown value falls back to the default
// instead of producing a class with no matching theme.
const resolveTheme = (value: unknown): SettingsTheme =>
  SETTINGS_THEMES.includes(value as SettingsTheme)
    ? (value as SettingsTheme)
    : 'carbon';

export const Settings = () => {
  const { currentDashboard, onDashboardUpdated } = useDashboard();
  if (!currentDashboard || !onDashboardUpdated) {
    return <>Loading...</>;
  }

  const theme = resolveTheme(currentDashboard.generalSettings?.settingsTheme);

  return (
    <div className={`settings-theme settings-theme-${theme} w-full h-full`}>
      <SettingsLayout />
    </div>
  );
};
