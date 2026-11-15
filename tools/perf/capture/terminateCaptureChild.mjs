import { setTimeout as sleep } from 'node:timers/promises';

/** Stop an owned detached capture child; never infer exit from a signal alone. */
export async function terminateCaptureChild({
  childPid,
  browserPid,
  exit,
  kill = (pid, signal) => process.kill(pid, signal),
  wait = sleep,
}) {
  const errors = [];
  const signal = (pid, name) => {
    try {
      kill(pid, name);
    } catch (error) {
      if (error.code !== 'ESRCH') errors.push(String(error));
    }
  };
  // Main handles SIGTERM with app.quit(). Keep the GPU/renderer alive while
  // Electron flushes storage and performs its normal shutdown.
  signal(browserPid ?? -childPid, 'SIGTERM');
  const hasExited = (ms) =>
    Promise.race([exit.then(() => true), wait(ms).then(() => false)]);
  if (await hasExited(15_000)) return { terminated: true, errors };
  signal(-childPid, 'SIGKILL');
  return { terminated: await hasExited(5_000), errors };
}
