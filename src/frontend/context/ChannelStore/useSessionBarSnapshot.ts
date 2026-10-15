import { useMemo } from 'react';
import { shallow } from 'zustand/shallow';
import type { SessionBarSnapshot } from '@irdashies/types';
import {
  useChannelSelector,
  useChannelSnapshot,
  type ChannelSelectorOptions,
} from './useChannelSnapshot';

export const sessionBarSelectors = {
  airTemp: (snapshot: SessionBarSnapshot) => snapshot.airTemp,
  displayUnits: (snapshot: SessionBarSnapshot) => snapshot.displayUnits,
  sessionNum: (snapshot: SessionBarSnapshot) => snapshot.sessionNum,
  trackTemp: (snapshot: SessionBarSnapshot) => snapshot.trackTemp,
} as const;

export const useSessionBarSelector = <Selected>(
  selector: (snapshot: SessionBarSnapshot) => Selected,
  options: ChannelSelectorOptions<Selected> = {}
) => useChannelSelector('session-bar.snapshot', selector, options);

export const useSessionBarSnapshot = () =>
  useChannelSnapshot('session-bar.snapshot');

/**
 * Only the named fields of the session bar snapshot. The component renders when
 * one of them changes, not on every delivery: most of the snapshot is the same
 * from one delivery to the next, and reading all of it re-rendered every
 * session bar item five times a second. Reading any other field is a type
 * error.
 *
 * Fields are compared shallowly, so an array-valued field (the competitor car
 * ids and positions) is a new reference on every delivery and still renders its
 * reader each time.
 */
export const useSessionBarFields = <K extends keyof SessionBarSnapshot>(
  ...keys: K[]
): Pick<SessionBarSnapshot, K> | undefined => {
  const id = keys.join(',');
  const selector = useMemo(
    () => (snapshot: SessionBarSnapshot) => {
      const picked = {} as Pick<SessionBarSnapshot, K>;
      for (const key of id.split(',') as K[]) picked[key] = snapshot[key];
      return picked;
    },
    [id]
  );
  return useSessionBarSelector(selector, { equality: shallow });
};
