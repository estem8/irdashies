import assert from 'node:assert/strict';

const fields = {
  privateMiB: 'privateMB',
  privateCleanMiB: 'privateCleanMiB',
  privateDirtyMiB: 'privateDirtyMiB',
  privateHugetlbMiB: 'privateHugetlbMiB',
  anonymousMiB: 'anonymousMiB',
  pssMiB: 'pssMB',
  pssAnonMiB: 'pssAnonMiB',
  pssFileMiB: 'pssFileMiB',
  pssShmemMiB: 'pssShmemMiB',
  rssMiB: 'rssMB',
};

/** Descriptive smaps composition, never an allocation or leak verdict. */
export function summarizeMemoryBreakdown(
  samples,
  {
    pid,
    origin,
    startSeconds = 60,
    endSeconds = 420,
    minSpanSeconds = 300,
    minSamples = 30,
  }
) {
  assert.ok(Number.isInteger(pid) && pid > 0, 'Invalid PID');
  const selected = samples
    .map((sample) => ({
      seconds: (Date.parse(sample.timestamp) - origin) / 1000,
      process: sample.processes.find((p) => p.pid === pid),
    }))
    .filter((s) => s.seconds >= startSeconds && s.seconds <= endSeconds);
  assert.ok(selected.length >= minSamples, 'Insufficient memory observations');
  const first = selected[0],
    last = selected.at(-1),
    spanSeconds = last.seconds - first.seconds;
  assert.ok(spanSeconds >= minSpanSeconds, 'Insufficient memory span');
  const creationTime = first.process?.creationTime;
  assert.ok(Number.isFinite(creationTime), 'Missing process lifetime');
  for (let i = 0; i < selected.length; i++) {
    const { process: p } = selected[i];
    assert.ok(p && !p.unavailable, 'Missing private-memory process');
    assert.equal(
      p.creationTime,
      creationTime,
      'Memory process lifetime changed'
    );
    assert.ok(
      Number.isFinite(p.privateMB) && p.privateMB >= 0,
      'Invalid private memory'
    );
    if (i)
      assert.ok(
        selected[i].seconds > selected[i - 1].seconds &&
          selected[i].seconds - selected[i - 1].seconds < 15,
        'Memory observation gap'
      );
  }
  const stats = {};
  for (const [name, key] of Object.entries(fields)) {
    const valid = selected.filter(
      (s) => Number.isFinite(s.process[key]) && s.process[key] >= 0
    );
    if (valid.length !== selected.length) {
      stats[name] = {
        availableSamples: valid.length,
        first: null,
        last: null,
        delta: null,
        min: null,
        max: null,
        slopeMiBPerMinute: null,
      };
      continue;
    }
    const values = valid.map((s) => s.process[key]);
    const times = valid.map((s) => (s.seconds - first.seconds) / 60),
      meanX = times.reduce((n, v) => n + v, 0) / times.length,
      meanY = values.reduce((n, v) => n + v, 0) / values.length;
    const covariance = times.reduce(
        (n, x, i) => n + (x - meanX) * (values[i] - meanY),
        0
      ),
      variance = times.reduce((n, x) => n + (x - meanX) ** 2, 0);
    stats[name] = {
      availableSamples: valid.length,
      first: values[0],
      last: values.at(-1),
      delta: values.at(-1) - values[0],
      min: Math.min(...values),
      max: Math.max(...values),
      slopeMiBPerMinute: variance > 0 ? covariance / variance : null,
    };
  }
  const decompositionAvailable = [
    'privateCleanMiB',
    'privateDirtyMiB',
    'privateHugetlbMiB',
  ].every((k) => stats[k].availableSamples === selected.length);
  const decompositionMaxErrorMiB = decompositionAvailable
    ? Math.max(
        ...selected.map(({ process: p }) =>
          Math.abs(
            p.privateMB -
              p.privateCleanMiB -
              p.privateDirtyMiB -
              p.privateHugetlbMiB
          )
        )
      )
    : null;
  if (decompositionAvailable)
    assert.ok(
      decompositionMaxErrorMiB <= 1 / 1024,
      'Private-memory components do not match total'
    );
  return {
    pid,
    creationTime,
    sampleCount: selected.length,
    spanSeconds,
    firstSeconds: first.seconds,
    lastSeconds: last.seconds,
    decompositionMaxErrorMiB,
    fields: stats,
  };
}
