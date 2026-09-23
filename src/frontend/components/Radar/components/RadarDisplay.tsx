import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
        props.colorRival,
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
  widthPx: number
) => {
  const pointCount = Math.min(
    props.mapPointCount,
    Math.floor(props.mapPath.length / 2)
  );
  if (pointCount < 2) return;

  ctx.beginPath();
  for (let point = 0; point < pointCount; point++) {
    const index = point * 2;
    const x = centreX + props.mapPath[index + 1] * scale;
    const y = centreY - props.mapPath[index] * scale;
    if (point === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }

  // The road has to be wider than the cars driving on it, or a blip reads as
  // an obstacle standing beside a line rather than traffic using the road.
  // The dark pass underneath is the outline every map in the app draws first,
  // so the road keeps its shape against a car of any colour.
  const roadPx = Math.max(8, widthPx * 1.9);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = roadPx + 4;
  ctx.strokeStyle = 'rgba(2, 6, 23, 0.9)';
  ctx.stroke();
  ctx.lineWidth = roadPx;
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
  ctx.stroke();
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
  lateralM: Float64Array
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
  // A map covers three radar ranges, while a disc covers one. In both views
  // this single conversion preserves the physical metres-per-pixel scale.
  const viewHalfWidthM = props.showMap
    ? Math.max(1, props.mapWindowM / 2)
    : Math.max(1, props.radarRange);
  const scale = radius / viewHalfWidthM;
  const widthPx = Math.max(4, props.vehicleWidth * scale);
  const lengthPx = Math.max(6, props.vehicleLength * scale);

  ctx.save();
  ctx.beginPath();
  ctx.arc(centreX, centreY, radius, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(100, Math.max(0, props.bgOpacity)) / 100})`;
  ctx.fill();

  // Both views share the same circular boundary, including the following road
  // and every vehicle, so none of their geometry can escape the widget.
  ctx.arc(centreX, centreY, radius, 0, Math.PI * 2);
  ctx.clip();

  if (props.showMap) {
    drawRoad(ctx, props, centreX, centreY, scale, widthPx);
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
    // Rim arcs belong to the disc's edge. A rim around a scrolling map adds no
    // positional information, so map view deliberately paints no arcs.
  } else {
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
      lateralRef.current
    );
  };

  const pulseActive =
    !props.showMap && props.blips.some((blip) => blip.rimSignal !== null);
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
      lateralRef.current
    );
  });

  return <canvas ref={canvasRef} className="h-full w-full" />;
};
