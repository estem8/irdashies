import { useMemo } from 'react';
import { useDashboard } from '@irdashies/context';
import { type WindWidgetSettings } from '@irdashies/types';
import {
  getWidgetDefaultConfig,
  getWidgetManifest,
  isConfigValid,
} from '@irdashies/types/widgetDefaults';

const defaultConfig = getWidgetDefaultConfig('wind');

const isWindConfig = (
  config: unknown
): config is WindWidgetSettings['config'] =>
  isConfigValid(getWidgetManifest('wind')?.properties ?? {}, config);

export const useWindSettings = (): WindWidgetSettings['config'] => {
  const { currentDashboard } = useDashboard();

  return useMemo(() => {
    const config = currentDashboard?.widgets.find(
      (w) => w.id === 'wind'
    )?.config;

    return isWindConfig(config) ? config : defaultConfig;
  }, [currentDashboard]);
};
