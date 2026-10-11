import { useEffect, useState } from 'react';
import type { RatingPoint } from '@irdashies/types';
import logger from '@irdashies/utils/logger';

const CHART = { width: 600, height: 160, pad: 24 };

/** One line of values, oldest on the left, with min and max labels. */
const LineChart = ({
  values,
  format,
}: {
  values: number[];
  format: (value: number) => string;
}) => {
  if (values.length < 2) {
    return (
      <p className="py-6 text-center text-xs text-slate-500">
        One more change is needed to draw a line.
      </p>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) =>
    CHART.pad + (i / (values.length - 1)) * (CHART.width - CHART.pad * 2);
  const y = (v: number) =>
    CHART.height -
    CHART.pad -
    ((v - min) / span) * (CHART.height - CHART.pad * 2);
  const line = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  return (
    <svg
      viewBox={`0 0 ${CHART.width} ${CHART.height}`}
      className="w-full"
      role="img"
      aria-label={`From ${format(values[0])} to ${format(values.at(-1) ?? 0)}`}
    >
      {[max, min].map((v) => (
        <g key={v}>
          <line
            x1={CHART.pad}
            x2={CHART.width - CHART.pad}
            y1={y(v)}
            y2={y(v)}
            className="stroke-slate-700"
            strokeDasharray="4 4"
          />
          <text x={2} y={y(v) - 4} className="fill-slate-400 text-[10px]">
            {format(v)}
          </text>
        </g>
      ))}
      <polyline
        points={line}
        fill="none"
        className="stroke-sky-400"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {values.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={2.5} className="fill-sky-400" />
      ))}
    </svg>
  );
};

const Stat = ({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: number;
}) => (
  <div>
    <p className="text-xs uppercase tracking-wider text-slate-400">{label}</p>
    <p className="text-2xl font-semibold text-white">
      {value}
      {delta !== undefined && delta !== 0 && (
        <span
          className={`ml-2 text-sm ${delta > 0 ? 'text-green-400' : 'text-red-400'}`}
        >
          {delta > 0 ? '+' : ''}
          {Number.isInteger(delta) ? delta : delta.toFixed(2)}
        </span>
      )}
    </p>
  </div>
);

/** Rating history for the most recently seen driver, by license category. */
export const DriverRatings = ({
  points,
}: {
  points: readonly RatingPoint[];
}) => {
  const userId = points.at(-1)?.userId;
  const mine = points.filter((p) => p.userId === userId);
  const categories = [...new Set(mine.map((p) => p.category))];
  const [picked, setPicked] = useState<string | null>(null);
  const category =
    picked && categories.includes(picked) ? picked : mine.at(-1)?.category;
  const series = mine.filter((p) => p.category === category);
  const first = series[0];
  const last = series.at(-1);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="mb-1 text-xl">Driver</h2>
        <p className="text-sm text-slate-400">
          Recorded from the sessions you load while irDashies is running. Older
          ratings are not available: iRacing does not currently let third-party
          apps read them.
        </p>
      </div>

      {!first || !last ? (
        <p className="rounded-md bg-slate-800 p-6 text-center text-sm text-slate-400">
          No ratings yet. Join an iRacing session and they will show up here.
        </p>
      ) : (
        <>
          {categories.length > 1 && (
            <div className="flex gap-1" role="tablist">
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="tab"
                  aria-selected={c === category}
                  onClick={() => setPicked(c)}
                  className={`rounded px-3 py-1 text-sm ${
                    c === category
                      ? 'bg-sky-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-10 rounded-md bg-slate-800 p-4">
            <Stat
              label="iRating"
              value={String(last.iRating)}
              delta={last.iRating - first.iRating}
            />
            <Stat
              label="Safety rating"
              value={`${last.licenseClass} ${last.safetyRating.toFixed(2)}`}
              delta={Number(
                (last.safetyRating - first.safetyRating).toFixed(2)
              )}
            />
            <Stat label="Changes recorded" value={String(series.length)} />
          </div>

          <section className="rounded-md bg-slate-800 p-4">
            <h3 className="mb-2 text-sm text-slate-300">iRating</h3>
            <LineChart
              values={series.map((p) => p.iRating)}
              format={(v) => String(Math.round(v))}
            />
          </section>
          <section className="rounded-md bg-slate-800 p-4">
            <h3 className="mb-2 text-sm text-slate-300">Safety rating</h3>
            <LineChart
              values={series.map((p) => p.safetyRating)}
              format={(v) => v.toFixed(2)}
            />
          </section>
          <p className="text-xs text-slate-500">
            Since {new Date(first.at).toLocaleDateString()}
          </p>
        </>
      )}
    </div>
  );
};

export const DriverSettings = () => {
  const [points, setPoints] = useState<readonly RatingPoint[]>([]);

  useEffect(() => {
    let cancelled = false;
    window.ratingHistoryBridge
      ?.getHistory()
      .then((history) => {
        if (!cancelled) setPoints(history);
      })
      .catch((err) => logger.warn('Failed to load rating history', err));
    return () => {
      cancelled = true;
    };
  }, []);

  return <DriverRatings points={points} />;
};
