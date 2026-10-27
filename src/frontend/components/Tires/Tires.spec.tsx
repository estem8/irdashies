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
    expect(screen.getByText('Temps from last stop')).toBeTruthy();
    expect(screen.getByText('85')).toBeTruthy();
  });

  it('highlights the number of a zone that reaches the overheat limit', () => {
    vi.mocked(Context.useTrackStateSelector).mockReturnValue(true);
    vi.mocked(Context.useTireSnapshot).mockReturnValue({
      version: 1,
      slip: { abs: false, tc: 0, spin: 0, lock: 0, under: 0, over: 0 },
      corners: {
        lf: { temp: [80, 85, 112], wear: [90, 91, 92] },
        rf: { temp: [80, 85, 90], wear: [90, 91, 92] },
      },
    } as never);
    const { container } = render(<Tires />);
    // Only the 112 C number is highlighted, nothing is drawn around the tire.
    expect(container.querySelectorAll('text[stroke="#7f1d1d"]')).toHaveLength(
      1
    );
    expect(container.querySelector('[class*="drop-shadow"]')).toBeNull();
  });

  const useSnapshot = () =>
    vi.mocked(Context.useTireSnapshot).mockReturnValue({
      version: 1,
      slip: { abs: false, tc: 0, spin: 0, lock: 0, under: 0, over: 0 },
      corners: {
        lf: {
          temp: [60, 61, 62],
          tempReal: [101, 101, 101],
          wear: [90, 80, 70],
        },
      },
    } as never);

  it('shows the slow temperature in average mode', () => {
    vi.mocked(Context.useTrackStateSelector).mockReturnValue(true);
    useSnapshot();
    render(<Tires />);
    expect(screen.getByText('61')).toBeTruthy();
    expect(screen.queryByText('101')).toBeNull();
  });

  it('shows the tread remaining of every zone by default', () => {
    vi.mocked(Context.useTrackStateSelector).mockReturnValue(true);
    useSnapshot();
    render(<Tires />);
    for (const text of ['90%', '80%', '70%'])
      expect(screen.getByText(text)).toBeTruthy();
  });

  const withConfig = (config: Record<string, unknown>) =>
    vi.mocked(Context.useDashboard).mockReturnValue({
      isDemoMode: false,
      currentDashboard: { widgets: [{ id: 'tires', enabled: true, config }] },
    } as never);

  it('shows the real temperature in real mode', () => {
    vi.mocked(Context.useTrackStateSelector).mockReturnValue(true);
    useSnapshot();
    withConfig({ tempMode: 'real' });
    render(<Tires />);
    expect(screen.getAllByText('101').length).toBeGreaterThan(0);
    expect(screen.queryByText('61')).toBeNull();
  });

  it('shows one tread remaining value in average and minimum mode', () => {
    vi.mocked(Context.useTrackStateSelector).mockReturnValue(true);
    useSnapshot();
    withConfig({ wearMode: 'average' });
    const average = render(<Tires />);
    expect(screen.getByText('80%')).toBeTruthy();
    expect(screen.queryByText('90%')).toBeNull();
    average.unmount();
    withConfig({ wearMode: 'min' });
    render(<Tires />);
    expect(screen.getByText('70%')).toBeTruthy();
    expect(screen.queryByText('80%')).toBeNull();
  });

  it('shows no caption when not on track', () => {
    vi.mocked(Context.useTrackStateSelector).mockReturnValue(false);
    render(<Tires />);
    expect(screen.queryByText('Temps from last stop')).toBeNull();
  });
});
