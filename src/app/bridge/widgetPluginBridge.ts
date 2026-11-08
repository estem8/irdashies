import { ipcMain } from 'electron';
import { WIDGET_PLUGIN_IPC } from '../../types/plugins';
import { getInstalledWidgetPlugins } from '../plugins/pluginLoader';

export function setupWidgetPluginBridge(): void {
  ipcMain.handle(WIDGET_PLUGIN_IPC.getInstalledPlugins, (event) => {
    if (event.senderFrame !== event.sender.mainFrame) {
      throw new Error('Only the main frame can list installed plugins');
    }
    return getInstalledWidgetPlugins();
  });
}
