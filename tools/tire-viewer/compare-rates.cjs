// Replays one .ibt under different frame rates and prints how far the model is
// from the recorded temperatures in each, so the effect of the time step is a number, not a guess.
//   node build.mjs && node compare-rates.cjs path/to/file.ibt
const { replay } = require('./replay.cjs');

const file = process.argv[2];
if (!file) {
  console.error('usage: node compare-rates.cjs <file.ibt>');
  process.exit(2);
}

const MODES = [
  ['app: 20 Hz arrival, 15 Hz tick', { arrivalHz: 20, limit: true }],
  ['20 Hz arrival, no tick limit (old viewer)', { arrivalHz: 20, limit: false }],
  ['60 Hz arrival, 15 Hz tick', { arrivalHz: 60, limit: true }],
  ['60 Hz, no tick limit', { arrivalHz: 60, limit: false }],
];

/** RMSE over the samples where both are finite; NaN when none. */
const rmse = (a, b) => {
  let sum = 0, n = 0;
  for (let i = 0; i < a.length; i++) {
    if (Number.isFinite(a[i]) && Number.isFinite(b[i])) { sum += (a[i] - b[i]) ** 2; n++; }
  }
  return n ? Math.sqrt(sum / n) : NaN;
};
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

console.log(`file: ${file}`);
console.log('RMSE in deg C, mean over the four tires. model series vs recorded series.');
console.log('mode'.padEnd(44) + 'steps'.padStart(7) + 'real/tread'.padStart(12) + 'real/carc'.padStart(11) + 'dash/tread'.padStart(12) + 'dash/carc'.padStart(11));
for (const [label, options] of MODES) {
  const r = replay(file, options);
  const corners = Object.values(r.corners);
  const col = (model, ref) => mean(corners.map((c) => rmse(c[model], c[ref]))).toFixed(2);
  console.log(
    label.padEnd(44) + String(r.t.length).padStart(7) +
    col('real', 'tread').padStart(12) + col('real', 'carcass').padStart(11) +
    col('dash', 'tread').padStart(12) + col('dash', 'carcass').padStart(11)
  );
}
console.log('NaN: the car has no such model series (e.g. no surface model).');
