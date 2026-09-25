import type { ChannelBridge, RadarSnapshot } from '@irdashies/types';
import {
  useChannelSelector,
  useChannelSnapshot,
  type ChannelSelectorOptions,
} from './useChannelSnapshot';

export const radarSelectors = {
  carIdxLapDistPct: (snapshot: RadarSnapshot) => snapshot.carIdxLapDistPct,
  carIdxOnPitRoad: (snapshot: RadarSnapshot) => snapshot.carIdxOnPitRoad,
  focusCarIdx: (snapshot: RadarSnapshot) => snapshot.focusCarIdx,
  isOnTrack: (snapshot: RadarSnapshot) => snapshot.isOnTrack,
} as const;

export const useRadarSelector = <Selected>(
  selector: (snapshot: RadarSnapshot) => Selected,
  options: ChannelSelectorOptions<Selected> = {}
) => useChannelSelector('radar.snapshot', selector, options);

export const useRadarSnapshot = (enabled = true, bridge?: ChannelBridge) =>
  useChannelSnapshot('radar.snapshot', undefined, bridge, enabled);
