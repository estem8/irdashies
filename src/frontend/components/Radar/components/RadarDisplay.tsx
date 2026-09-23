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
  holdLine: boolean;
  /** Every rival blip is filled with this; the player is `colorPlayer`. */
  colorRival: string;
  colorAlongside: string;
  colorHoldLine: string;
  colorPlayer: string;
  bgOpacity: number;
  /** Track length in metres; drives blip motion between snapshots. */
  trackLengthM: number;
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

const drawDisc = (
  ctx: CanvasRenderingContext2D,
  props: RadarDisplayProps,
  size: Size,
  alongM: Float64Array,
  lateralM: Float64Array
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

  for (let i = 0; i < props.blips.length; i++) {
    const blip = props.blips[i];
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

  const rimArch = (bearing: number, color: string, alpha: number) => {
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
  const pulse = pulseAlpha(props.nowSeconds);
  for (const blip of props.blips) {
    if (blip.rimSignal === 'left' || blip.rimSignal === 'both') {
      rimArch(-Math.PI / 2, props.colorAlongside, pulse * alphaFor(blip));
    }
    if (blip.rimSignal === 'right' || blip.rimSignal === 'both') {
      rimArch(Math.PI / 2, props.colorAlongside, pulse * alphaFor(blip));
    }
  }

  if (props.holdLine) {
    const top = centreY - radius + 2;
    const arm = Math.max(4, radius * 0.18);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(centreX - arm, top + arm);
    ctx.lineTo(centreX, top);
    ctx.lineTo(centreX + arm, top + arm);
    ctx.lineWidth = Math.max(2, radius * 0.06);
    ctx.strokeStyle = props.colorHoldLine;
    ctx.globalAlpha = pulse;
    ctx.stroke();
    ctx.restore();
  }
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

  drawDisc(ctx, props, size, alongM, lateralM);
};

export const RadarDisplay = (props: Omit<RadarDisplayProps, 'nowSeconds'>) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });

  const propsRef = useRef(props);
  propsRef.current = props;
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
    drawRadar(
      canvas,
      { ...propsRef.current, nowSeconds: performance.now() / 1000 },
      sizeRef.current,
      'dark',
      alongRef.current,
      lateralRef.current
    );
  };

  const pulseActive =
    props.holdLine || props.blips.some((blip) => blip.rimSignal !== null);
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
    drawRadar(
      canvas,
      { ...propsRef.current, nowSeconds: performance.now() / 1000 },
      sizeRef.current,
      'dark',
      alongRef.current,
      lateralRef.current
    );
  });

  return <canvas ref={canvasRef} className="h-full w-full" />;
};
