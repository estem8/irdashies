export type TireTempMode = 'average' | 'real';

interface TireTempModePickerProps {
  value: TireTempMode;
  onChange: (value: TireTempMode) => void;
}

type Layer = 'tread' | 'belt' | 'cord' | 'liner';

const MODES: {
  value: TireTempMode;
  title: string;
  text: string;
  lit: Layer[];
}[] = [
  {
    value: 'real',
    title: 'Tread',
    text: 'The surface on the road. Jumps within seconds of braking or cornering, like the GTP dash.',
    lit: ['tread'],
  },
  {
    value: 'average',
    title: 'Carcass',
    text: 'The carcass under the belt: the temperature the GT3 dash shows.',
    lit: ['cord', 'liner'],
  },
];

// A cross-section of the tire seen as an arch, pushed back by the tire's
// width (DEPTH) to give it a body. Layers run from the outside in.
const CX = 195;
const CY = 300;
const RADIUS = 135;
const FROM = 168;
const TO = 12;
const DEPTH = { x: 46, y: -28 };
const STEPS = 40;

const LAYERS: {
  id: Layer;
  label: string;
  thickness: number;
  front: string;
  side: string;
  /** The fill when this layer is the one the mode shows. */
  lit: string;
  callout: { y: number; dx: number };
}[] = [
  {
    id: 'tread',
    label: 'Tread',
    thickness: 18,
    front: 'fill-slate-600',
    side: 'fill-slate-700',
    lit: 'fill-accent-500',
    callout: { y: 56, dx: -38 },
  },
  {
    id: 'belt',
    label: 'Belt',
    thickness: 11,
    front: 'fill-slate-400',
    side: 'fill-slate-600',
    lit: 'fill-accent-300',
    callout: { y: 82, dx: -52 },
  },
  {
    id: 'cord',
    label: 'Carcass cord',
    thickness: 15,
    front: 'fill-amber-700',
    side: 'fill-amber-900',
    lit: 'fill-accent-600',
    callout: { y: 108, dx: -66 },
  },
  {
    id: 'liner',
    label: 'Liner',
    thickness: 9,
    front: 'fill-slate-900',
    side: 'fill-slate-950',
    lit: 'fill-accent-700',
    callout: { y: 134, dx: -80 },
  },
];

const point = (radius: number, angle: number, shift = { x: 0, y: 0 }) => {
  const rad = (angle * Math.PI) / 180;
  return {
    x: CX + radius * Math.cos(rad) + shift.x,
    y: CY - radius * Math.sin(rad) + shift.y,
  };
};

const arcPoints = (radius: number, shift?: { x: number; y: number }) =>
  Array.from({ length: STEPS + 1 }, (_, i) =>
    point(radius, FROM + ((TO - FROM) * i) / STEPS, shift)
  );

const path = (points: { x: number; y: number }[]) =>
  `M${points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L')}Z`;

const band = (outer: number, inner: number, shift?: { x: number; y: number }) =>
  path([...arcPoints(outer, shift), ...arcPoints(inner, shift).reverse()]);

// The surface between a radius and the same radius pushed back.
const surface = (radius: number) =>
  path([...arcPoints(radius), ...arcPoints(radius, DEPTH).reverse()]);

const geometry = (() => {
  let outer = RADIUS;
  return LAYERS.map((layer) => {
    const inner = outer - layer.thickness;
    const out = { ...layer, outer, inner, mid: (outer + inner) / 2 };
    outer = inner;
    return out;
  });
})();

const innermost = geometry[geometry.length - 1].inner;
const grooveShift = (f: number) => ({ x: DEPTH.x * f, y: DEPTH.y * f });
const GROOVES = [0.33, 0.66];
const BLOCKS = Array.from({ length: 13 }, (_, i) => i + 1).flatMap((k) =>
  [0, 1, 2]
    .filter((band) => (k + band) % 2 === 0)
    .map((band) => ({
      from: point(RADIUS, FROM + ((TO - FROM) * k) / 14, grooveShift(band / 3)),
      to: point(
        RADIUS,
        FROM + ((TO - FROM) * k) / 14,
        grooveShift((band + 1) / 3)
      ),
    }))
);
const NOTCHES = [30, 60, 90, 120, 150].map((angle) => ({
  from: point(RADIUS, angle),
  to: point(RADIUS - 8, angle),
}));

