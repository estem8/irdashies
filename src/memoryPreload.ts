import { ipcRenderer } from 'electron';
import { defineBridge } from './app/bridge/defineBridge';
import type { IbtInspectorBridge } from './types/ibtInspector';

defineBridge<IbtInspectorBridge>('ibtInspectorBridge', {
  version: () => ipcRenderer.invoke('memoryDiagnostics:version'),
  playback: () => ipcRenderer.invoke('memoryDiagnostics:playback'),
  status: () => ipcRenderer.invoke('memoryDiagnostics:status'),
  load: (name, speed) =>
    ipcRenderer.invoke('memoryDiagnostics:load', name, speed),
  command: (command) =>
    ipcRenderer.invoke('memoryDiagnostics:command', command),
  startCapture: () => ipcRenderer.invoke('memoryDiagnostics:startCapture'),
  stopCapture: () => ipcRenderer.invoke('memoryDiagnostics:stopCapture'),
  checkpointMemory: () => ipcRenderer.invoke('memoryDiagnostics:checkpoint'),
  stop: () => ipcRenderer.invoke('memoryDiagnostics:stop'),
});
