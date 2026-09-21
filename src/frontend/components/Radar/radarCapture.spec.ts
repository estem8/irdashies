import { describe, expect, it } from 'vitest';
import type { Session, Telemetry } from '@irdashies/types';
import { RadarProcessor } from '../../../app/processors/RadarProcessor';
import tracks from '../../assets/data/tracks.json';
import type { TrackDrawing } from '@irdashies/domain/trackGeometry';
import { computeRadarBlips, type RadarBlip } from './radarBlips';
import { overlapFromCarLeftRight } from './overlapSides';
import interlagosLeft from '../../../../test-data/1747384033336/telemetry.json';
import interlagosLeftSession from '../../../../test-data/1747384033336/session.json';
import interlagos from '../../../../test-data/1752616787256/telemetry.json';
import interlagosSession from '../../../../test-data/1752616787256/session.json';
import brands from '../../../../test-data/1731663749009/telemetry.json';
import brandsSession from '../../../../test-data/1731663749009/session.json';
import watkins from '../../../../test-data/1781323503005/telemetry.json';
import watkinsSession from '../../../../test-data/1781323503005/session.json';
import paulRicard from '../../../../test-data/1763227688917/telemetry.json';
import paulRicardSession from '../../../../test-data/1763227688917/session.json';

/**
 * The radar's placement, checked against recordings rather than against its own
 * arithmetic. iRacing publishes no per-car world position, so lap distance is
 * the only geometry there is — but the sim *does* publish its own distance to
 * the car ahead and behind the player (`CarDistAhead`/`CarDistBehind`), and
 * that is an independent oracle for exactly the quantity the radar draws.
 *
 * A capture is one frame, which is what a placement assertion needs: the
 * recorded `CarIdxLapDistPct`, the recorded `CarLeftRight` verdict and the
 * recorded oracle distances all describe the same instant.
 */

const trackDrawings = tracks as unknown as Record<
  number,
  TrackDrawing | undefined
>;

/** Track length in metres as the session reports it. */
const trackLengthOf = (session: { WeekendInfo: { TrackLength: string } }) => {
  const match = /([\d.]+)\s*(km|mi)?/.exec(session.WeekendInfo.TrackLength);
  if (!match) throw new Error('capture has no parsable track length');
  if (match[2] === 'km') return Number(match[1]) * 1000;
  if (match[2] === 'mi') return Number(match[1]) * 1609.344;
  return Number(match[1]);
};

interface Capture {
  name: string;
  telemetry: Record<string, { value: unknown[] }>;
  session: {
    WeekendInfo: { TrackID: number; TrackLength: string };
    DriverInfo: { DriverCarIdx: number };
  };
}

const place = (capture: Capture, options: { isRace?: boolean } = {}) => {
  const { telemetry, session } = capture;
  const processor = new RadarProcessor();
  processor.init(session as unknown as Session);
  processor.onFrame(telemetry as unknown as Telemetry);
  const snapshot = processor.snapshot();

  const result = computeRadarBlips({
    carIdxLapDistPct: snapshot.carIdxLapDistPct,
    carIdxLap: snapshot.carIdxLap,
    carIdxOnPitRoad: snapshot.carIdxOnPitRoad,
    playerCarIdx: snapshot.focusCarIdx,
    isRace: options.isRace ?? true,
    trackDrawing: trackDrawings[session.WeekendInfo.TrackID],
    trackLengthM: trackLengthOf(session),
    radarRange: 15,
    hideInPit: true,
    overlap: overlapFromCarLeftRight(
      (telemetry.CarLeftRight?.value?.[0] as number) ?? 0
    ),
    vehicleWidth: 1.9,
    vehicleLength: 4.5,
    thresholds: { nearbyRange: 7, clearRange: 10, criticalRange: 1.5 },
    fadeBandM: 3,
    carNumbers: new Map(),
    paceCarIdx: null,
    previousTargets: new Map(),
  });

  const scalar = (key: string) => telemetry[key]?.value?.[0] as number;
  return {
    blips: result.blips,
    hasGeometry: result.hasGeometry,
    playerOnRoad: result.playerOnRoad,
    simAheadM: scalar('CarDistAhead'),
    simBehindM: scalar('CarDistBehind'),
    playerCarIdx: session.DriverInfo.DriverCarIdx,
  };
};

/** The nearest blip ahead of the player, or behind them when `sign` is -1. */
const nearest = (blips: readonly RadarBlip[], sign: 1 | -1) =>
  blips
    .filter((blip) => Math.sign(blip.alongM) === sign)
    .sort((a, b) => a.gapM - b.gapM)[0];

