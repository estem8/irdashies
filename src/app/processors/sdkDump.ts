import type { Telemetry } from '@irdashies/types';

/** Arrays longer than this are per-car tables, not one value of ours. */
const MAX_SAMPLES = 8;

/**
 * TEMPORARY: once a second, the mean of every scalar variable the sim
 * publishes (the 360 Hz `_ST` arrays averaged), as a CSV line, so the whole SDK
 * can be searched offline for what the tire model misses. Remove with the rest
 * of the tire diagnostics.
 */
export class SdkDump {
  private sums = new Map<string, number>();
  private time = 0;
  private columns: string[] | undefined;

  get seconds(): number {
    return this.time;
  }

  add(frame: Telemetry, dt: number): void {
    if (!(dt > 0)) return;
    this.time += dt;
    for (const [key, entry] of Object.entries(
      frame as unknown as Record<string, { value?: unknown[] }>
    )) {
      const values = entry?.value;
      if (!Array.isArray(values) || values.length === 0) continue;
      if (values.length > MAX_SAMPLES) continue;
      let sum = 0;
      let n = 0;
      for (const v of values) {
        const x = typeof v === 'boolean' ? (v ? 1 : 0) : v;
        if (typeof x === 'number' && Number.isFinite(x)) {
          sum += x;
          n += 1;
        }
      }
      if (n > 0) this.sums.set(key, (this.sums.get(key) ?? 0) + (sum / n) * dt);
    }
  }

  /** The second's means as a CSV line and the header line, then starts over. */
  flush(clock: string): { header: string; line: string } {
    this.columns ??= [...this.sums.keys()].sort();
    const t = this.time || 1;
    const line = `${clock},${this.columns
      .map((k) => {
        const v = this.sums.get(k);
        return v === undefined ? '' : +(v / t).toPrecision(6);
      })
      .join(',')}\n`;
    this.sums = new Map();
    this.time = 0;
    return { header: `clock,${this.columns.join(',')}\n`, line };
  }
}
