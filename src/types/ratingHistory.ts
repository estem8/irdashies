/**
 * The player's iRating and safety rating as the sim reported them when a
 * session loaded. A new point is kept only when either value changed.
 */
export interface RatingPoint {
  /** Epoch ms when the value was first seen. */
  at: number;
  userId: number;
  /** WeekendInfo.Category, e.g. 'Road', 'Oval', 'DirtRoad'. */
  category: string;
  iRating: number;
  /** LicSubLevel / 100, e.g. 4.32. */
  safetyRating: number;
  /** License class letter from LicString, e.g. 'A'. */
  licenseClass: string;
}

export interface RatingHistoryBridge {
  /** Every recorded point, oldest first. Resolves [] on any read error. */
  getHistory: () => Promise<RatingPoint[]>;
}
