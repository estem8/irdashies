import inspector from 'node:inspector';
import { readFile } from 'node:fs/promises';

/** Developer-only paused replay checkpoints; no exposed Node inspector port. */
export async function collectMainGarbage(): Promise<void> {
  const session = new inspector.Session();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    session.connect();
    await new Promise<void>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Main GC timed out')), 5000);
      session.post('HeapProfiler.collectGarbage', (error) =>
        error ? reject(error) : resolve()
      );
    });
  } finally {
    clearTimeout(timer);
    session.disconnect();
  }
}

export async function linuxPrivateMemoryMiB(
  pid: number
): Promise<number | null> {
  try {
    const text = await readFile(`/proc/${pid}/smaps_rollup`, 'utf8');
    const values = [
      ...text.matchAll(/^Private_(?:Clean|Dirty):\s+(\d+) kB$/gm),
    ].map((match) => Number(match[1]));
    return values.length === 2
      ? values.reduce((a, b) => a + b, 0) / 1024
      : null;
  } catch {
    return null; // Process exit or inaccessible metrics must not become zero memory.
  }
}
