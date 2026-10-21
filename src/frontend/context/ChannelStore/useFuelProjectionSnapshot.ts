import type { ChannelBridge, FuelProjectionSnapshot } from '@irdashies/types';
import { useChannelSelector, useChannelSnapshot } from './useChannelSnapshot';

export const useFuelProjectionSnapshot = (bridge?: ChannelBridge) =>
  useChannelSnapshot('fuel.projection', undefined, bridge);

/** Re-renders only when the selected value changes, not on every snapshot. */
export const useFuelProjectionSelector = <Selected>(
  selector: (snapshot: FuelProjectionSnapshot) => Selected
) => useChannelSelector('fuel.projection', selector);
