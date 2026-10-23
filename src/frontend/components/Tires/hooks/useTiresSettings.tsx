import { useMemo } from 'react';
import { useDashboard } from '@irdashies/context';
import {
  deepMergeConfig,
  getWidgetDefaultConfig,
  getWidgetManifest,
  isConfigValid,
  type TiresWidgetSettings,
} from '@irdashies/types';

const defaultConfig = getWidgetDefaultConfig('tires');

// Fill values a saved config predates from the defaults first, so adding a
// property to the manifest doesn't invalidate every saved tires config.
const withDefaults = (config: unknown) =>
  deepMergeConfig(
    defaultConfig as unknown as Record<string, unknown>,
    config
  ) as unknown as TiresWidgetSettings['config'];

const isTiresConfig = (config: unknown) =>
  isConfigValid(
    getWidgetManifest('tires')?.properties ?? {},
    withDefaults(config)
  );

export const useTiresSettings = (): TiresWidgetSettings['config'] => {
  const { currentDashboard } = useDashboard();

  return useMemo(() => {
    const config = currentDashboard?.widgets.find(
      (w) => w.id === 'tires'
    )?.config;

    return isTiresConfig(config) ? withDefaults(config) : defaultConfig;
  }, [currentDashboard]);
};
