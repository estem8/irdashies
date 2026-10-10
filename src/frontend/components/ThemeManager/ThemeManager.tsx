import { PropsWithChildren } from 'react';
import { useGeneralSettings } from '@irdashies/context';
import { overlayThemeClasses } from '@irdashies/types';

/**
 * Check if we're on the settings page by looking at the URL hash.
 * This works both with and without react-router context.
 */
const isSettingsPage = () => {
  return window.location.hash.startsWith('#/settings');
};

export const ThemeManager = ({ children }: PropsWithChildren) => {
  const generalSettings = useGeneralSettings();
  const { fontSize, fontType, fontWeight } = generalSettings || {};

  // Don't apply theme changes to the settings page since
  // they share the same theme as the rest of the overlays
  if (isSettingsPage()) {
    return <>{children}</>;
  }

  return (
    <div
      className={`
        relative w-full h-full overflow-hidden overlay-window
        overlay-theme-${fontSize ?? 'sm'}
        ${overlayThemeClasses(generalSettings)}
        overlay-theme-font-face-${fontType ?? 'lato'}
        overlay-theme-font-weight-${fontWeight ?? 'normal'}
      `}
    >
      {children}
    </div>
  );
};
