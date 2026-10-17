import { useEffect } from 'react';
import { useDashboard } from '@irdashies/context';
import { resolveSettingsTheme } from '@irdashies/types';
import { SettingsLayout } from './SettingsLayout';

// Fonts of the settings themes. Loaded from here rather than theme.css, which
// every overlay window imports, so overlays don't fetch fonts they never use.
const SETTINGS_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600&family=Barlow+Condensed:wght@600;700&family=Saira:wght@400;500;600&family=Saira+Condensed:wght@600;700&family=JetBrains+Mono:wght@500;700&display=swap';

const loadSettingsFonts = () => {
  if (document.querySelector(`link[href="${SETTINGS_FONTS_URL}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = SETTINGS_FONTS_URL;
  document.head.appendChild(link);
};

export const Settings = () => {
  const { currentDashboard, onDashboardUpdated } = useDashboard();
  // Unknown until the dashboard loads; resolving undefined would flash the
  // default theme for users on another one.
  const theme = currentDashboard
    ? resolveSettingsTheme(currentDashboard.generalSettings?.settingsTheme)
    : undefined;

  useEffect(loadSettingsFonts, []);

  // Portaled popups (e.g. the profile Actions menu) render into <body>,
  // outside the wrapper below, so the theme goes on <body> too.
  useEffect(() => {
    if (!theme) return;
    const classes = ['settings-theme', `settings-theme-${theme}`];
    document.body.classList.add(...classes);
    return () => document.body.classList.remove(...classes);
  }, [theme]);

  if (!currentDashboard || !onDashboardUpdated) {
    return <>Loading...</>;
  }

  return (
    <div className={`settings-theme settings-theme-${theme} w-full h-full`}>
      <SettingsLayout />
    </div>
  );
};
