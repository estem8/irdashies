import { useChannelSnapshot } from './useChannelSnapshot';

export const usePitServiceSnapshot = () =>
  useChannelSnapshot('pit-service.snapshot');
