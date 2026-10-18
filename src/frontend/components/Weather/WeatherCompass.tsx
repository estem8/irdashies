import { memo, useEffect, useRef, useState } from 'react';

export interface WeatherCompassProps {
  /** Car heading from north, radians. */
  heading?: number;
  /** Direction the wind blows from, relative to the car, radians. */
  windRelative?: number;
  windClassName?: string;
}

const DEG = 180 / Math.PI;

// Keeps adding the shortest turn so the dial never spins the long way round
// when the angle wraps past 0/360.
const useUnwrapped = (angle = 0) => {
  const [total, setTotal] = useState(angle);
  const prev = useRef(angle);
  useEffect(() => {
    let diff = angle - prev.current;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    prev.current = angle;
    setTotal((t) => t + diff);
  }, [angle]);
  return total;
};

const LETTERS = [
  { t: 'N', x: 100, y: 22 },
  { t: 'E', x: 178, y: 100 },
  { t: 'S', x: 100, y: 178 },
  { t: 'W', x: 22, y: 100 },
];

export const WeatherCompass = memo(
  ({ heading, windRelative, windClassName }: WeatherCompassProps) => {
    const dial = useUnwrapped(-(heading ?? 0));
    const wind = useUnwrapped(windRelative);
    const turn = 'transition-transform duration-1000 ease-out origin-center';

    return (
      <svg viewBox="0 0 200 200" className="size-full" aria-hidden="true">
        <g
          className={`${turn} fill-white/40 stroke-white/30`}
          style={{ rotate: `${dial * DEG}deg` }}
        >
          <circle cx="100" cy="100" r="86" fill="none" strokeWidth="2" />
          {LETTERS.map(({ t, x, y }) => (
            <text
              key={t}
              x={x}
              y={y}
              fontSize="16"
              textAnchor="middle"
              dominantBaseline="central"
              stroke="none"
              // Keep the letters upright while the dial turns.
              style={{
                rotate: `${-dial * DEG}deg`,
                transformOrigin: `${x}px ${y}px`,
              }}
              className="transition-transform duration-1000 ease-out"
            >
              {t}
            </text>
          ))}
        </g>
        <path
          d="M100 52c-14 0-22 10-22 26v50c0 14 8 22 22 22s22-8 22-22V78c0-16-8-26-22-26Zm-22 36h44M80 70h40"
          className="fill-white/90 stroke-slate-900"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        {windRelative !== undefined && (
          <g
            className={`${turn} ${windClassName ?? 'text-white'}`}
            style={{ rotate: `${wind * DEG}deg` }}
          >
            {/* Rim arrow pointing at the car: the wind blows from -> to. */}
            <path d="M100 46 113 28h-7V12H94v16h-7Z" className="fill-current" />
          </g>
        )}
      </svg>
    );
  }
);
WeatherCompass.displayName = 'WeatherCompass';
