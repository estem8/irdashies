import { memo, useId } from 'react';
import type { TireCornerSnapshot, TireForce } from '@irdashies/types';
import { ContactPatch } from './ContactPatch';
import type { SlipEvent } from '../slipEvent';

// Tire seen from above, in viewBox units: dark sidewalls bulge out either side
// of the tread, which carries the temperature colours.
const VIEW_W = 100;
const VIEW_H = 140;
const TREAD_X = 9;
const TREAD_W = VIEW_W - 2 * TREAD_X;
const ZONE_CENTRES = [0.1, 0.5, 0.9];
const DIVIDERS = [0.2, 0.8];
/** Contact patch, as a share of the tread, and how far camber shifts it. */
const PATCH_W = 0.6;
const PATCH_H = 0.37;
const PATCH_SHIFT_PER_DEGREE = 0.04;
/** Load (1 = standing) that draws the smallest and the largest patch. */
const LOAD_MIN = 0.6;
const LOAD_MAX = 1.8;

export interface TireTopProps {
  side: 'left' | 'right';
  tire?: TireCornerSnapshot;
  colors: readonly string[];
  labels: readonly string[];
  event?: SlipEvent;
  g?: TireForce;
  trail?: readonly TireForce[];
  patchStyle: 'oval' | 'gmeter';
}

export const TireTop = memo(
  ({
    side,
    tire,
    colors,
    labels,
    event,
    g,
    trail,
    patchStyle,
  }: TireTopProps) => {
    const id = useId().replace(/[^a-zA-Z0-9]/g, '');
    const camber = tire?.camber ?? 0;
    // Negative camber leans the top inward and loads the inner shoulder, so the
    // patch moves toward the car: right on a left tire, left on a right one.
    const inward = side === 'left' ? 1 : -1;
    const shift = Math.max(
      -0.15,
      Math.min(0.15, -camber * PATCH_SHIFT_PER_DEGREE * inward)
    );
    // 0 when unloaded to 1 under the heaviest load; a middling patch if unknown.
    const load =
      tire?.load === undefined
        ? 0.5
        : Math.max(
            0,
            Math.min(1, (tire.load - LOAD_MIN) / (LOAD_MAX - LOAD_MIN))
          );
    const scale = 0.8 + 0.4 * load;
    const patchW = TREAD_W * PATCH_W * scale;
    const patchH = VIEW_H * PATCH_H * scale;
    const patchX = TREAD_X + TREAD_W * (0.5 + shift) - patchW / 2;
    const patchY = VIEW_H / 2 - patchH / 2;

    return (
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full overflow-visible"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`sidewall${id}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#0c0d0f" />
            <stop offset="0.06" stopColor="#34363c" />
            <stop offset="0.12" stopColor="#141518" />
            <stop offset="0.88" stopColor="#141518" />
            <stop offset="0.94" stopColor="#34363c" />
            <stop offset="1" stopColor="#0c0d0f" />
          </linearGradient>
          <linearGradient id={`tread${id}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset={ZONE_CENTRES[0]} stopColor={colors[0]} />
            <stop offset={ZONE_CENTRES[1]} stopColor={colors[1]} />
            <stop offset={ZONE_CENTRES[2]} stopColor={colors[2]} />
          </linearGradient>
          {/* The tread curves away at both ends of the tire. */}
          <linearGradient id={`round${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="rgb(0 0 0 / 0.55)" />
            <stop offset="0.22" stopColor="rgb(0 0 0 / 0)" />
            <stop offset="0.78" stopColor="rgb(0 0 0 / 0)" />
            <stop offset="1" stopColor="rgb(0 0 0 / 0.55)" />
          </linearGradient>
          {/* Shoulders round off into the sidewalls; a soft highlight left of centre. */}
          <linearGradient id={`shoulder${id}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="rgb(0 0 0 / 0.45)" />
            <stop offset="0.12" stopColor="rgb(0 0 0 / 0)" />
            <stop offset="0.35" stopColor="rgb(255 255 255 / 0.16)" />
            <stop offset="0.5" stopColor="rgb(255 255 255 / 0)" />
            <stop offset="0.88" stopColor="rgb(0 0 0 / 0)" />
            <stop offset="1" stopColor="rgb(0 0 0 / 0.45)" />
          </linearGradient>
        </defs>

        <ellipse
          cx={VIEW_W / 2}
          cy={VIEW_H - 2}
          rx={VIEW_W * 0.46}
          ry={4}
          fill="rgb(0 0 0 / 0.45)"
        />
        <rect
          x={0}
          y={1}
          width={VIEW_W}
          height={VIEW_H - 2}
          rx={18}
          fill={`url(#sidewall${id})`}
        />
        <rect
          x={TREAD_X}
          y={3}
          width={TREAD_W}
          height={VIEW_H - 6}
          rx={13}
          fill={`url(#tread${id})`}
        />
        <rect
          x={TREAD_X}
          y={3}
          width={TREAD_W}
          height={VIEW_H - 6}
          rx={13}
          fill={`url(#shoulder${id})`}
        />
        <rect
          x={TREAD_X}
          y={3}
          width={TREAD_W}
          height={VIEW_H - 6}
          rx={13}
          fill={`url(#round${id})`}
        />

        {DIVIDERS.map((p) => (
          <line
            key={p}
            x1={TREAD_X + p * TREAD_W}
            x2={TREAD_X + p * TREAD_W}
            y1={5}
            y2={VIEW_H - 5}
            stroke="rgb(255 255 255 / 0.55)"
            strokeWidth={0.8}
          />
        ))}

        <ContactPatch
          cx={patchX + patchW / 2}
          cy={patchY + patchH / 2}
          rx={patchW / 2}
          ry={patchH / 2}
          load={load}
          event={event}
          g={g}
          trail={trail}
          style={patchStyle}
        />

        {ZONE_CENTRES.map((q, zone) => (
          <text
            key={q}
            x={TREAD_X + q * TREAD_W}
            y={VIEW_H / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={zone === 1 ? 19 : 10.5}
            fontWeight={900}
            fill="rgb(0 0 0 / 0.88)"
          >
            {labels[zone]}
          </text>
        ))}
      </svg>
    );
  }
);
TireTop.displayName = 'TireTop';
