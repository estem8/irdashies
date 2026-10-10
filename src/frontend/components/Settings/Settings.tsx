import { useEffect } from 'react';
import { useDashboard } from '@irdashies/context';
import { resolveAppTheme } from '@irdashies/types';
import { SettingsLayout } from './SettingsLayout';

export const Settings = () => {
  const { currentDashboard, onDashboardUpdated } = useDashboard();
  const theme = resolveAppTheme(currentDashboard?.generalSettings?.appTheme);

  // Portaled popups (e.g. the profile Actions menu) render into <body>,
  // outside the wrapper below, so the theme goes on <body> too.
  useEffect(() => {
    const classes = ['settings-theme', `theme-${theme}`];
    document.body.classList.add(...classes);
    return () => document.body.classList.remove(...classes);
  }, [theme]);

  if (!currentDashboard || !onDashboardUpdated) {
    return <>Loading...</>;
  }

  return (
    <div className={`settings-theme theme-${theme} w-full h-full`}>
      <SettingsLayout />
    </div>
  );
};
