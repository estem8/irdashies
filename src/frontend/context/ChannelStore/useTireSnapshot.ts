import type { ChannelBridge } from '@irdashies/types';
import { useChannelSnapshot } from './useChannelSnapshot';

export const useTireSnapshot = (enabled = true, bridge?: ChannelBridge) =>
  useChannelSnapshot('tires.snapshot', undefined, bridge, enabled);
