import { useDashboard } from '@irdashies/context';
import { resolveAppTheme } from '@irdashies/types';
import { SettingsLayout } from './SettingsLayout';

export const Settings = () => {
  const { currentDashboard, onDashboardUpdated } = useDashboard();
  if (!currentDashboard || !onDashboardUpdated) {
    return <>Loading...</>;
  }

  const theme = resolveAppTheme(currentDashboard.generalSettings?.appTheme);

  return (
    <div className={`settings-theme theme-${theme} w-full h-full`}>
      <SettingsLayout />
    </div>
  );
};
