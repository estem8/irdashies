// Compares PresentMon CSV captures of the game, one labelled set of runs per
// overlay state, against the first set (the baseline).
//
//   node tools/perf/presentmon-compare.mjs \
//     baseline=base1.csv,base2.csv empty=e1.csv,e2.csv full=f1.csv,f2.csv
//
// Options: --process <exe>   game process (default: the one with most frames)
//          --skip-seconds N  drop the first N seconds of every run (default 5)
//          --json <file>     also write the numbers as JSON
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// PresentMon 1.x calls these MsBetweenPresents, MsCPUBusy, ...; 2.x FrameTime,
// CPUBusy, ... Columns are matched ignoring case and a leading "Ms".
const COLUMN_ALIASES = {
  frameTime: ['frametime', 'betweenpresents'],
  cpuBusy: ['cpubusy'],
  gpuBusy: ['gpubusy', 'gpuactive'],
  process: ['application', 'processname'],
  dropped: ['dropped'],
  displayedTime: ['displayedtime'],
};

const normalizeHeader = (name) =>
  name
    .trim()
    .toLowerCase()
    .replace(/^ms/, '')
    .replace(/[^a-z0-9]/g, '');

export function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length < 2) return { header: [], rows: [] };
  const split = (line) => line.split(',');
  return { header: split(lines[0]), rows: lines.slice(1).map(split) };
}

function columnIndex(header, key) {
  const wanted = COLUMN_ALIASES[key];
  return header.findIndex((name) => wanted.includes(normalizeHeader(name)));
}

/** Frames of the game process, with the warm-up trimmed. */
export function readFrames(text, { processName, skipSeconds = 5 } = {}) {
  const { header, rows } = parseCsv(text);
  const frameCol = columnIndex(header, 'frameTime');
  if (frameCol < 0) {
    throw new Error(
      `No frame time column (FrameTime or MsBetweenPresents) in: ${header.join(',')}`
    );
  }
  const processCol = columnIndex(header, 'process');
  const cpuCol = columnIndex(header, 'cpuBusy');
  const gpuCol = columnIndex(header, 'gpuBusy');
  const droppedCol = columnIndex(header, 'dropped');
  const displayedCol = columnIndex(header, 'displayedTime');

  let selected = rows;
  let name = processName;
  if (processCol >= 0) {
    if (!name) {
      const counts = new Map();
      for (const row of rows) {
        counts.set(row[processCol], (counts.get(row[processCol]) ?? 0) + 1);
      }
      name = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    }
    selected = rows.filter(
      (row) => row[processCol]?.toLowerCase() === name?.toLowerCase()
    );
  }

  const number = (row, col) => {
    const value = col >= 0 ? Number(row[col]) : NaN;
    return Number.isFinite(value) ? value : undefined;
  };
  const frames = [];
  let elapsedMs = 0;
  for (const row of selected) {
    const frameTime = number(row, frameCol);
    if (frameTime === undefined || frameTime <= 0) continue;
    // Keep only frames that start after the warm-up
    const startedAt = elapsedMs;
    elapsedMs += frameTime;
    if (startedAt < skipSeconds * 1000) continue;
    frames.push({
      frameTime,
      cpuBusy: number(row, cpuCol),
      gpuBusy: number(row, gpuCol),
      // 1.x has a Dropped flag; 2.x marks a frame that never reached the
      // screen with NA in DisplayedTime
      dropped:
        droppedCol >= 0
          ? Number(row[droppedCol]) === 1
          : displayedCol >= 0
            ? row[displayedCol]?.trim().toUpperCase() === 'NA'
            : undefined,
    });
  }
  return { process: name, frames };
}