const CAPTURES: Capture[] = [
  {
    name: 'Interlagos, a lap-up car closing',
    telemetry: interlagosLeft as never,
    session: interlagosLeftSession as never,
  },
  {
    name: 'Interlagos, a car just ahead',
    telemetry: interlagos as never,
    session: interlagosSession as never,
  },
  {
    name: 'Brands Hatch, one each way',
    telemetry: brands as never,
    session: brandsSession as never,
  },
  {
    name: 'Watkins Glen, a car alongside',
    telemetry: watkins as never,
    session: watkinsSession as never,
  },
  {
    name: 'Paul Ricard, a car ahead',
    telemetry: paulRicard as never,
    session: paulRicardSession as never,
  },
];

describe('radar placement over recorded telemetry', () => {
  for (const capture of CAPTURES) {
    it(`puts the nearest cars where the sim does — ${capture.name}`, () => {
      const placed = place(capture);
      expect(placed.hasGeometry).toBe(true);
      expect(placed.playerOnRoad).toBe(true);

      // The sim's own distances describe the nearest car each way. It publishes
      // a sentinel when there is nothing within half a kilometre, so a usable
      // distance inside the range must come back as a blip at that distance —
      // and one behind the player must come back negative, which is the case a
      // missing lap wrap gets wrong by a whole lap.
      const withinRange = (metres: number) =>
        Number.isFinite(metres) && metres >= 0 && metres <= 15;
      if (withinRange(placed.simAheadM))
        expect(nearest(placed.blips, 1)?.alongM).toBeCloseTo(
          placed.simAheadM,
          1
        );
      if (withinRange(placed.simBehindM))
        expect(nearest(placed.blips, -1)?.alongM).toBeCloseTo(
          -placed.simBehindM,
          1
        );

      for (const blip of placed.blips) {
        expect(blip.gapM).toBeCloseTo(Math.abs(blip.alongM), 6);
        expect(Math.abs(blip.alongM)).toBeLessThanOrEqual(15);
      }
    });
  }

  it('draws a car the sim reports alongside on that side, clear of the player', () => {
    // Interlagos with CarLeftRight = CarLeft: the car sits 4.6 m back on the
    // same centreline, so without the verdict it would be painted through the
    // player's own rectangle.
    const placed = place(CAPTURES[0]);
    expect(placed.blips).toHaveLength(1);
    const [alongside] = placed.blips;
    expect(alongside.side).toBe(-1);
    expect(alongside.lateralM).toBeLessThan(0);
    // One car width plus a margin, so the two bodies do not overlap.
    expect(Math.abs(alongside.lateralM)).toBeGreaterThan(1.9);
    expect(alongside.level).toBe('nearby');
  });

  it('flags the car lapping the player and leaves the rest alone', () => {
    // In that same capture the car is on lap 9 with the player on lap 8, a lap
    // up and closing from behind: the blue flag, arriving.
    const placed = place(CAPTURES[0]);
    expect(placed.blips[0].lapping).toBe(true);

    // The other captures have no car a lap up, however many of them there are.
    for (const capture of CAPTURES.slice(1)) {
      expect(place(capture).blips.filter((blip) => blip.lapping)).toEqual([]);
    }
  });

  it('treats laps as meaningless outside a race', () => {
    // In practice a car a lap "up" has simply been out longer, so the counters
    // must not paint it blue.
    const placed = place(CAPTURES[0], { isRace: false });
    expect(placed.blips[0].lapping).toBe(false);
  });

  it('gives the same car the blue flag when it is a full lap ahead', () => {
    // A controlled lap gap on a real position: the car 2.1 m ahead of the
    // player, one lap further round. Nothing else about the frame changes.
    const capture = CAPTURES[1];
    const laps = (capture.telemetry.CarIdxLap.value as number[]).slice();
    const aheadCarIdx = 35;
    laps[aheadCarIdx] += 1;

    const placed = place({
      ...capture,
      telemetry: {
        ...capture.telemetry,
        CarIdxLap: { value: laps },
      },
    });

    const ahead = placed.blips.find((blip) => blip.carIdx === aheadCarIdx);
    expect(ahead?.lapping).toBe(true);
    for (const blip of placed.blips) {
      if (blip.carIdx !== aheadCarIdx) expect(blip.lapping).toBe(false);
    }
  });
});
