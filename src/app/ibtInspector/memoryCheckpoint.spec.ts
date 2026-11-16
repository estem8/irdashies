import { afterEach, expect, it, vi } from 'vitest';
import { collectMainGarbage, linuxPrivateMemoryMiB } from './memoryCheckpoint';

const session = vi.hoisted(() => ({
  connect: vi.fn(),
  post: vi.fn(),
  disconnect: vi.fn(),
}));
vi.mock('node:inspector', () => ({
  default: {
    Session: class {
      connect = session.connect;
      post = session.post;
      disconnect = session.disconnect;
    },
  },
}));
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

it('closes the internal inspector session after collecting main GC', async () => {
  session.post.mockImplementation(
    (_method, callback: (error: Error | null) => void) => callback(null)
  );
  await collectMainGarbage();
  expect(session.post).toHaveBeenCalledWith(
    'HeapProfiler.collectGarbage',
    expect.any(Function)
  );
  expect(session.disconnect).toHaveBeenCalledOnce();
});

it('rejects a stalled main GC and releases the session', async () => {
  vi.useFakeTimers();
  const result = collectMainGarbage();
  const rejected = expect(result).rejects.toThrow('Main GC timed out');
  await vi.advanceTimersByTimeAsync(5000);
  await rejected;
  expect(session.disconnect).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it('reports inaccessible process memory as unknown rather than zero', async () => {
  await expect(linuxPrivateMemoryMiB(-1)).resolves.toBeNull();
});
