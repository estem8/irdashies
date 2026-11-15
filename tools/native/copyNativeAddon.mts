import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/** Build-time copy: never truncate an addon mapped by a running dev app. */
export function copyNativeAddon(source: string, destination: string): void {
  const bytes = fs.readFileSync(source);
  if (fs.existsSync(destination) && fs.readFileSync(destination).equals(bytes))
    return;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, bytes, { flag: 'wx' });
    fs.renameSync(temporary, destination);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}
