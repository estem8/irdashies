interface PressureLabelProps {
  value: string;
  unit: string;
  /** False for the cold set pressure, which does not follow the tire as it heats. */
  hot: boolean;
}

/** Pressure beside a tire: the number over its unit. */
export const PressureLabel = ({ value, unit, hot }: PressureLabelProps) => (
  <div
    className="flex w-[2.6em] flex-none flex-col items-center leading-tight"
    title={hot ? 'Hot pressure' : 'Cold set pressure'}
  >
    <span
      className={`text-[0.9em] font-bold tabular-nums ${hot ? 'text-white' : 'text-sky-300'}`}
    >
      {value}
    </span>
    <span className="text-[0.55em] font-bold uppercase text-white/50">
      {unit}
    </span>
  </div>
);
