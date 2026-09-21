import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RadarBlip } from '../radarBlips';
import type { RadarOverlap } from '../overlapSides';

export interface RadarDisplayProps {
  mode: 'disc' | 'portrait' | 'bars';
  blips: readonly RadarBlip[];
  overlap: RadarOverlap;
  /** Metres from the player to the edge of the view. */
  radarRange: number;
  /** Gap at which a car turns amber; drawn as a range ring or bar marker. */
  nearbyRange: number;
  vehicleWidth: number;
  vehicleLength: number;
  showCarNumbers: boolean;
  /** Pulse a critical blip and the rim arch. */
  pulseWhenCritical: boolean;
  showOverlapIndicator: boolean;
  colorFar: string;
  colorNearby: string;
  colorCritical: string;
  colorPlayer: string;
  colorInPit: string;
  bgOpacity: number;
  /** Seconds, for the pulse. Passed in so the draw stays pure and testable. */
  nowSeconds: number;
}

interface Size {
  width: number;
  height: number;
}

/** Blip colour by proximity. Pit-road cars keep their own colour instead. */
const colorFor = (blip: RadarBlip, props: RadarDisplayProps): string => {
  if (blip.inPit) return props.colorInPit;
  if (blip.level === 'critical') return props.colorCritical;
  if (blip.level === 'nearby') return props.colorNearby;
  return props.colorFar;
};

/** Critical blips breathe; everything else is steady. */
const alphaFor = (blip: RadarBlip, props: RadarDisplayProps): number => {
  if (!props.pulseWhenCritical || blip.level !== 'critical') return 1;
  return 0.55 + 0.45 * Math.abs(Math.sin(props.nowSeconds * Math.PI));
};

