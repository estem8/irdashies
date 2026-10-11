import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RatingPoint, Session } from '@irdashies/types';
import {
  MAX_RATING_POINTS,
  createRatingHistoryStore,
  ratingPointFromSession,
  withRatingPoint,
} from './ratingHistory';

vi.mock('../logger', () => ({
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const point = (overrides: Partial<RatingPoint> = {}): RatingPoint => ({
  at: 1,
  userId: 42,
  category: 'Road',
  iRating: 1500,
  safetyRating: 3.21,
  licenseClass: 'B',
  ...overrides,
});

const session = (
  driver: Record<string, unknown> = {},
  weekend: Record<string, unknown> = {}
) =>
  ({
    WeekendInfo: { SimMode: 'full', Category: 'Road', ...weekend },
    DriverInfo: {
      DriverCarIdx: 3,
      DriverUserID: 42,
      Drivers: [
        {
          CarIdx: 3,
          IRating: 1834,
          LicSubLevel: 432,
          LicString: 'A 4.32',
          IsSpectator: 0,
          ...driver,
        },
      ],
    },
  }) as unknown as Session;

describe('withRatingPoint', () => {
  it('drops a point equal to the last one for that user and category', () => {
    const points = [point()];
    expect(withRatingPoint(points, point({ at: 2 }))).toBe(points);
  });

  it('keeps a change, and tracks categories separately', () => {
    const points = [point(), point({ category: 'Oval', iRating: 900 })];
    expect(
      withRatingPoint(points, point({ at: 3, iRating: 1520 }))
    ).toHaveLength(3);
    // Same as the last Road point even though Oval came after it.
    expect(withRatingPoint(points, point({ at: 3 }))).toBe(points);
  });

  it('keeps only the newest points past the cap', () => {
    const full = Array.from({ length: MAX_RATING_POINTS }, (_, i) =>
      point({ at: i, iRating: i })
    );
    const next = withRatingPoint(full, point({ at: -1, iRating: -1 }));
    expect(next).toHaveLength(MAX_RATING_POINTS);
    expect(next[0].iRating).toBe(1);
    expect(next.at(-1)?.iRating).toBe(-1);
  });
});

describe('ratingPointFromSession', () => {
  it('reads the player car', () => {
    expect(ratingPointFromSession(session(), 7)).toEqual({
      at: 7,
      userId: 42,
      category: 'Road',
      iRating: 1834,
      safetyRating: 4.32,
      licenseClass: 'A',
    });
  });

  it('ignores replays, spectators and sims without ratings', () => {
    expect(
      ratingPointFromSession(session({}, { SimMode: 'replay' }), 1)
    ).toBeNull();
    expect(ratingPointFromSession(session({ IsSpectator: 1 }), 1)).toBeNull();
    expect(ratingPointFromSession(session({ IRating: 0 }), 1)).toBeNull();
    expect(ratingPointFromSession(undefined, 1)).toBeNull();
  });
});

describe('createRatingHistoryStore', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'rating-history-'));
  });
  afterEach(async () => {
    await fsp.rm(dir, { recursive: true, force: true });
  });

  it('persists points and merges them with the file on the next run', async () => {
    const first = createRatingHistoryStore(dir);
    first.record(point());
    first.record(point({ at: 2 })); // unchanged, dropped
    first.record(point({ at: 3, iRating: 1530 }));
    await first.flush();

    const second = createRatingHistoryStore(dir);
    second.record(point({ at: 4, iRating: 1530 })); // equals the stored last
    second.record(point({ at: 5, iRating: 1560 }));
    await second.flush();

    const third = createRatingHistoryStore(dir);
    expect((await third.load()).map((p) => p.iRating)).toEqual([
      1500, 1530, 1560,
    ]);
  });

  it('resolves [] for a corrupt file', async () => {
    await fsp.writeFile(path.join(dir, 'rating-history.json'), '{nope');
    expect(await createRatingHistoryStore(dir).load()).toEqual([]);
  });
});
