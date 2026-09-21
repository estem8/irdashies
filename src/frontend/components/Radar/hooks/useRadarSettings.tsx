import { useMemo } from 'react';
import { useDashboard } from '@irdashies/context';
import { deepMergeConfig, getWidgetDefaultConfig } from '@irdashies/types';
import type { RadarConfig } from '@irdashies/types';

const defaultConfig = getWidgetDefaultConfig('radar');

/**
 * Always returns a complete config. Saved dashboards may predate fields added
 * later, and the disc draws with every one of them, so missing fields are
 * filled from the defaults rather than read as undefined.
 *
 * Memoised on the dashboard: this runs inside a widget that re-renders on every
 * position tick, and the merge allocates a fresh object each call.
 */
export const useRadarSettings = (): RadarConfig => {
  const { currentDashboard } = useDashboard();

  return useMemo(() => {
    const saved = currentDashboard?.widgets.find(
      (widget) => widget.id === 'radar'
    )?.config;

    if (saved && typeof saved === 'object') {
      return deepMergeConfig(
        defaultConfig as unknown as Record<string, unknown>,
        saved
      ) as unknown as RadarConfig;
    }

    return defaultConfig;
  }, [currentDashboard]);
};
