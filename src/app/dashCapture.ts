import { app, desktopCapturer, screen } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import logger from './logger';
import type { SessionLifecycle } from './sessionLifecycle';

const INTERVAL_MS = 15_000;

const pad = (n: number) => String(n).padStart(2, '0');
/** Local time to the second, the same clock main.log is written in. */
const stamp = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
  `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

const capture = async (dir: string): Promise<void> => {
  const display = screen.getPrimaryDisplay();
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: Math.round(display.size.width * display.scaleFactor),
      height: Math.round(display.size.height * display.scaleFactor),
    },
  });
  const source =
    sources.find((s) => s.display_id === String(display.id)) ?? sources[0];
  if (!source || source.thumbnail.isEmpty()) return;
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, `dash ${stamp(new Date())}.jpg`),
    source.thumbnail.toJPEG(80)
  );
};

/**
 * TEMPORARY: while the player is driving, saves a screenshot of the primary
 * display every 15 s to <userData>/logs/dash, named by local time.
 *
 * iRacing publishes tire temperatures only at pit stops, so the cockpit dash
 * is the only live reference for the tire model; these shots are matched
 * against the per-second [TireTrace] lines in main.log. Remove with the rest
 * of the tire diagnostics.
 */
export const startDashCapture = (lifecycle: SessionLifecycle): (() => void) => {
  const dir = path.join(app.getPath('userData'), 'logs', 'dash');
  let busy = false;
  const timer = setInterval(() => {
    if (busy || lifecycle.getCurrentState().isDriving !== true) return;
    busy = true;
    capture(dir)
      .catch((err: unknown) => logger.warn('[DashCapture] failed', err))
      .finally(() => {
        busy = false;
      });
  }, INTERVAL_MS);
  return () => clearInterval(timer);
};
