import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { blipLabel, type RadarBlip } from '../radarBlips';
import { useRadarMotion, type RadarMotionDraw } from '../hooks/useRadarMotion';

export interface RadarDisplayProps {
  blips: readonly RadarBlip[];
  /** Metres from the player to the edge of the view. */
  radarRange: number;
  vehicleWidth: number;
  vehicleLength: number;
  showCarNumbers: boolean;
  /** Every rival blip is filled with this; the player is `colorPlayer`. */
  colorRival: string;
  closingWarningColor?: string;
  closingSpeedThreshold?: number;
  colorAlongside: string;
  colorPlayer: string;
  bgOpacity: number;
  /** Track length in metres; drives blip motion between snapshots. */
  trackLengthM: number;
  showMap: boolean;
  /** Interleaved along-track and rightward lateral offsets, in metres. */
  mapPath: Float64Array;
  mapPointCount: number;
  /** Total metres of road shown in the following map. */
  mapWindowM: number;
  mapBorderColor: string;
  mapBorderOpacity: number;
  mapFillColor: string;
  mapFillOpacity: number;
  /** Original track path, used when the browser supports Path2D. */
  mapTrackPath?: string | null;
  mapPlayerX?: number;
  mapPlayerY?: number;
  mapForwardX?: number;
  mapForwardY?: number;
  mapRightX?: number;
  mapRightY?: number;
  mapUnitsPerMetre?: number;
  nowSeconds: number;
}

export const PULSE_STEPS_PER_SECOND = 8;

export const pulseAlpha = (seconds: number): number => {
  const phase = (seconds * PULSE_STEPS_PER_SECOND) % 1;
  return (
    Math.round((0.45 + 0.55 * Math.abs(Math.sin(Math.PI * phase))) * 8) / 8
  );
};

interface Size {
  width: number;
  height: number;
}

/**
 * Every car respects its own fade-in, so a blip never appears at full
 * strength on the edge of the range.
 */
const alphaFor = (blip: RadarBlip): number => blip.fade;
const SMOOTHING_WEIGHTS = [1, 4, 6, 4, 1] as const;

const hexColor = (value: string): [number, number, number] => {
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  if (!match) return [239, 68, 68];
  return [
    parseInt(match[1].slice(0, 2), 16),
    parseInt(match[1].slice(2, 4), 16),
    parseInt(match[1].slice(4, 6), 16),
  ];
};

const rivalColor = (blip: RadarBlip, props: RadarDisplayProps): string => {
  const speed = blip.closingSpeedMps ?? 0;
  const threshold = Math.max(0.1, props.closingSpeedThreshold ?? 5);
  if (speed <= 0) return props.colorRival;
  const amount = Math.min(1, speed / threshold);
  const from = hexColor(props.closingWarningColor ?? '#ef4444');
  const to = hexColor(props.colorRival);
  const channel = (index: number) =>
    Math.round(from[index] + (to[index] - from[index]) * amount);
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
};

/**
 * A car the driver cannot identify defeats the point of drawing it, so map
 * vehicles keep a body the driver can see and label even at long range.
 */
export const MAP_VEHICLE_MIN_WIDTH_PX = 12;

