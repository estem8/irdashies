import path from 'node:path';
import { TapeReader } from '../../telemetry-replay/tape.ts';
import { importIbt, type ReplayInputInfo } from './ibt.ts';

/** Public input adapter: source preparation is outside measured playback time. */
export async function prepareReplayInput(
  input: string,
  convertedPath: string
): Promise<{
  tapePath: string;
  info: ReplayInputInfo;
}> {
  if (path.extname(input).toLowerCase() === '.ibt') {
    return {
      tapePath: convertedPath,
      info: await importIbt(input, convertedPath),
    };
  }
  if (path.extname(input).toLowerCase() !== '.irdt')
    throw new Error('Input must be .ibt or .irdt');
  const reader = await TapeReader.open(input);
  let frames = 0;
  let seconds: number;
  try {
    for (;;) {
      const record = await reader.readRecord();
      if (!record) throw new Error('Tape has no end/disconnect record');
      seconds =
        Number(record.elapsedTicks) / Number(reader.schema.header.qpcFrequency);
      if (record.kind === 'frame') frames++;
      if (record.kind === 'end' || record.kind === 'disconnect') break;
    }
    if (!frames) throw new Error('Tape has no frames');
    return {
      tapePath: input,
      info: {
        format: 'irdt',
        frames,
        durationSeconds: seconds,
        tickRate: reader.schema.header.tickRate,
        variables: [...reader.schema.variables.keys()],
        warnings: [],
      },
    };
  } finally {
    await reader.close();
  }
}
