import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RadarBlip, RadarBlipColor } from '../radarBlips';
import type { RadarOverlap } from '../overlapSides';

export interface RadarDisplayProps {
  blips: readonly RadarBlip[];
  overlap: RadarOverlap;
  /** Metres from the centre to the edge of the disc. */
  radarRange: number;
  vehicleWidth: number;
  vehicleLength: number;
  showOverlapIndicator: boolean;
  colorPlayer: string;
  colorSameLap: string;
  colorLapsAhead: string;
  colorLapsBehind: string;
  colorInPit: string;
  colorNearby: string;
  colorCritical: string;
  bgOpacity: number;
}

interface Size {
  width: number;
  height: number;
}

const colorProp: Record<RadarBlipColor, keyof RadarDisplayProps> = {
  sameLap: 'colorSameLap',
  lapsAhead: 'colorLapsAhead',
  lapsBehind: 'colorLapsBehind',
  inPit: 'colorInPit',
};

const drawVehicle = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  widthPx: number,
  lengthPx: number,
  rotation: number,
  fill: string,
  player: boolean
) => {
  ctx.save();
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
  ctx.strokeStyle = player ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.45)';
  ctx.stroke();
  ctx.restore();
};

const drawOverlapBar = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  widthPx: number,
  heightPx: number,
  color: string,
  cars: number
) => {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, widthPx, heightPx, widthPx / 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.9;
  ctx.shadowColor = color;
  ctx.shadowBlur = cars === 2 ? 12 : 6;
  ctx.fill();
  ctx.restore();
};

/**
 * Draws the disc: player car fixed at the centre pointing up, opponents placed
 * by along-track metres (up) and centreline metres (across), the sim's overlap
 * verdict as bars at the disc edges.
 */
const drawRadar = (
  canvas: HTMLCanvasElement,
  props: RadarDisplayProps,
  size: Size
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

  const centreX = size.width / 2;
  const centreY = size.height / 2;
  const radius = Math.max(1, Math.min(size.width, size.height) / 2 - 2);
  const scale = radius / Math.max(1, props.radarRange);

  ctx.save();
  ctx.beginPath();
  ctx.arc(centreX, centreY, radius, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(100, Math.max(0, props.bgOpacity)) / 100})`;
  ctx.fill();

  // Blips are clipped to the disc: a car further out across the road than the
  // range would otherwise paint over the widget's edges. The clip path must be
  // rebuilt here — clip() consumes whatever path is current, and the disc's
  // own arc was replaced by the ring drawn below.
  ctx.beginPath();
  ctx.arc(centreX, centreY, radius, 0, Math.PI * 2);
  ctx.clip();

  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.arc(centreX, centreY, radius / 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  for (const blip of props.blips) {
    drawVehicle(
      ctx,
      centreX + blip.lateralM * scale,
      centreY - blip.alongM * scale,
      Math.max(3, props.vehicleWidth * scale),
      Math.max(4, props.vehicleLength * scale),
      blip.relYaw,
      props[colorProp[blip.color]] as string,
      false
    );
  }
  ctx.restore();

  drawVehicle(
    ctx,
    centreX,
    centreY,
    Math.max(3, props.vehicleWidth * scale),
    Math.max(4, props.vehicleLength * scale),
    0,
    props.colorPlayer,
    true
  );

  if (
    props.showOverlapIndicator &&
    (props.overlap.left > 0 || props.overlap.right > 0)
  ) {
    const barWidth = Math.max(3, radius * 0.07);
    const barHeight = radius * 0.5;
    const barY = centreY - barHeight / 2;
    if (props.overlap.left > 0) {
      drawOverlapBar(
        ctx,
        centreX - radius + barWidth * 0.6,
        barY,
        barWidth,
        barHeight,
        props.overlap.left === 2 ? props.colorCritical : props.colorNearby,
        props.overlap.left
      );
    }
    if (props.overlap.right > 0) {
      drawOverlapBar(
        ctx,
        centreX + radius - barWidth * 1.6,
        barY,
        barWidth,
        barHeight,
        props.overlap.right === 2 ? props.colorCritical : props.colorNearby,
        props.overlap.right
      );
    }
  }
};

export const RadarDisplay = (props: RadarDisplayProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });

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

  // Redraw per render: blips arrive at the channel's tick rate, which is the
  // cadence the disc is meant to move at — no interpolation in between.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) drawRadar(canvas, props, size);
  });

  return <canvas ref={canvasRef} className="h-full w-full" />;
};
