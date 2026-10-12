import v8 from 'node:v8';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  sumCompletePrivateMemoryMB,
  TelemetryPerfMetrics,
} from './perfMetrics';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('performance process memory coverage', () => {
  it('sums private bytes only when every included process reports them', () => {
    expect(sumCompletePrivateMemoryMB([1024, 2048])).toBe(3);
    expect(sumCompletePrivateMemoryMB([1024, undefined])).toBeUndefined();
    expect(sumCompletePrivateMemoryMB([])).toBeUndefined();
  });

  it('reports the main-process memory breakdown in MB', () => {
    const MB = 1024 * 1024;
    vi.spyOn(process, 'memoryUsage').mockReturnValue({
      rss: 100 * MB,
      heapTotal: 60 * MB,
      heapUsed: 40 * MB,
      external: 12 * MB,
      arrayBuffers: 8 * MB,
    });
    vi.spyOn(v8, 'getHeapStatistics').mockReturnValue({
      malloced_memory: 5 * MB,
      peak_malloced_memory: 6 * MB,
    } as ReturnType<typeof v8.getHeapStatistics>);

    const report = new TelemetryPerfMetrics(true).report();

    expect(report.mainMemory).toEqual({
      rssMB: 100,
      heapTotalMB: 60,
      heapUsedMB: 40,
      externalMB: 12,
      arrayBuffersMB: 8,
      mallocedMB: 5,
      peakMallocedMB: 6,
    });
  });

  it('omits the main-process memory breakdown without breaking the report', () => {
    vi.spyOn(process, 'memoryUsage').mockImplementation(() => {
      throw new Error('memory usage unavailable');
    });

    const report = new TelemetryPerfMetrics(true).report();

    expect(report.mainMemory).toBeUndefined();
    expect(report.tickCount).toBe(0);
  });
});