const drawVehicle = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  widthPx: number,
  lengthPx: number,
  rotation: number,
  fill: string,
  alpha: number,
  label: string | null
) => {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.beginPath();
  ctx.roundRect(
    -widthPx / 2,
    -lengthPx / 2,
    widthPx,
    lengthPx,
    Math.min(widthPx, lengthPx) * 0.25
  );
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.stroke();

  if (label && widthPx >= 10) {
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.font = `600 ${Math.round(Math.max(7, Math.min(widthPx * 0.7, 11)))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 0);
  }
  ctx.restore();
};

const drawDisc = (
  ctx: CanvasRenderingContext2D,
  props: RadarDisplayProps,
  size: Size
) => {
  const centreX = size.width / 2;
  const centreY = size.height / 2;
  const radius = Math.max(1, Math.min(size.width, size.height) / 2 - 2);
  const scale = radius / Math.max(1, props.radarRange);
  const widthPx = Math.max(4, props.vehicleWidth * scale);
  const lengthPx = Math.max(6, props.vehicleLength * scale);

  ctx.save();
  ctx.beginPath();
  ctx.arc(centreX, centreY, radius, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(100, Math.max(0, props.bgOpacity)) / 100})`;
  ctx.fill();

  // Clip to the disc: a car further across the road than the range would
  // otherwise paint over the widget's edges.
  ctx.beginPath();
  ctx.arc(centreX, centreY, radius, 0, Math.PI * 2);
  ctx.clip();

  // Engage ring, so the driver can see where amber starts.
  if (props.nearbyRange < props.radarRange) {
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath();
    ctx.arc(centreX, centreY, props.nearbyRange * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  for (const blip of props.blips) {
    drawVehicle(
      ctx,
      centreX + blip.lateralM * scale,
      centreY - blip.alongM * scale,
      widthPx,
      lengthPx,
      blip.relYaw,
      colorFor(blip, props),
      alphaFor(blip, props),
      props.showCarNumbers ? blip.carNumber : null
    );
  }
  ctx.restore();

  drawVehicle(
    ctx,
    centreX,
    centreY,
    widthPx,
    lengthPx,
    0,
    props.colorPlayer,
    1,
    null
  );

  // Warning arch on the rim, at a critical car's bearing.
  const critical = props.blips.filter((blip) => blip.level === 'critical');
  for (const blip of critical) {
    const bearing = Math.atan2(blip.lateralM, blip.alongM);
    ctx.save();
    ctx.beginPath();
    ctx.arc(
      centreX,
      centreY,
      radius - 2,
      -Math.PI / 2 + bearing - 0.32,
      -Math.PI / 2 + bearing + 0.32
    );
    ctx.lineWidth = Math.max(2, radius * 0.06);
    ctx.strokeStyle = props.colorCritical;
    ctx.globalAlpha = props.pulseWhenCritical
      ? 0.45 + 0.55 * Math.abs(Math.sin(props.nowSeconds * Math.PI))
      : 0.9;
    ctx.stroke();
    ctx.restore();
  }
};

/**
 * A vertical lane: the player fixed at the centre, cars placed fore and aft by
 * their real gap, over metre-labelled rings. Lateral spread is the centreline's
 * and is compressed, because the interesting question on a long run is closing
 * speed, not which side of the road a car is on.
 */
const drawPortrait = (
  ctx: CanvasRenderingContext2D,
  props: RadarDisplayProps,
  size: Size
) => {
  const centreX = size.width / 2;
  const centreY = size.height / 2;
  const half = Math.max(1, size.height / 2 - 2);
  const scale = half / Math.max(1, props.radarRange);
  const widthPx = Math.max(4, props.vehicleWidth * (scale * 0.55));
  const lengthPx = Math.max(6, props.vehicleLength * scale);
  const lateralScale = scale * 0.55;

  ctx.save();
  ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(100, Math.max(0, props.bgOpacity)) / 100})`;
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.beginPath();
  ctx.rect(0, 0, size.width, size.height);
  ctx.clip();

  // Metre rings at the engage distance, at half range, and at full range.
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const metres of [props.nearbyRange, props.radarRange]) {
    if (metres > props.radarRange) continue;
    const y = centreY - metres * scale;
    for (const [target, sign] of [
      [y, 1],
      [centreY + metres * scale, -1],
    ] as const) {
      ctx.setLineDash([3, 4]);
      ctx.lineWidth = 1;
      ctx.strokeStyle =
        metres === props.nearbyRange
          ? 'rgba(245,158,11,0.28)'
          : 'rgba(255,255,255,0.16)';
      ctx.beginPath();
      ctx.moveTo(0, target);
      ctx.lineTo(size.width, target);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText(`${metres} m`, 3, target + sign * -6);
    }
  }

  for (const blip of props.blips) {
    drawVehicle(
      ctx,
      centreX + blip.lateralM * lateralScale,
      centreY - blip.alongM * scale,
      widthPx,
      lengthPx,
      0,
      colorFor(blip, props),
      alphaFor(blip, props),
      props.showCarNumbers ? blip.carNumber : null
    );
  }

  drawVehicle(
    ctx,
    centreX,
    centreY,
    widthPx,
    lengthPx,
    0,
    props.colorPlayer,
    1,
    null
  );
  ctx.restore();
};

/**
 * Two thin strips beside the sightline. Each fills from the centre out and
 * shifts colour as a car comes alongside, so the widget is empty until it has
 * something to say.
 */
const drawBars = (
  ctx: CanvasRenderingContext2D,
  props: RadarDisplayProps,
  size: Size
) => {
  const nearest = (side: -1 | 1) => {
    let best: RadarBlip | null = null;
    for (const blip of props.blips) {
      if (blip.inPit) continue;
      if (side === -1 ? blip.side !== -1 : blip.side !== 1) continue;
      if (!best || blip.gapM < best.gapM) best = blip;
    }
    return best;
  };

  const strip = (side: -1 | 1) => {
    const blip = nearest(side);
    if (!blip) return;
    const fill = colorFor(blip, props);
    const presence = Math.max(
      0.15,
      Math.min(1, 1 - blip.gapM / Math.max(1, props.radarRange))
    );
    const height = Math.max(6, size.height * presence);
    const y = (size.height - height) / 2;
    // A car alongside fills further than one three metres back.
    const nearness =
      1 - Math.min(1, blip.gapM / Math.max(1, props.vehicleLength * 2));
    const width = size.width * (0.4 + 0.6 * nearness);
    const x = side === -1 ? 0 : size.width - width;

    ctx.save();
    ctx.globalAlpha = alphaFor(blip, props);
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, Math.min(6, height / 2));
    const gradient =
      side === -1
        ? ctx.createLinearGradient(0, 0, width, 0)
        : ctx.createLinearGradient(size.width, 0, size.width - width, 0);
    gradient.addColorStop(0, fill);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.restore();

    if (props.showCarNumbers && blip.carNumber) {
      ctx.save();
      ctx.globalAlpha = alphaFor(blip, props);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = '600 10px sans-serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = side === -1 ? 'left' : 'right';
      ctx.fillText(
        blip.carNumber,
        side === -1 ? 4 : size.width - 4,
        size.height / 2
      );
      ctx.restore();
    }
  };

  strip(-1);
  strip(1);
};

const drawRadar = (
  canvas: HTMLCanvasElement,
  props: RadarDisplayProps,
  size: Size,
  theme: 'light' | 'dark'
) => {
  const ctx = canvas.getContext('2d');
  if (!ctx || size.width <= 0 || size.height <= 0) return;

  const dpr = window.devicePixelRatio || 1;
  const backingWidth = Math.max(1, Math.round(size.width * dpr));
  const backingHeight = Math.max(1, Math.round(size.height * dpr));
  if (canvas.width !== backingWidth) canvas.width = backingWidth;
  if (canvas.height !== backingHeight) canvas.height = backingHeight;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size.width, size.height);
  void theme;

  if (props.mode === 'portrait') drawPortrait(ctx, props, size);
  else if (props.mode === 'bars') drawBars(ctx, props, size);
  else drawDisc(ctx, props, size);
};

export const RadarDisplay = (props: Omit<RadarDisplayProps, 'nowSeconds'>) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [nowSeconds, setNowSeconds] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvas?.parentElement ?? canvas;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      const next = {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
      // ResizeObserver reports layout passes, not size changes: without this
      // bail-out every layout pass would cost a render and a canvas redraw.
      setSize((current) =>
        current.width === next.width && current.height === next.height
          ? current
          : next
      );
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Only the pulse needs a clock; with it off the disc redraws on data alone.
  const pulses =
    props.pulseWhenCritical &&
    props.blips.some((blip) => blip.level === 'critical');
  useEffect(() => {
    if (!pulses) return;
    let frame = 0;
    const tick = () => {
      setNowSeconds(performance.now() / 1000);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [pulses]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) drawRadar(canvas, { ...props, nowSeconds }, size, 'dark');
  });

  return <canvas ref={canvasRef} className="h-full w-full" />;
};
