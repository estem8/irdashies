import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useDashboard,
  useDriverTires,
  useFuelProjectionSelector,
  usePitServiceSnapshot,
} from '@irdashies/context';
import logger from '@irdashies/utils/logger';
import { getWidgetDefaultConfig, type PieMenuConfig } from '@irdashies/types';
import { PieMenuView } from './PieMenuView';
import {
  DEMO_PIT_SERVICE,
  INITIAL_PIE_STATE,
  compoundIndexes,
  describePitService,
  fuelToFinish,
  stepPieMenu,
  type PieContext,
  type PieState,
} from './pieMenuModel';

const DEFAULT_CONFIG = getWidgetDefaultConfig('piemenu');
const MAX_FADE_MS = 1000;

/** Litres to finish, rounded up so the widget re-renders on whole litres. */
const selectFuelToAdd = (
  snapshot: Parameters<typeof fuelToFinish>[0]
): number | undefined => {
  const litres = fuelToFinish(snapshot);
  return litres === undefined ? undefined : Math.ceil(litres);
};

/** Laps the fuel in the tank lasts, to a tenth, so the widget re-renders rarely. */
const selectFuelLaps = (
  snapshot: Parameters<typeof fuelToFinish>[0]
): number | undefined =>
  snapshot && snapshot.projectedLapUsage > 0
    ? Math.round((snapshot.fuelLevel / snapshot.projectedLapUsage) * 10) / 10
    : undefined;

export const PieMenu = () => {
  const { currentDashboard, isDemoMode } = useDashboard();
  const savedConfig = currentDashboard?.widgets.find(
    (widget) => widget.id === 'piemenu'
  )?.config as Partial<PieMenuConfig> | undefined;
  const config = useMemo(
    () => ({ ...DEFAULT_CONFIG, ...savedConfig }),
    [savedConfig]
  );
  const { timeoutSeconds } = config;

  const snapshot = usePitServiceSnapshot();
  const sessionTires = useDriverTires();
  const fuelToAdd = useFuelProjectionSelector(selectFuelToAdd);
  const fuelLaps = useFuelProjectionSelector(selectFuelLaps);
  const service = useMemo(
    () =>
      isDemoMode
        ? DEMO_PIT_SERVICE
        : describePitService(snapshot, sessionTires, fuelLaps),
    [isDemoMode, snapshot, sessionTires, fuelLaps]
  );

  // Read when a side is pressed, so the handler does not resubscribe.
  const live = useRef({ config, flags: 0, sessionTires, fuelToAdd });
  live.current = {
    config,
    flags: snapshot?.flags ?? 0,
    sessionTires,
    fuelToAdd,
  };

  const [state, setState] = useState<PieState>(INITIAL_PIE_STATE);
  const stateRef = useRef(state);
  const [activity, setActivity] = useState(0);
  const [fading, setFading] = useState(false);

  const timeoutMs = timeoutSeconds * 1000;
  const fadeMs = Math.min(MAX_FADE_MS, timeoutMs / 2);

  const apply = useCallback((next: PieState) => {
    stateRef.current = next;
    setState(next);
    setFading(false);
    setActivity((n) => n + 1);
  }, []);

  useEffect(() => {
    return window.pieMenuBridge?.onInput((input) => {
      const { config, flags, sessionTires, fuelToAdd } = live.current;
      const context: PieContext = {
        flags,
        compounds: compoundIndexes(sessionTires),
        fuelToAdd,
      };
      const { state: next, commands } = stepPieMenu(
        stateRef.current,
        input,
        config,
        context
      );
      apply(next);
      if (commands.length > 0) {
        window.pieMenuBridge?.sendPitCommands(commands).catch((err) => {
          logger.error('Pie menu pit command failed', err);
        });
      }
    });
  }, [apply]);

  // Fade out over the last stretch of the timeout, then close.
  const open = state.level !== 'closed';
  useEffect(() => {
    if (!open) return;
    const fade = setTimeout(() => setFading(true), timeoutMs - fadeMs);
    const close = setTimeout(() => apply(INITIAL_PIE_STATE), timeoutMs);
    return () => {
      clearTimeout(fade);
      clearTimeout(close);
    };
  }, [open, activity, timeoutMs, fadeMs, apply]);

  // Settings preview: show the menu open so it can be positioned.
  const shown: PieState = isDemoMode ? { level: 'root' } : state;
  if (shown.level === 'closed') return null;

  return (
    <div
      className={`w-full h-full transition-opacity ${fading ? 'opacity-0' : 'opacity-100'}`}
      style={{ transitionDuration: `${fading ? fadeMs : 0}ms` }}
    >
      <PieMenuView state={shown} config={config} service={service} />
    </div>
  );
};
PieMenu.displayName = 'PieMenu';
