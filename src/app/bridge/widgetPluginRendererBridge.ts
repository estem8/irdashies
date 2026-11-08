import { ipcRenderer } from 'electron';
import {
  WIDGET_PLUGIN_IPC,
  type WidgetPluginBridge,
} from '../../types/plugins';
import { defineBridge } from './defineBridge';

export const exposeWidgetPluginBridge = () =>
  defineBridge<WidgetPluginBridge>('widgetPluginBridge', {
    getInstalledPlugins: () =>
      ipcRenderer.invoke(WIDGET_PLUGIN_IPC.getInstalledPlugins),
  });
