import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import type { RatingPoint, Session } from '@irdashies/types';
import logger from '../logger';

/**
 * The player's iRating and safety rating over time, one point per change, as
 * seen in live sessions on this PC. There is no backfill: iRacing's Data API
 * is the only source of older values and needs an OAuth client.
 *
 * Kept in its own file rather than config.json, for the same reason as
 * known-local-user-ids.json: config.json is written synchronously.
 */
const FILE_NAME = 'rating-history.json';

/** Cap (R6.3): the newest points across all users and categories. */
export const MAX_RATING_POINTS = 5000;

const WRITE_DEBOUNCE_MS = 250;

interface PersistedRatingHistory {
  points: RatingPoint[];
}

function getStorageDir(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app } = require('electron') as typeof import('electron');
  return app.getPath('userData');
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isRatingPoint = (value: unknown): value is RatingPoint => {
  if (!value || typeof value !== 'object') return false;
  const p = value as Partial<RatingPoint>;
  return (
    isFiniteNumber(p.at) &&
    isFiniteNumber(p.userId) &&
    typeof p.category === 'string' &&
    isFiniteNumber(p.iRating) &&
    isFiniteNumber(p.safetyRating) &&
    typeof p.licenseClass === 'string'
  );
};

const sanitize = (value: unknown): RatingPoint[] | null => {
  if (!value || typeof value !== 'object') return null;
  const points = (value as Partial<PersistedRatingHistory>).points;
  if (!Array.isArray(points)) return null;
  return points.filter(isRatingPoint).slice(-MAX_RATING_POINTS);
};

/**
 * Appends `point` unless the user's last point in that category has the same
 * ratings. Applies the cap. Returns the same array when nothing changed.
 */
export const withRatingPoint = (
  points: readonly RatingPoint[],
  point: RatingPoint
): readonly RatingPoint[] => {
  const last = points.findLast(
    (p) => p.userId === point.userId && p.category === point.category
  );
  if (
    last &&
    last.iRating === point.iRating &&
    last.safetyRating === point.safetyRating
  ) {
    return points;
  }
  return [...points, point].slice(-MAX_RATING_POINTS);
};

/**
 * The player's ratings from a live session, or null when there is nothing to
 * record: a replay file, a spectator, or a sim without ratings (LMU reports
 * IRating 0).
 */
export const ratingPointFromSession = (
  session: Session | undefined,
  at: number
): RatingPoint | null => {
  const weekend = session?.WeekendInfo;
  const info = session?.DriverInfo;
  if (!weekend || !info || weekend.SimMode === 'replay') return null;
  const driver = info.Drivers?.find((d) => d.CarIdx === info.DriverCarIdx);
  if (!driver || driver.IsSpectator) return null;
  if (!(driver.IRating > 0) || !weekend.Category) return null;
  return {
    at,
    userId: info.DriverUserID,
    category: weekend.Category,
    iRating: driver.IRating,
    safetyRating: driver.LicSubLevel / 100,
    licenseClass: driver.LicString?.trim().split(/\s+/)[0] ?? '',
  };
};

export interface RatingHistoryStore {
  /** Records a point when it differs from the last one. Writes are debounced. */
  record(point: RatingPoint): void;
  /** All points, oldest first. Resolves [] on a read error. */
  load(): Promise<readonly RatingPoint[]>;
  /** Writes any pending change now. */
  flush(): Promise<void>;
}

export function createRatingHistoryStore(
  storageDir?: string
): RatingHistoryStore {
  let points: readonly RatingPoint[] = [];
  let loaded: Promise<readonly RatingPoint[]> | null = null;
  let dirty = false;
  let writeTimer: NodeJS.Timeout | null = null;
  let writeInFlight: Promise<void> = Promise.resolve();
  const filePath = () => path.join(storageDir ?? getStorageDir(), FILE_NAME);

  const read = async (): Promise<RatingPoint[]> => {
    try {
      const parsed: unknown = JSON.parse(
        await fsp.readFile(filePath(), 'utf-8')
      );
      const sanitized = sanitize(parsed);
      if (sanitized) return sanitized;
      logger.warn('[RatingHistory] Invalid file shape:', FILE_NAME);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn('[RatingHistory] Failed to read', FILE_NAME, err);
      }
    }
    return [];
  };

  const load = (): Promise<readonly RatingPoint[]> => {
    loaded ??= read().then((stored) => {
      // Points recorded while the read was in flight go after the stored ones.
      points = points.reduce(withRatingPoint, stored);
      return points;
    });
    return loaded;
  };

  const write = async (): Promise<void> => {
    // Merge the file first so a write never drops points saved earlier.
    await load();
    if (!dirty) return;
    dirty = false;
    const target = filePath();
    const payload = JSON.stringify({
      points: [...points],
    } satisfies PersistedRatingHistory);
    const temp = `${target}.${process.pid}.tmp`;
    try {
      await fsp.mkdir(path.dirname(target), { recursive: true });
      await fsp.writeFile(temp, payload);
      await fsp.rename(temp, target);
    } catch (err) {
      logger.error('[RatingHistory] Failed to write', FILE_NAME, err);
      await fsp.unlink(temp).catch(() => undefined);
    }
  };

  const queueWrite = () => {
    writeInFlight = writeInFlight.then(write);
    return writeInFlight;
  };

  return {
    record(point) {
      const next = withRatingPoint(points, point);
      if (next === points) return;
      points = next;
      dirty = true;
      if (writeTimer) clearTimeout(writeTimer);
      writeTimer = setTimeout(() => {
        writeTimer = null;
        void queueWrite();
      }, WRITE_DEBOUNCE_MS);
    },

    load,

    flush() {
      if (writeTimer) {
        clearTimeout(writeTimer);
        writeTimer = null;
        return queueWrite();
      }
      return writeInFlight;
    },
  };
}
