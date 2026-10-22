import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  trackStateSelectors,
  useDashboard,
  useDriverTires,
  useFuelProjectionSelector,
  usePitServiceSnapshot,
  useTrackStateSelector,
} from '@irdashies/context';
import logger from '@irdashies/utils/logger';
import {
  getWidgetDefaultConfig,
  type PieMenuConfig,
  type PieMenuInput,
  type PitServiceSnapshot,
} from '@irdashies/types';
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
/** A result only needs a glance; the menu itself waits for timeoutSeconds. */
const RESULT_MS = 2500;
/** How long the pressed side stays lit before the next menu comes up. */
const PRESS_FLASH_MS = 120;
/** If the pit box has not changed by then, the sim did not take the pick. */
const APPLY_CHECK_MS = 1200;

/** What a pit command can change; the same before and after means it did nothing. */
const pitSignature = (snapshot: PitServiceSnapshot | undefined) =>
  `${snapshot?.flags}|${snapshot?.plannedFuel}|${snapshot?.plannedCompound}`;

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

/** Laps of fuel beyond the finish, to a tenth; undefined when the race length is unknown. */
const selectFuelMargin = (
  snapshot: Parameters<typeof fuelToFinish>[0]
): number | undefined =>
  snapshot?.hasValidRaceEstimate && snapshot.projectedLapUsage > 0
    ? Math.round(
        (snapshot.fuelLevel / snapshot.projectedLapUsage -
          snapshot.estimatedLapsRemaining) *
          10
      ) / 10
    : undefined;

/** Litres the finish needs on top of the tank, 0 when it is enough; undefined when unknown. */
const selectFuelNeed = (
  snapshot: Parameters<typeof fuelToFinish>[0]
): number | undefined =>
  snapshot?.hasValidRaceEstimate && snapshot.projectedLapUsage > 0
    ? Math.ceil(fuelToFinish(snapshot) ?? 0)
    : undefined;

const selectLapUsage = (
  snapshot: Parameters<typeof fuelToFinish>[0]
): number | undefined =>
  snapshot && snapshot.projectedLapUsage > 0
    ? Math.round(snapshot.projectedLapUsage * 10) / 10
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

  const snapshot = usePitServiceSnapshot();
  const sessionTires = useDriverTires();
  const fuelToAdd = useFuelProjectionSelector(selectFuelToAdd);
  const fuelLaps = useFuelProjectionSelector(selectFuelLaps);
  const fuelMargin = useFuelProjectionSelector(selectFuelMargin);
  const lapUsage = useFuelProjectionSelector(selectLapUsage);
  const fuelNeed = useFuelProjectionSelector(selectFuelNeed);
  const isOnTrack = useTrackStateSelector(trackStateSelectors.isOnTrack);
  const isReplay = useTrackStateSelector(trackStateSelectors.isReplayPlaying);
  // Pit commands only work from the driver's seat, so the menu stays out of the way otherwise.
  const active = isDemoMode || (Boolean(isOnTrack) && !isReplay);
  const service = useMemo(
    () =>
      isDemoMode
        ? DEMO_PIT_SERVICE
        : describePitService(snapshot, sessionTires, {
            laps: fuelLaps,
            marginLaps: fuelMargin,
            lapUsage,
            toFinish: fuelNeed,
          }),
    [
      isDemoMode,
      snapshot,
      sessionTires,
      fuelLaps,
      fuelMargin,
      lapUsage,
      fuelNeed,
    ]
  );

  // Read when a side is pressed, so the handler does not resubscribe.
  const live = useRef({ config, snapshot, sessionTires, fuelToAdd, active });
  live.current = { config, snapshot, sessionTires, fuelToAdd, active };

  const [state, setState] = useState<PieState>(INITIAL_PIE_STATE);
  // Ahead of `state` while a pressed side is still lit, so fast presses chain.
  const stateRef = useRef(state);
  const [pressed, setPressed] = useState<PieMenuInput>();
  const [unapplied, setUnapplied] = useState(false);
  const [activity, setActivity] = useState(0);
  const [fading, setFading] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const checkTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const timeoutMs =
    state.level === 'result' ? RESULT_MS : config.timeoutSeconds * 1000;
  const fadeMs = Math.min(MAX_FADE_MS, timeoutMs / 2);

  const show = useCallback((next: PieState) => {
    clearTimeout(flashTimer.current);
    setPressed(undefined);
    setState(next);
    setFading(false);
    setActivity((n) => n + 1);
  }, []);

  const apply = useCallback(
    (next: PieState) => {
      stateRef.current = next;
      show(next);
    },
    [show]
  );

  useEffect(() => {
    return window.pieMenuBridge?.onInput((input) => {
      const { config, snapshot, sessionTires, fuelToAdd, active } =
        live.current;
      if (!active) return;
      const context: PieContext = {
        flags: snapshot?.flags ?? 0,
        compounds: compoundIndexes(sessionTires),
        fuelToAdd,
        plannedFuel: snapshot?.plannedFuel,
        plannedCompound: snapshot?.plannedCompound,
        currentCompound: snapshot?.currentCompound,
      };
      const previous = stateRef.current;
      const { state: next, commands } = stepPieMenu(
        previous,
        input,
        config,
        context
      );
      if (next === previous) return;
      stateRef.current = next;

      clearTimeout(checkTimer.current);
      setUnapplied(false);
      if (commands.length > 0) {
        // Sent at once; only the picture waits for the flash.
        window.pieMenuBridge?.sendPitCommands(commands).catch((err) => {
          logger.error('Pie menu pit command failed', err);
        });
        const before = pitSignature(snapshot);
        checkTimer.current = setTimeout(() => {
          if (pitSignature(live.current.snapshot) === before) {
            setUnapplied(true);
          }
        }, APPLY_CHECK_MS);
      }

      const ringShowing = previous.level === 'root' || previous.level === 'sub';
      if (input !== 'open' && ringShowing) {
        clearTimeout(flashTimer.current);
        setPressed(input);
        flashTimer.current = setTimeout(
          () => show(stateRef.current),
          PRESS_FLASH_MS
        );
      } else {
        show(next);
      }
    });
  }, [show]);

  useEffect(
    () => () => {
      clearTimeout(flashTimer.current);
      clearTimeout(checkTimer.current);
    },
    []
  );

  // Leaving the car closes the menu, so it does not come back mid-pick.
  useEffect(() => {
    if (!active) apply(INITIAL_PIE_STATE);
  }, [active, apply]);

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
  if (shown.level === 'closed' || !active) return null;

  return (
    <div
      className={`w-full h-full transition-opacity ${fading ? 'opacity-0' : 'opacity-100'}`}
      style={{ transitionDuration: `${fading ? fadeMs : 0}ms` }}
    >
      <PieMenuView
        state={shown}
        config={config}
        service={service}
        highlight={pressed === 'open' ? undefined : pressed}
        unapplied={unapplied}
      />
    </div>
  );
};
PieMenu.displayName = 'PieMenu';
