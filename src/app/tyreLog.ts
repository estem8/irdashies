import { app } from 'electron';
import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs';
import path from 'node:path';

const pad = (n: number) => String(n).padStart(2, '0');
/** Local time to the second, e.g. "2026-10-24 153012". */
export const stamp = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
  `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

const safe = (s: string) => s.replace(/[^\w.-]+/g, '_').slice(0, 40);

let current:
  | { dir: string; root: string; car?: string; key: string; out: WriteStream }
  | undefined;

/**
 * TEMPORARY: one folder per car and race (next to the exe when packaged, so
 * it sits with the build), holding tyre.log and the dash screenshots. The
 * tire model is said to change between series, so each run is kept apart.
 */
export const startTyreRun = (
  key: string,
  label: string,
  car?: string
): void => {
  if (current?.key === key) return;
  current?.out.end();
  current = undefined;
  const root = app.isPackaged
    ? path.dirname(app.getPath('exe'))
    : path.join(app.getPath('userData'), 'logs');
  const dir = path.join(root, 'tyre', `${stamp(new Date())} ${safe(label)}`);
  try {
    mkdirSync(dir, { recursive: true });
    const out = createWriteStream(path.join(dir, 'tyre.log'), { flags: 'a' });
    // A read-only install folder or a full disk must not take the app down.
    out.on('error', () => {
      if (current?.out === out) current = undefined;
    });
    current = { dir, root, car, key, out };
  } catch {
    // No folder, no log: tyreLog and the screen capture then do nothing.
    current = undefined;
  }
};

export const tyreRunDir = (): string | undefined => current?.dir;

/** The car this run is for, and the folder holding the run folders and dashCrop.json. */
export const tyreRunCar = (): string | undefined => current?.car;
export const tyreRunRoot = (): string | undefined => current?.root;

export const tyreLog = (line: string): void => {
  current?.out.write(`${stamp(new Date())} ${line}\n`);
};
