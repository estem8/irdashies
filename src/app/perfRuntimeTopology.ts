export type PerfWindowRole =
  'display' | 'widget' | 'gantry' | 'settings' | 'other';

export interface PerfRuntimeWindowSnapshot {
  id: number;
  rendererPid: number;
  route: string;
  role: PerfWindowRole;
  bounds: { x: number; y: number; width: number; height: number };
  visible: boolean;
  ready: boolean;
}

export interface PerfRuntimeTopologyMarker {
  timestamp: string;
  runId: string;
  complete: boolean;
  timedOut: boolean;
  topologyChanged: boolean;
  processMetricsAvailable: boolean;
  snapshotErrors: string[];
  windows: PerfRuntimeWindowSnapshot[];
  processCounts: Record<string, number>;
}

export interface PerfRuntimeTopologyWindow {
  id: number;
  isDestroyed(): boolean;
  read(): Omit<PerfRuntimeWindowSnapshot, 'role' | 'ready'> & {
    loaded: boolean;
    loading: boolean;
  };
  onReadinessChange(listener: () => void): () => void;
}

interface PerfRuntimeTopologyDependencies {
  runId: string;
  getWindows(): PerfRuntimeTopologyWindow[];
  getProcessTypes(): string[];
  writeMarker(marker: PerfRuntimeTopologyMarker): void;
  onBeforeQuit(listener: () => void): () => void;
  timeoutMs?: number;
}

const noop = () => 0;

