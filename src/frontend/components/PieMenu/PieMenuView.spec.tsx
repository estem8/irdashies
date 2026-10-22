import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getWidgetDefaultConfig } from '@irdashies/types';
import { PieMenuView } from './PieMenuView';
import { DEMO_PIT_SERVICE, type PitServiceView } from './pieMenuModel';

const config = getWidgetDefaultConfig('piemenu');
const view = (
  state: Parameters<typeof PieMenuView>[0]['state'],
  service: PitServiceView = DEMO_PIT_SERVICE,
  unapplied = false
) =>
  render(
    <PieMenuView
      state={state}
      config={config}
      service={service}
      unapplied={unapplied}
    />
  );

describe('PieMenuView', () => {
  it('shows the fuel verdict in the main menu centre', () => {
    view(
      { level: 'root' },
      { ...DEMO_PIT_SERVICE, fuelMargin: -2.7, lapUsage: 3.8 }
    );
    expect(screen.getByText('-2.7')).toBeTruthy();
    expect(screen.getByText('short 10.3 L')).toBeTruthy();
  });

  it('says the stop is in progress instead of the verdict', () => {
    view({ level: 'root' }, { ...DEMO_PIT_SERVICE, stopInProgress: true });
    expect(screen.getByText('Pit stop')).toBeTruthy();
    expect(screen.queryByText('laps to finish')).toBeNull();
  });

  it('shows what the finish needs in the fuel menu centre', () => {
    view(
      { level: 'sub', entry: 'down' },
      { ...DEMO_PIT_SERVICE, fuelToFinish: 12 }
    );
    expect(screen.getByText('finish +12 L')).toBeTruthy();
  });

  it('marks a result the sim did not take', () => {
    view({ level: 'result', feedback: 'repair' }, DEMO_PIT_SERVICE, true);
    expect(screen.getByText('not applied')).toBeTruthy();
  });
});
