import { desktopCapturer, screen } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import logger from './logger';
import type { SessionLifecycle } from './sessionLifecycle';
import { stamp, tyreRunCar, tyreRunDir, tyreRunRoot } from './tyreLog';

const INTERVAL_MS = 1_000;

/** A part of the display, as fractions of its width and height. */
interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where each car shows its tire temperatures. A car that is not listed is
 * captured whole at half size, and `dashCrop.json` next to the exe overrides or
 * adds entries without a rebuild: { "<CarPath>": { x, y, width, height } }.
 */
const CROPS: Record<string, Crop> = {
  ferrari296gt3: { x: 0.45, y: 0.65, width: 0.35, height: 0.35 },
  // The four tire temperatures on the centre screen, left of the pressures.
  cadillacvseriesrgtp: { x: 0.37, y: 0.8, width: 0.13, height: 0.14 },
};

const readCrops = async (
  root: string | undefined
): Promise<Record<string, Crop>> => {
  if (!root) return CROPS;
  try {
    const file = JSON.parse(
      await fs.readFile(path.join(root, 'dashCrop.json'), 'utf8')
    ) as Record<string, Crop>;
    return { ...CROPS, ...file };
  } catch {
    return CROPS;
  }
};

/** Run folders that already have their one whole-screen picture. */
const shown = new Set<string>();

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
  const image = source.thumbnail;
  const { width, height } = image.getSize();
  const half = () => image.resize({ width: Math.round(width / 2) });
  const now = new Date();
  // Milliseconds too: a car whose readings jump within a second needs the order.
  const time = `${stamp(now)}.${String(now.getMilliseconds()).padStart(3, '0')}`;

  if (!shown.has(dir)) {
    shown.add(dir);
    await fs.writeFile(path.join(dir, `full ${time}.jpg`), half().toJPEG(60));
  }

  const car = tyreRunCar();
  const crop = car ? (await readCrops(tyreRunRoot()))[car] : undefined;
  const picture = crop
    ? image
        .crop({
          x: Math.round(width * crop.x),
          y: Math.round(height * crop.y),
          width: Math.round(width * crop.width),
          height: Math.round(height * crop.height),
        })
        .toJPEG(70)
    : half().toJPEG(60);
  await fs.writeFile(path.join(dir, `dash ${time}.jpg`), picture);
};

/**
 * TEMPORARY: while the player is driving, saves a screenshot of the primary
 * display's dash area every second into the current tyre run folder, named by
 * local time, and one whole-screen picture per run to see where a car puts
 * its tire temperatures.
 *
 * iRacing publishes tire temperatures only at pit stops, so the cockpit dash
 * is the only live reference for the tire model; these shots are matched
 * against the per-second [TireTrace] lines in tyre.log. Remove with the rest
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