const routeForRole = (route: string): PerfWindowRole => {
  let hash: string;
  try {
    hash = new URL(route).hash.replace(/^#/, '');
  } catch {
    hash = route;
  }
  const pathname = hash.split('?', 1)[0].replace(/\/$/, '') || '/';
  if (pathname === '/gantry' || pathname.startsWith('/gantry/'))
    return 'gantry';
  if (pathname === '/settings' || pathname.startsWith('/settings/'))
    return 'settings';
  if (pathname === '/overlay-widget') return 'widget';
  if (!hash || pathname === '/') return 'display';
  return 'other';
};

function waitUntilReady(
  window: PerfRuntimeTopologyWindow,
  deadline: number,
  signal: AbortSignal,
  snapshotErrors: Set<string>
): Promise<'ready' | 'timeout' | 'cancelled' | 'destroyed'> {
  const readiness = () => {
    try {
      if (window.isDestroyed()) return 'destroyed' as const;
      const state = window.read();
      return state.loaded && !state.loading && state.rendererPid > 0
        ? ('ready' as const)
        : undefined;
    } catch {
      snapshotErrors.add(`window ${window.id} readiness could not be read`);
      return undefined;
    }
  };
  const currentReadiness = readiness();
  if (currentReadiness) return Promise.resolve(currentReadiness);
  if (signal.aborted) return Promise.resolve('cancelled');

  return new Promise((resolve) => {
    let finished = false;
    const cleanup: {
      timeout?: NodeJS.Timeout;
      removeReadinessListener?: () => void;
    } = {};
    const finish = (
      result: 'ready' | 'timeout' | 'cancelled' | 'destroyed'
    ) => {
      if (finished) return;
      finished = true;
      if (cleanup.timeout) clearTimeout(cleanup.timeout);
      try {
        cleanup.removeReadinessListener?.();
      } catch {
        snapshotErrors.add(
          `window ${window.id} readiness listener cleanup failed`
        );
      }
      signal.removeEventListener('abort', onAbort);
      resolve(result);
    };
    const onReadinessChange = () => {
      const result = readiness();
      if (result) finish(result);
    };
    const onAbort = () => finish('cancelled');

    const remainingMs = Math.max(0, deadline - Date.now());
    cleanup.timeout = setTimeout(() => finish('timeout'), remainingMs);
    cleanup.timeout.unref?.();
    try {
      cleanup.removeReadinessListener =
        window.onReadinessChange(onReadinessChange);
    } catch {
      snapshotErrors.add(`window ${window.id} readiness listener failed`);
      finish('destroyed');
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
    onReadinessChange();
  });
}

/**
 * Write one bounded startup topology snapshot. This is intentionally a point
 * in time: later runtime window changes are not followed or sampled.
 */
export function capturePerfRuntimeTopology(
  dependencies: PerfRuntimeTopologyDependencies
): { cancel(): void } {
  const controller = new AbortController();
  const deadline = Date.now() + (dependencies.timeoutMs ?? 5000);
  const snapshotErrors = new Set<string>();
  let cancelled = false;
  let completed = false;

  const getWindows = (): PerfRuntimeTopologyWindow[] => {
    try {
      return dependencies.getWindows();
    } catch {
      snapshotErrors.add('runtime windows could not be enumerated');
      return [];
    }
  };
  const isDestroyed = (window: PerfRuntimeTopologyWindow): boolean => {
    try {
      return window.isDestroyed();
    } catch {
      snapshotErrors.add(
        `window ${window.id} destruction state could not be read`
      );
      return true;
    }
  };
  const readWindow = (
    window: PerfRuntimeTopologyWindow
  ): ReturnType<PerfRuntimeTopologyWindow['read']> => {
    try {
      return window.read();
    } catch {
      snapshotErrors.add(`window ${window.id} snapshot could not be read`);
      return {
        id: window.id,
        rendererPid: 0,
        route: '',
        bounds: { x: 0, y: 0, width: 0, height: 0 },
        visible: false,
        loaded: false,
        loading: false,
      };
    }
  };

  let removeBeforeQuit: () => void = noop;
  try {
    removeBeforeQuit = dependencies.onBeforeQuit(() => {
      cancelled = true;
      controller.abort();
    });
  } catch {
    snapshotErrors.add('before-quit cancellation listener could not be added');
  }

  const writeMarker = (marker: PerfRuntimeTopologyMarker): void => {
    try {
      dependencies.writeMarker(marker);
    } catch {
      // A logger failure must not reject the app startup or background task.
    }
  };

  const run = async () => {
    const initialWindows = getWindows();
    const attemptedIds = new Set<number>();
    let pending = initialWindows;
    let timedOut = false;

    // A second event-driven pass catches a window created during the first
    // readiness wait. The fixed pass count and shared deadline bound startup.
    for (let pass = 0; pass < 2 && pending.length > 0; pass++) {
      pending.forEach((window) => attemptedIds.add(window.id));
      const results = await Promise.all(
        pending.map((window) =>
          waitUntilReady(window, deadline, controller.signal, snapshotErrors)
        )
      );
      timedOut ||= results.includes('timeout');
      if (cancelled) return;

      const currentWindows = getWindows();
      pending = currentWindows.filter(
        (window) => !attemptedIds.has(window.id) && !isDestroyed(window)
      );
      if (pass === 1) pending = [];
    }
    if (cancelled) return;

    const finalWindows = getWindows().filter((window) => !isDestroyed(window));
    const topologyChanged =
      initialWindows.length !== finalWindows.length ||
      initialWindows.some(
        (window) => !finalWindows.some((current) => current.id === window.id)
      );
    const windows: PerfRuntimeWindowSnapshot[] = finalWindows.map((window) => {
      const state = readWindow(window);
      return {
        id: window.id,
        rendererPid: state.rendererPid,
        route: state.route,
        role: routeForRole(state.route),
        bounds: state.bounds,
        visible: state.visible,
        ready: state.loaded && !state.loading && state.rendererPid > 0,
      };
    });

    let processCounts: Record<string, number> = {};
    let processMetricsAvailable = true;
    try {
      processCounts = dependencies.getProcessTypes().reduce(
        (counts, type) => {
          counts[type] = (counts[type] ?? 0) + 1;
          return counts;
        },
        {} as Record<string, number>
      );
    } catch {
      processMetricsAvailable = false;
      snapshotErrors.add('runtime process metrics could not be read');
    }
    const complete =
      !timedOut &&
      processMetricsAvailable &&
      snapshotErrors.size === 0 &&
      windows.every((window) => window.ready);
    writeMarker({
      timestamp: new Date().toISOString(),
      runId: dependencies.runId,
      complete,
      timedOut,
      topologyChanged,
      processMetricsAvailable,
      snapshotErrors: [...snapshotErrors],
      windows,
      processCounts,
    });
  };

  const cleanup = () => {
    completed = true;
    try {
      removeBeforeQuit();
    } catch {
      // Cleanup is best-effort and must not reject application startup.
    }
  };

  void run()
    .catch(() => {
      if (cancelled) return;
      writeMarker({
        timestamp: new Date().toISOString(),
        runId: dependencies.runId,
        complete: false,
        timedOut: false,
        topologyChanged: false,
        processMetricsAvailable: false,
        snapshotErrors: [
          ...snapshotErrors,
          'runtime topology capture failed unexpectedly',
        ],
        windows: [],
        processCounts: {},
      });
    })
    .finally(cleanup)
    .catch(() => undefined);

  return {
    cancel: () => {
      if (completed || cancelled) return;
      cancelled = true;
      controller.abort();
      cleanup();
    },
  };
}
