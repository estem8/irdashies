import { useEffect } from 'react';
import { useDashboard } from '@irdashies/context';
import { resolveAppTheme } from '@irdashies/types';
import { SettingsLayout } from './SettingsLayout';

export const Settings = () => {
  const { currentDashboard, onDashboardUpdated } = useDashboard();
  // Unknown until the dashboard loads; resolving undefined would flash the
  // default theme for users on another one.
  const theme = currentDashboard
    ? resolveAppTheme(currentDashboard.generalSettings?.appTheme)
    : undefined;

  // Portaled popups (e.g. the profile Actions menu) render into <body>,
  // outside the wrapper below, so the theme goes on <body> too.
  useEffect(() => {
    if (!theme) return;
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
