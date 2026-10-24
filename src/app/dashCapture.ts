import { desktopCapturer, screen } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import logger from './logger';
import type { SessionLifecycle } from './sessionLifecycle';
import { stamp, tyreRunDir } from './tyreLog';

const INTERVAL_MS = 15_000;

/** Lower right of the screen, where the cars show tire temperatures (fractions of the display). */
const CROP = { x: 0.45, y: 0.65, width: 0.35, height: 0.35 };

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
  const { width, height } = source.thumbnail.getSize();
  const crop = source.thumbnail.crop({
    x: Math.round(width * CROP.x),
    y: Math.round(height * CROP.y),
    width: Math.round(width * CROP.width),
    height: Math.round(height * CROP.height),
  });
  await fs.writeFile(
    path.join(dir, `dash ${stamp(new Date())}.jpg`),
    crop.toJPEG(70)
  );
};

/**
 * TEMPORARY: while the player is driving, saves a screenshot of the primary
 * display's dash area every 15 s into the current tyre run folder, named by
 * local time.
 *
 * iRacing publishes tire temperatures only at pit stops, so the cockpit dash
 * is the only live reference for the tire model; these shots are matched
 * against the per-second [TireTrace] lines in main.log. Remove with the rest
 * of the tire diagnostics.
 */
export const startDashCapture = (lifecycle: SessionLifecycle): (() => void) => {
  let busy = false;
  const timer = setInterval(() => {
    const dir = tyreRunDir();
    if (!dir || busy || lifecycle.getCurrentState().isDriving !== true) return;
    busy = true;
    capture(dir)
      .catch((err: unknown) => logger.warn('[DashCapture] failed', err))
      .finally(() => {
        busy = false;
      });
  }, INTERVAL_MS);
  return () => clearInterval(timer);
};