const TireSection = ({ lit }: { lit: Layer[] }) => {
  const on = (id: Layer) => lit.includes(id);
  return (
    <svg viewBox="0 30 370 290" className="w-full" aria-hidden="true">
      <path d={surface(innermost)} className="fill-slate-950" />
      {geometry.map((l) => (
        <path
          key={`side-${l.id}`}
          d={band(l.outer, l.inner, DEPTH)}
          className={on(l.id) ? 'fill-accent-900' : l.side}
          opacity={on(l.id) ? 1 : 0.55}
        />
      ))}
      <path
        d={surface(RADIUS)}
        className={`${
          on('tread')
            ? 'fill-accent-700 stroke-accent-400'
            : 'fill-slate-700 stroke-transparent'
        }`}
        strokeWidth={2}
        opacity={on('tread') ? 1 : 0.6}
      />
      {GROOVES.map((f) => (
        <path
          key={f}
          d={arcPoints(RADIUS, grooveShift(f))
            .map(
              (p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`
            )
            .join(' ')}
          className="fill-none stroke-slate-950"
          strokeWidth={3}
        />
      ))}
      {BLOCKS.map((b, i) => (
        <line
          key={i}
          x1={b.from.x}
          y1={b.from.y}
          x2={b.to.x}
          y2={b.to.y}
          className="stroke-slate-950"
          strokeWidth={2}
        />
      ))}
      {geometry.map((l) => (
        <path
          key={`front-${l.id}`}
          d={band(l.outer, l.inner)}
          className={`${on(l.id) ? l.lit : l.front} ${
            on(l.id) ? 'stroke-accent-400' : 'stroke-slate-950'
          }`}
          strokeWidth={on(l.id) ? 1.5 : 0.5}
          opacity={on(l.id) ? 1 : 0.4}
        />
      ))}
      {NOTCHES.map((n, i) => (
        <line
          key={i}
          x1={n.from.x}
          y1={n.from.y}
          x2={n.to.x}
          y2={n.to.y}
          className="stroke-slate-950"
          strokeWidth={4}
        />
      ))}
      {[FROM, TO].map((angle) => {
        const bead = point((RADIUS + innermost) / 2, angle);
        return (
          <circle
            key={angle}
            cx={bead.x}
            cy={bead.y}
            r={7}
            className="fill-slate-300"
            opacity={0.8}
          />
        );
      })}
      {geometry.map((l) => {
        const x = CX + l.callout.dx;
        const y = CY - Math.sqrt(l.mid * l.mid - l.callout.dx * l.callout.dx);
        const tone = on(l.id) ? 'accent' : 'slate';
        return (
          <g key={`call-${l.id}`} opacity={on(l.id) ? 1 : 0.4}>
            <polyline
              points={`108,${l.callout.y - 4} ${x},${l.callout.y - 4} ${x},${y}`}
              className={`fill-none ${
                tone === 'accent' ? 'stroke-accent-400' : 'stroke-slate-400'
              }`}
              strokeWidth={1.3}
            />
            <circle
              cx={x}
              cy={y}
              r={3}
              className={
                tone === 'accent' ? 'fill-accent-400' : 'fill-slate-400'
              }
            />
            <text
              x={20}
              y={l.callout.y}
              fontSize={13}
              fontWeight={on(l.id) ? 700 : 400}
              className={on(l.id) ? 'fill-slate-200' : 'fill-slate-400'}
            >
              {l.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

export const TireTempModePicker = ({
  value,
  onChange,
}: TireTempModePickerProps) => (
  <div>
    <span className="text-md text-slate-300">Temperature Mode</span>
    <p className="text-sm text-slate-500 mt-1">
      Both are estimated for every car. Pick the layer of the tire you want to
      see.
    </p>
    <div className="grid grid-cols-2 gap-3 mt-3">
      {MODES.map((mode) => {
        const isActive = mode.value === value;
        return (
          <button
            key={mode.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(mode.value)}
            className={`text-left rounded border p-3 transition-colors ${
              isActive
                ? 'bg-accent-500/10 border-accent-500'
                : 'bg-transparent border-slate-600 hover:border-slate-400'
            }`}
          >
            <TireSection lit={mode.lit} />
            <div className="mt-2 text-md font-semibold text-slate-200 settings-heading">
              {mode.title}
            </div>
            <p className="text-sm text-slate-400 mt-1">{mode.text}</p>
          </button>
        );
      })}
    </div>
  </div>
);