/** The minimum body width that can still carry a car number or PACE tag. */
export const VEHICLE_LABEL_MIN_WIDTH_PX = 8;

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

  if (label && widthPx >= VEHICLE_LABEL_MIN_WIDTH_PX) {
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    // Four-character PACE needs a smaller face than a two-digit number.
    const wideLabel = label.length > 3;
    const fontPx = wideLabel
      ? Math.max(6, Math.min(widthPx * 0.45, 10))
      : Math.max(7, Math.min(widthPx * 0.7, 11));
    ctx.font = `600 ${Math.round(fontPx)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 0);
  }
  ctx.restore();
};

const drawBlipVehicles = (
  ctx: CanvasRenderingContext2D,
  props: RadarDisplayProps,
  centreX: number,
  centreY: number,
  scale: number,
  widthPx: number,
  lengthPx: number,
  alongM: Float64Array,
  lateralM: Float64Array
) => {
  // A car the sim has not placed on a side is painted on the centreline, which
  // is only right while it is ahead of or behind us. Level with the player it
  // would land on the player's own rectangle — the car drives through you. The
  // disc answers that with the two rim arcs and draws no vehicle; the map has no
  // rim, so there the overlap itself is the signal and the car is drawn on top
  // of the player.
  const abreastM = Math.max(1, props.vehicleLength * 0.5);
  const hideLevelCar = !props.showMap;
  for (let i = 0; i < props.blips.length; i++) {
    const blip = props.blips[i];
    const levelAndUnknown =
      hideLevelCar && blip.rimSignal === 'both' && blip.gapM <= abreastM;
    if (!levelAndUnknown) {
      drawVehicle(
        ctx,
        centreX + lateralM[i] * scale,
        centreY - alongM[i] * scale,
        widthPx,
        lengthPx,
        blip.relYaw,
        rivalColor(blip, props),
        alphaFor(blip),
        blipLabel(blip, props.showCarNumbers)
      );
    }
  }
};

const drawPlayer = (
  ctx: CanvasRenderingContext2D,
  props: RadarDisplayProps,
  centreX: number,
  centreY: number,
  widthPx: number,
  lengthPx: number
) => {
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
};

const drawRoad = (
  ctx: CanvasRenderingContext2D,
  props: RadarDisplayProps,
  centreX: number,
  centreY: number,
  scale: number,
  widthPx: number,
  trackPath: Path2D | null
) => {
  if (trackPath) {
    const pathScale = scale / (props.mapUnitsPerMetre ?? 1);
    const playerX = props.mapPlayerX ?? 0;
    const playerY = props.mapPlayerY ?? 0;
    const forwardX = props.mapForwardX ?? 1;
    const forwardY = props.mapForwardY ?? 0;
    const rightX = props.mapRightX ?? 0;
    const rightY = props.mapRightY ?? 1;
    const playerAlong = playerX * forwardX + playerY * forwardY;
    const playerRight = playerX * rightX + playerY * rightY;
    const roadPx = Math.max(8, widthPx * 1.9);

    ctx.save();
    ctx.transform(
      pathScale * rightX,
      -pathScale * forwardX,
      pathScale * rightY,
      -pathScale * forwardY,
      centreX - playerRight * pathScale,
      centreY + playerAlong * pathScale
    );
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = (roadPx + 4) / pathScale;
    ctx.globalAlpha = Math.min(100, Math.max(0, props.mapBorderOpacity)) / 100;
    ctx.strokeStyle = props.mapBorderColor;
    ctx.stroke(trackPath);
    ctx.lineWidth = roadPx / pathScale;
    ctx.globalAlpha = Math.min(100, Math.max(0, props.mapFillOpacity)) / 100;
    ctx.strokeStyle = props.mapFillColor;
    ctx.stroke(trackPath);
    ctx.restore();
    return;
  }

  const pointCount = Math.min(
    props.mapPointCount,
    Math.floor(props.mapPath.length / 2)
  );
  if (pointCount < 2) return;

  // The radar only needs a short local road segment. Drawing every one-metre
  // sample magnifies tiny projection noise into a visibly wavy edge, even on
  // a straight. Use a four-metre polyline and let the cubic segments carry
  // the smooth turns between those stable anchor points.
  const ROAD_SAMPLE_STEP = 4;
  const roadPointCount = Math.ceil((pointCount - 1) / ROAD_SAMPLE_STEP) + 1;
  const roadIndex = (index: number) =>
    Math.min(index * ROAD_SAMPLE_STEP, pointCount - 1);
  const pointX = (index: number) =>
    centreX + props.mapPath[roadIndex(index) * 2 + 1] * scale;
  const rawPointY = (index: number) =>
    centreY - props.mapPath[roadIndex(index) * 2] * scale;
  // The source track polyline is sampled from SVG geometry and can contain
  // one-pixel-scale reversals. They are very visible when a short local
  // segment is magnified to radar size. A binomial B-spline filter removes
  // that sampling noise while retaining the real centreline shape; car
  // positions are not filtered and remain exactly where the radar placed
  // them.
  const smoothPointY = (index: number, pass: number): number => {
    const radius = 2;
    const weight = (offset: number) => SMOOTHING_WEIGHTS[offset + 2];
    let total = 0;
    let weightTotal = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const sample = Math.max(0, Math.min(roadPointCount - 1, index + offset));
      const w = weight(offset);
      total +=
        (pass === 0 ? rawPointY(sample) : smoothPointY(sample, pass - 1)) * w;
      weightTotal += w;
    }
    return total / weightTotal;
  };
  const pointY = (index: number) => smoothPointY(index, 1);
  ctx.beginPath();
  ctx.moveTo(pointX(0), pointY(0));
  for (let point = 0; point < roadPointCount - 1; point += 1) {
    const previous = Math.max(0, point - 1);
    const next = Math.min(roadPointCount - 1, point + 2);
    ctx.bezierCurveTo(
      pointX(point) + (pointX(point + 1) - pointX(previous)) / 6,
      pointY(point) + (pointY(point + 1) - pointY(previous)) / 6,
      pointX(point + 1) - (pointX(next) - pointX(point)) / 6,
      pointY(point + 1) - (pointY(next) - pointY(point)) / 6,
      pointX(point + 1),
      pointY(point + 1)
    );
  }

  // The road has to be wider than the cars driving on it, or a blip reads as
  // an obstacle standing beside a line rather than traffic using the road.
  // The border goes down first so the surface has a configurable edge.
  const roadPx = Math.max(8, widthPx * 1.9);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = roadPx + 4;
  ctx.globalAlpha = Math.min(100, Math.max(0, props.mapBorderOpacity)) / 100;
  ctx.strokeStyle = props.mapBorderColor;
  ctx.stroke();
  ctx.lineWidth = roadPx;
  ctx.globalAlpha = Math.min(100, Math.max(0, props.mapFillOpacity)) / 100;
  ctx.strokeStyle = props.mapFillColor;
  ctx.stroke();
  ctx.globalAlpha = 1;
};

const drawRimArch = (
  ctx: CanvasRenderingContext2D,
  centreX: number,
  centreY: number,
  radius: number,
  bearing: number,
  color: string,
  alpha: number
) => {
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
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.stroke();
  ctx.restore();
};

const drawRadar = (
  canvas: HTMLCanvasElement,
  props: RadarDisplayProps,
  size: Size,
  theme: 'light' | 'dark',
  alongM: Float64Array,
  lateralM: Float64Array,
  trackPath: Path2D | null
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

  const centreX = size.width / 2;
  const centreY = size.height / 2;
  const radius = Math.max(1, Math.min(size.width, size.height) / 2 - 2);
  // Cars always use the radar scale. The optional map is a separate layer
  // behind them, not a replacement view with a different car coordinate space.
  const scale = radius / Math.max(1, props.radarRange);
  const mapScale = radius / Math.max(1, props.mapWindowM / 2);
  const trueWidthPx = Math.max(4, props.vehicleWidth * scale);
  const widthPx = props.showMap
    ? Math.max(trueWidthPx, MAP_VEHICLE_MIN_WIDTH_PX)
    : trueWidthPx;
  const lengthPx = Math.max(6, props.vehicleLength * scale);

  ctx.save();
  ctx.beginPath();
  ctx.arc(centreX, centreY, radius, 0, Math.PI * 2);
  const backgroundAlpha = Math.min(100, Math.max(0, props.bgOpacity)) / 100;
  const backgroundColor = `rgba(0, 0, 0, ${backgroundAlpha})`;
  // Keep the configured opacity through the inner 80% of the disc, then
  // taper it to zero at the rim. This removes the hard-edged circle while
  // preserving the same centre opacity used by the old setting.
  const backgroundGradient = ctx.createRadialGradient(
    centreX,
    centreY,
    0,
    centreX,
    centreY,
    radius
  );
  backgroundGradient.addColorStop(0, backgroundColor);
  backgroundGradient.addColorStop(0.8, backgroundColor);
  backgroundGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  // Keep the explicit colour assignment for non-canvas test contexts; the
  // gradient is the final value used by the browser.
  ctx.fillStyle = backgroundColor;
  ctx.fillStyle = backgroundGradient;
  ctx.fill();

  // Both views share the same circular boundary, including the following road
  // and every vehicle, so none of their geometry can escape the widget.
  ctx.beginPath();
  ctx.arc(centreX, centreY, radius, 0, Math.PI * 2);
  ctx.clip();

  if (props.showMap) {
    drawRoad(ctx, props, centreX, centreY, mapScale, widthPx, trackPath);
  }

  drawBlipVehicles(
    ctx,
    props,
    centreX,
    centreY,
    scale,
    widthPx,
    lengthPx,
    alongM,
    lateralM
  );
  ctx.restore();
  drawPlayer(ctx, props, centreX, centreY, widthPx, lengthPx);

  const pulse = pulseAlpha(props.nowSeconds);
  for (const blip of props.blips) {
    if (blip.rimSignal === 'left' || blip.rimSignal === 'both') {
      drawRimArch(
        ctx,
        centreX,
        centreY,
        radius,
        -Math.PI / 2,
        props.colorAlongside,
        pulse * alphaFor(blip)
      );
    }
    if (blip.rimSignal === 'right' || blip.rimSignal === 'both') {
      drawRimArch(
        ctx,
        centreX,
        centreY,
        radius,
        Math.PI / 2,
        props.colorAlongside,
        pulse * alphaFor(blip)
      );
    }
  }
};

export const RadarDisplay = (props: Omit<RadarDisplayProps, 'nowSeconds'>) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });

  const propsRef = useRef<RadarDisplayProps>({ ...props, nowSeconds: 0 });
  propsRef.current = {
    ...props,
    nowSeconds: propsRef.current.nowSeconds,
  };
  const sizeRef = useRef(size);
  sizeRef.current = size;

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

  // The draw callback reads the latest props and size through refs, so the
  // RAF loop useRadarMotion starts is never restarted by a re-render. The
  // last drawn metre buffers are kept: they grow with the field and are
  // never freed, so a commit that itself repaints — a resize, a theme change —
  // can redraw what the interpolator last produced.
  const alongRef = useRef(new Float64Array(0));
  const lateralRef = useRef(new Float64Array(0));
  const trackPath = useMemo(() => {
    if (!props.mapTrackPath || typeof Path2D === 'undefined') return null;
    return new Path2D(props.mapTrackPath);
  }, [props.mapTrackPath]);
  const trackPathRef = useRef(trackPath);
  trackPathRef.current = trackPath;

  const drawRef = useRef<RadarMotionDraw>(() => undefined);
  drawRef.current = (alongM, lateralM, count) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (alongRef.current.length < count) {
      alongRef.current = new Float64Array(count);
      lateralRef.current = new Float64Array(count);
    }
    alongRef.current.set(alongM.subarray(0, count));
    lateralRef.current.set(lateralM.subarray(0, count));
    propsRef.current.nowSeconds = performance.now() / 1000;
    drawRadar(
      canvas,
      propsRef.current,
      sizeRef.current,
      'dark',
      alongRef.current,
      lateralRef.current,
      trackPathRef.current
    );
  };

  const pulseActive = props.blips.some((blip) => blip.rimSignal !== null);
  useRadarMotion(
    props.blips,
    props.trackLengthM,
    (a, l, c) => {
      drawRef.current(a, l, c);
    },
    pulseActive
  );

  // Resize repaints: the motion loop only repaints on new snapshots, so a
  // size change must redraw the last committed frame from the cached buffers.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    // Before the first commit there is no frame in the buffers to redraw.
    if (!canvas || alongRef.current.length < propsRef.current.blips.length)
      return;
    propsRef.current.nowSeconds = performance.now() / 1000;
    drawRadar(
      canvas,
      propsRef.current,
      sizeRef.current,
      'dark',
      alongRef.current,
      lateralRef.current,
      trackPathRef.current
    );
  });

  return <canvas ref={canvasRef} className="h-full w-full" />;
};
