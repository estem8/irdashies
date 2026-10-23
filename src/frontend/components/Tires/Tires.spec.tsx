import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as Context from '@irdashies/context';
import { Tires } from './Tires';

vi.mock('@irdashies/context', () => ({
  useDashboard: vi.fn(() => ({ isDemoMode: false, currentDashboard: null })),
  useTireSnapshot: vi.fn(() => ({
    version: 1,
    corners: { lf: { temp: [80, 85, 90], wear: [90, 91, 92] } },
  })),
  useSessionBarSelector: vi.fn(() => 1),
  useTrackStateSelector: vi.fn(),
  useSessionVisibility: vi.fn(() => true),
  sessionBarSelectors: {},
  trackStateSelectors: {},
}));

describe('Tires', () => {
  it('flags values as from the last stop while driving', () => {
    vi.mocked(Context.useTrackStateSelector).mockReturnValue(true);
    render(<Tires />);
    expect(screen.getByText('Values from last stop')).toBeTruthy();
    expect(screen.getByText('85')).toBeTruthy();
  });

  it('shows no caption when not on track', () => {
    vi.mocked(Context.useTrackStateSelector).mockReturnValue(false);
    render(<Tires />);
    expect(screen.queryByText('Values from last stop')).toBeNull();
  });
});
