import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Standings } from '@irdashies/domain';
import type { Page } from '@irdashies/domain/broadcast/towerPages';
import { driverName } from '../../shared/Broadcast/format';
import { CaretUpIcon } from '@phosphor-icons/react';
import { DriverRow, PositionArrow } from './TowerRows';

// Spies on what each component calls while it renders, so a skipped render
// shows up as a call that did not happen.
vi.mock('../../shared/Broadcast/format', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../shared/Broadcast/format')>();
  return { ...original, driverName: vi.fn(original.driverName) };
});
vi.mock('@phosphor-icons/react', () => ({
  CaretUpIcon: vi.fn(() => null),
  CaretDownIcon: vi.fn(() => null),
  FlagIcon: vi.fn(() => null),
  MicrophoneIcon: vi.fn(() => null),
}));

const standing = (overrides: Partial<Standings> = {}): Standings =>
  ({
    carIdx: 3,
    classPosition: 2,
    carClass: { id: 1, color: 0xff0000 },
    driver: { name: 'Ada Lovelace', carNum: '7' },
    onPitRoad: false,
    gap: { value: 1.25 },
    ...overrides,
  }) as unknown as Standings;

const page = { kind: 'gaps' } as Page;

const row = (overrides: Partial<Standings> = {}) => (
  <DriverRow
    standing={standing(overrides)}
    page={{ ...page }}
    nameFormat="name-middlename-surname"
    positionStyle=""
    focused={false}
  />
);

beforeEach(() => vi.clearAllMocks());

describe('DriverRow', () => {
  it('skips a rebuilt standing with the same contents', () => {
    const view = render(row());
    expect(driverName).toHaveBeenCalledTimes(1);
    view.rerender(row());
    view.rerender(row());
    expect(driverName).toHaveBeenCalledTimes(1);
  });

  it('renders when something the row shows changes', () => {
    const view = render(row());
    view.rerender(row({ gap: { value: 2.5, laps: 0 } }));
    expect(driverName).toHaveBeenCalledTimes(2);
  });

  it('renders when the page changes', () => {
    const view = render(row());
    view.rerender(
      <DriverRow
        standing={standing()}
        page={{ kind: 'pits' } as Page}
        nameFormat="name-middlename-surname"
        positionStyle=""
        focused={false}
      />
    );
    expect(driverName).toHaveBeenCalledTimes(2);
  });
});

describe('PositionArrow', () => {
  it('skips when the delta is the same', () => {
    const view = render(<PositionArrow delta={2} />);
    expect(CaretUpIcon).toHaveBeenCalledTimes(1);
    view.rerender(<PositionArrow delta={2} />);
    expect(CaretUpIcon).toHaveBeenCalledTimes(1);
  });
});
