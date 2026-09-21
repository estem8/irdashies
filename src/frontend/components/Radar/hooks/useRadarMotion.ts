import { useLayoutEffect, useRef } from 'react';
import { perfMetrics } from '@irdashies/utils/perfMetrics';
import { ProgressInterpolator } from '@irdashies/domain/progressInterpolator';
import type { RadarBlip } from '../radarBlips';

/**
 * Draws blips from metre-space position buffers, both indexed like `blips`
 * (so alongM[i] belongs to blips[i]).
 */
export type RadarMotionDraw = (
  alongM: Float64Array,
  lateralM: Float64Array,
  count: number
) => void;

interface MotionTarget {
  progress: number;
  driver: { CarIdx: number };
}

const buildTargets = (
  blips: readonly RadarBlip[],
  trackLengthM: number,
  pick: (blip: RadarBlip) => number
): MotionTarget[] => {
  const targets: MotionTarget[] = [];
  for (const blip of blips) {
    targets.push({
      progress: pick(blip) / trackLengthM,
      driver: { CarIdx: blip.carIdx },
    });
  }
  return targets;
};

/**
 * Glides the blips between 25 Hz snapshots at display refresh rate, reusing
 * the track map's interpolator so its duration adapts to the observed
 * snapshot cadence. Only geometry is smoothed: colour, proximity grading and
 * labels stay instant from the snapshot. The interpolator works in lap
 * fractions (it wraps at ±0.5 of its unit), so targets are divided by the
 * track length and the interpolated values are scaled back to metres before
 * drawing.
 */
export const useRadarMotion = (
  blips: readonly RadarBlip[],
  trackLengthM: number,
  pulseActive: boolean,
  draw: RadarMotionDraw
): void => {
  const alongRef = useRef<ProgressInterpolator | null>(null);
  const lateralRef = useRef<ProgressInterpolator | null>(null);
  const alongMRef = useRef(new Float64Array(0));
  const lateralMRef = useRef(new Float64Array(0));
  const drawRef = useRef(draw);
  const trackLengthRef = useRef(trackLengthM);
  const pulseRef = useRef(pulseActive);
  const frameRef = useRef(0);

  if (!alongRef.current) {
    alongRef.current = new ProgressInterpolator();
  }
  if (!lateralRef.current) {
    lateralRef.current = new ProgressInterpolator();
  }

  // Commit the latest callbacks and props without restarting the RAF loop.
  useLayoutEffect(() => {
    drawRef.current = draw;
    trackLengthRef.current = trackLengthM;
    pulseRef.current = pulseActive;
  });

  useLayoutEffect(() => {
    const along = alongRef.current;
    const lateral = lateralRef.current;
    if (!along || !lateral) return;

    const now = performance.now();
    const travel = along.setTargets(
      buildTargets(blips, trackLengthM, (blip) => blip.alongM),
      now
    );
    const drift = lateral.setTargets(
      buildTargets(blips, trackLengthM, (blip) => blip.lateralM),
      now
    );

    const paint = () => {
      const count = along.getCount();
      if (alongMRef.current.length < count) {
        alongMRef.current = new Float64Array(count);
        lateralMRef.current = new Float64Array(count);
      }
      const alongM = alongMRef.current;
      const lateralM = lateralMRef.current;
      const scale = trackLengthRef.current;
      const alongValues = along.getValues();
      const lateralValues = lateral.getValues();
      for (let i = 0; i < count; i++) {
        alongM[i] = alongValues[i] * scale;
        lateralM[i] = lateralValues[i] * scale;
      }
      drawRef.current(alongM, lateralM, count);
    };

    // A snapshot that only changed a colour still has to repaint.
    perfMetrics.measure('radarAnimationFrame', paint);

    let frameTime = 0;
    const measuredFrame = () => {
      const moving = along.advance(frameTime) || lateral.advance(frameTime);
      paint();
      return moving || pulseRef.current;
    };
    const frame = (now: number) => {
      frameTime = now;
      const active = perfMetrics.measure('radarAnimationFrame', measuredFrame);
      frameRef.current = active ? requestAnimationFrame(frame) : 0;
    };

    if ((travel || drift || pulseActive) && frameRef.current === 0) {
      frameRef.current = requestAnimationFrame(frame);
    }

    return () => {
      if (frameRef.current !== 0) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = 0;
      }
    };
  }, [blips, trackLengthM, pulseActive]);
};
