import type { SlipEvent } from '../slipEvent';

interface ContactPatchProps {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** 0 when unloaded to 1 under the heaviest load. */
  load: number;
  event?: SlipEvent;
}

/**
 * The tread's footprint: an oval that grows and brightens with the load on the
 * tire, and lights up while the tire slides (ABS, spin, lock, traction control).
 */
export const ContactPatch = ({
  cx,
  cy,
  rx,
  ry,
  load,
  event,
}: ContactPatchProps) => (
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
