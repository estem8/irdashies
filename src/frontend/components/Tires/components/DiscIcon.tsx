import { discColor } from '../tireStyle';

interface DiscIconProps {
  /** 0 (cold) to 1 (hottest). */
  level: number;
}

const HOLES = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4);

/** A brake disc seen face on, drawn in the colour of its heat. */
export const DiscIcon = ({ level }: DiscIconProps) => {
  const color = discColor(level);
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[1.6em] w-[1.6em]"
      role="img"
      aria-label={`Brake disc ${Math.round(level * 100)}% hot`}
    >
      <circle cx={12} cy={12} r={10} fill={color} fillOpacity={0.35} />
      <circle
        cx={12}
        cy={12}
        r={10}
        fill="none"
        stroke={color}
        strokeWidth={2}
      />
      <circle cx={12} cy={12} r={3.2} fill={color} />
      {HOLES.map((angle) => (
        <circle
          key={angle}
          cx={12 + 6.4 * Math.cos(angle)}
          cy={12 + 6.4 * Math.sin(angle)}
          r={1.1}
          fill="rgb(0 0 0 / 0.55)"
        />
      ))}
    </svg>
  );
};
