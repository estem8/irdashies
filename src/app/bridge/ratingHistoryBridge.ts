import { ipcMain } from 'electron';
import type { RatingPoint } from '@irdashies/types';
import logger from '../logger';

export interface RatingHistorySource {
  load: () => Promise<readonly RatingPoint[]>;
}

/** Serves the player's recorded iRating and safety rating history. */
export const setupRatingHistoryBridge = (source: RatingHistorySource) => {
  ipcMain.handle('ratingHistory:get', async () => {
    try {
      return [...(await source.load())];
    } catch (err) {
      logger.warn('[RatingHistory] Failed to load history:', err);
      return [];
    }
  });
};
