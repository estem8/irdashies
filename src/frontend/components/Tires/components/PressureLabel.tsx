interface PressureLabelProps {
  value: string;
  unit: string;
  /** False for the cold set pressure, which does not follow the tire as it heats. */
  hot: boolean;
  /** True for a calculated value, drawn with a leading ~ (an overlay has no hover, so a tooltip alone is not seen). */
  estimated?: boolean;
}

/** Pressure beside a tire: the number over its unit. */
export const PressureLabel = ({
  value,
  unit,
  hot,
  estimated = false,
}: PressureLabelProps) => (
  <div
    className="flex flex-col items-center leading-tight"
    title={
      !hot
        ? 'Cold set pressure'
        : estimated
          ? 'Hot pressure (estimated)'
          : 'Hot pressure'
    }
  >
    <span
      className={`relative text-[0.9em] font-bold tabular-nums ${hot ? 'text-white' : 'text-sky-300'}`}
    >
      {/* Out of the flow, so the number keeps the width of its column. */}
      {estimated && <span className="absolute right-full">~</span>}
      {value}
    </span>
    <span className="text-[0.55em] font-bold uppercase text-white/50">
      {unit}
    </span>
  </div>
);
