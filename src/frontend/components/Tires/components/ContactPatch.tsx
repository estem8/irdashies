import type { TireForce } from '@irdashies/types';
import type { SlipEvent } from '../slipEvent';

/** Acceleration, in g, at the edge of the patch; the inner ring is half of it. */
const EDGE_G = 2;

interface ContactPatchProps {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** 0 when unloaded to 1 under the heaviest load. */
  load: number;
  event?: SlipEvent;
  g?: TireForce;
  /** Recent accelerations, oldest first; drawn only by the g-meter style. */
  trail?: readonly TireForce[];
  style: 'oval' | 'gmeter';
}

/** Where an acceleration lands inside the patch: toward where the car is pushed. */
const place = (
  { cx, cy, rx, ry }: Pick<ContactPatchProps, 'cx' | 'cy' | 'rx' | 'ry'>,
  g: TireForce
) => {
  let x = -g.lat / EDGE_G;
  let y = -g.lon / EDGE_G;
  const length = Math.hypot(x, y);
  if (length > 1) {
    x /= length;
    y /= length;
  }
  return { x: cx + x * rx, y: cy + y * ry };
};

/** Braking red, accelerating green, otherwise cornering blue. */
const trailColor = (g: TireForce) =>
  g.lon < -0.3 ? '#ff4d4d' : g.lon > 0.3 ? '#2fd6a3' : '#4aa8ff';

/**
 * The tread's footprint as a friction circle: an oval with a ring at half the
 * edge acceleration and a dot where the car is being pushed. It lights up
 * while the tire slides (ABS, spin, lock, traction control); the g-meter style
 * adds the crosshair and a fading trail of where the dot has been.
 */
export const ContactPatch = ({
  cx,
  cy,
  rx,
  ry,
  load,
  event,
  g,
  trail,
  style,
}: ContactPatchProps) => {
  const box = { cx, cy, rx, ry };
  const dot = g && place(box, g);
  const samples = style === 'gmeter' && trail ? trail : [];
  const points = samples.map((t) => place(box, t));

  return (
    <>
      {event && (
        <ellipse
          cx={cx}
          cy={cy}
          rx={rx + 2}
          ry={ry + 2}
          fill="none"
          stroke={event.color}
          strokeOpacity={0.35 + 0.4 * event.level}
          strokeWidth={4}
        />
      )}
      <ellipse
        cx={cx}
        cy={cy}
        rx={rx}
        ry={ry}
        fill={event ? event.color : 'rgb(255 255 255)'}
        fillOpacity={event ? 0.3 + 0.5 * event.level : 0.05 + 0.4 * load}
        stroke={event ? event.color : 'rgb(255 255 255)'}
        strokeWidth={event ? 1.6 : 1.2}
        strokeOpacity={event ? 1 : 0.4 + 0.6 * load}
      />
      <ellipse
        cx={cx}
        cy={cy}
        rx={rx / 2}
        ry={ry / 2}
        fill="none"
        stroke="rgb(255 255 255 / 0.5)"
        strokeWidth={0.7}
        strokeDasharray="3 3"
      />
      {style === 'gmeter' && (
        <>
          <line
            x1={cx - rx}
            x2={cx + rx}
            y1={cy}
            y2={cy}
            stroke="rgb(255 255 255 / 0.35)"
            strokeWidth={0.6}
          />
          <line
            x1={cx}
            x2={cx}
            y1={cy - ry}
            y2={cy + ry}
            stroke="rgb(255 255 255 / 0.35)"
            strokeWidth={0.6}
          />
          {points.length > 2 && (
            <polygon
              points={[
                `${cx},${cy}`,
                ...points.map((p) => `${p.x},${p.y}`),
              ].join(' ')}
              fill="rgb(255 255 255 / 0.1)"
            />
          )}
          {points.slice(1).map((p, i) => (
            <line
              key={i}
              x1={points[i].x}
              y1={points[i].y}
              x2={p.x}
              y2={p.y}
              stroke={trailColor(samples[i + 1])}
              strokeOpacity={(i + 1) / points.length}
              strokeWidth={1.6}
              strokeLinecap="round"
            />
          ))}
        </>
      )}
      {dot && (
        <circle
          cx={dot.x}
          cy={dot.y}
          r={3.2}
          fill="#fff"
          stroke="rgb(0 0 0 / 0.6)"
          strokeWidth={0.8}
        />
      )}
      {event && (
        <text
          x={cx}
          y={cy + ry - 4.5}
          textAnchor="middle"
          fontSize={9}
          fontWeight={900}
          fill="#fff"
          stroke="rgb(0 0 0 / 0.7)"
          strokeWidth={2}
          paintOrder="stroke"
        >
          {event.label}
        </text>
      )}
    </>
  );
};
