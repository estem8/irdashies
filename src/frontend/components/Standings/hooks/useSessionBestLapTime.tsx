import { useSessionBarFields } from '@irdashies/context';

export const useSessionBestLapTime = (): number | undefined => {
  return useSessionBarFields('sessionBestLap')?.sessionBestLap;
};