export function percentile(sorted, p) {
  if (sorted.length === 0) return NaN;
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

const mean = (values) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN;

export function summarize(frames) {
  const times = frames.map((frame) => frame.frameTime).sort((a, b) => a - b);
  const median = percentile(times, 0.5);
  const present = (key) =>
    frames.map((frame) => frame[key]).filter((value) => value !== undefined);
  const cpu = present('cpuBusy');
  const gpu = present('gpuBusy');
  const dropped = present('dropped');
  const totalMs = times.reduce((a, b) => a + b, 0);
  return {
    frames: frames.length,
    seconds: totalMs / 1000,
    fps: totalMs > 0 ? (frames.length / totalMs) * 1000 : NaN,
    p50: median,
    p95: percentile(times, 0.95),
    p99: percentile(times, 0.99),
    // A frame more than twice the median is a visible hitch
    spikes: times.filter((time) => time > median * 2).length,
    cpuBusy: cpu.length ? mean(cpu) : undefined,
    gpuBusy: gpu.length ? mean(gpu) : undefined,
    droppedPercent: dropped.length
      ? (dropped.filter(Boolean).length / dropped.length) * 100
      : undefined,
  };
}

const METRICS = [
  ['p50', 'frame time p50 (ms)', 2],
  ['p95', 'frame time p95 (ms)', 2],
  ['p99', 'frame time p99 (ms)', 2],
  ['spikes', 'spikes > 2x median', 0],
  ['fps', 'average FPS', 1],
  ['cpuBusy', 'CPU busy (ms)', 2],
  ['gpuBusy', 'GPU busy (ms)', 2],
  ['droppedPercent', 'dropped (%)', 2],
];

/** One value per metric across the runs of a set: mean and min to max. */
export function aggregate(runSummaries) {
  const result = {};
  for (const [key] of METRICS) {
    const values = runSummaries
      .map((run) => run[key])
      .filter((value) => value !== undefined && Number.isFinite(value));
    result[key] = values.length
      ? {
          mean: mean(values),
          min: Math.min(...values),
          max: Math.max(...values),
        }
      : undefined;
  }
  result.runs = runSummaries.length;
  return result;
}

export function renderTable(sets) {
  const baseline = sets[0];
  const lines = [
    `| metric | ${sets.map((set) => `${set.label} (${set.aggregate.runs} runs)`).join(' | ')} |`,
    `| --- | ${sets.map(() => '---:').join(' | ')} |`,
  ];
  for (const [key, title, digits] of METRICS) {
    if (sets.every((set) => set.aggregate[key] === undefined)) continue;
    const cells = sets.map((set) => {
      const value = set.aggregate[key];
      if (!value) return 'n/a';
      let cell = value.mean.toFixed(digits);
      if (set.aggregate.runs > 1) {
        cell += ` (${value.min.toFixed(digits)}-${value.max.toFixed(digits)})`;
      }
      const base = baseline.aggregate[key];
      if (set !== baseline && base && base.mean !== 0) {
        const delta = ((value.mean - base.mean) / base.mean) * 100;
        cell += ` ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`;
      }
      return cell;
    });
    lines.push(`| ${title} | ${cells.join(' | ')} |`);
  }
  return lines.join('\n');
}

export function parseArgs(argv) {
  const options = { skipSeconds: 5, groups: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--process') options.process = argv[++i];
    else if (arg === '--skip-seconds') options.skipSeconds = Number(argv[++i]);
    else if (arg === '--json') options.json = argv[++i];
    else if (arg.includes('=')) {
      const eq = arg.indexOf('=');
      options.groups.push({
        label: arg.slice(0, eq),
        files: arg
          .slice(eq + 1)
          .split(',')
          .filter(Boolean),
      });
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.groups.length < 2) {
    throw new Error(
      'Give at least two sets, the baseline first: label=a.csv,b.csv label2=c.csv'
    );
  }
  if (!Number.isFinite(options.skipSeconds) || options.skipSeconds < 0) {
    throw new Error('--skip-seconds must be a number of seconds, 0 or more');
  }
  return options;
}

export function main(argv) {
  const options = parseArgs(argv);
  const sets = options.groups.map((group) => {
    const summaries = group.files.map((file) => {
      const { process, frames } = readFrames(readFileSync(file, 'utf8'), {
        processName: options.process,
        skipSeconds: options.skipSeconds,
      });
      if (frames.length === 0) {
        throw new Error(
          `${file}: no frames left for ${process ?? 'any process'}`
        );
      }
      return summarize(frames);
    });
    return { label: group.label, summaries, aggregate: aggregate(summaries) };
  });
  console.log(renderTable(sets));
  if (options.json) {
    writeFileSync(options.json, JSON.stringify(sets, undefined, 2));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
