// ProcessorHost imports the main-process logger (electron-log); the viewer has no Electron main here.
const noop = (): void => undefined;
export default {
  warn: noop,
  error: noop,
  info: noop,
  debug: noop,
  log: noop,
  verbose: noop,
};
