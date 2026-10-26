import { memo, useMemo } from 'react';
import type { TireCornerSnapshot } from '@irdashies/types';
import type { SlipEvent } from '../slipEvent';
import { formatPressure, lapsLeft, tempColor, wearClass } from '../tireStyle';
import { DiscIcon } from './DiscIcon';
import { PressureLabel } from './PressureLabel';
import { TireTop } from './TireTop';

/** Drawing degrees of lean per degree of camber; a few real degrees would not show. */
const CAMBER_TILT = 4;
/** Drawing degrees of turn per degree of toe; real toe is a fraction of a degree. */
const TOE_TURN = 25;
const MAX_TOE_TURN = 12;

interface TireCardProps {
  /** Which side of the car the tire is on; camber leans toward the car. */
  side: 'left' | 'right';
  tire?: TireCornerSnapshot;
  fahrenheit: boolean;
  pressureUnit: 'kPa' | 'psi';
  optimal: number;
  range: number;
  limit: number;
  /** Peak temperature, in Celsius, from which the tire glows; 0 is off. */
  overheat: number;
  tempMode: 'average' | 'real';
  wearMode: 'all' | 'average' | 'min';
  event?: SlipEvent;
}

export const TireCard = memo(
  ({
    side,
    tire,
    fahrenheit,
    pressureUnit,
    optimal,
    range,
    limit,
    overheat,
    tempMode,
    wearMode,
    event,
  }: TireCardProps) => {
    const left = tire && lapsLeft(tire, limit);
    const wearValues: (number | undefined)[] = !tire
      ? [undefined, undefined, undefined]
      : wearMode === 'average'
        ? [tire.wear.reduce((a, b) => a + b, 0) / tire.wear.length]
        : wearMode === 'min'
          ? [Math.min(...tire.wear)]
          : [tire.wear[0], tire.wear[1], tire.wear[2]];
    // Zones run left to right across the car (iRacing's L, M, R), the same
    // order on the screen for every tire.
    const temp =
      tempMode === 'real' && tire?.tempReal ? tire.tempReal : tire?.temp;
    // Memoised so TireTop, which is memoised on these, only redraws when a
    // temperature or a setting changes, not on a pressure or wear tick.
    const colors = useMemo(
      () =>
        [0, 1, 2].map((zone) => {
          const celsius = temp?.[zone];
          return celsius === undefined
            ? 'rgb(100 116 139)'
            : tempColor(celsius, optimal, range);
        }),
      [temp, optimal, range]
    );
    // Zones at or over the overheat limit; the number alone is highlighted.
    const hot = useMemo(
      () =>
        [0, 1, 2].map(
          (zone) =>
            overheat > 0 && temp?.[zone] !== undefined && temp[zone] >= overheat
        ),
      [temp, overheat]
    );
    const labels = useMemo(
      () =>
        [0, 1, 2].map((zone) => {
          const celsius = temp?.[zone];
          if (celsius === undefined) return '--';
          return `${Math.round(fahrenheit ? (celsius * 9) / 5 + 32 : celsius)}`;
        }),
      [temp, fahrenheit]
    );
    // Negative camber leans the top toward the car, turning the inner
    // shoulder toward the viewer.
    const tilt =
      (side === 'left' ? 1 : -1) *
      Math.max(-20, Math.min(20, (tire?.camber ?? 0) * CAMBER_TILT));
    // Toe-in points the front of the tire (the top here) toward the car.
    const toeTurn =
      (side === 'left' ? 1 : -1) *
      Math.max(
        -MAX_TOE_TURN,
        Math.min(MAX_TOE_TURN, (tire?.toeDeg ?? 0) * TOE_TURN)
      );

    const pressureLabel = tire?.pressure !== undefined && (
      <PressureLabel
        value={formatPressure(tire.pressure, pressureUnit)}
        unit={pressureUnit}
        hot={tire.pressureHot === true}
      />
    );

    const sideInfo = (pressureLabel || tire?.disc !== undefined) && (
      <div className="flex w-[2.6em] flex-none flex-col items-center gap-1">
        {pressureLabel}
        {tire?.disc !== undefined && <DiscIcon level={tire.disc} />}
      </div>
    );

    return (
      <div className="flex min-h-0 flex-col gap-1.5">
        <div className="flex min-h-0 flex-1 items-center gap-1">
          {side === 'left' && sideInfo}
          <div className="flex h-full min-h-0 min-w-0 flex-1 justify-center">
            <div
              className="aspect-[5/7] h-full max-w-full"
              style={{
                transform: `perspective(280px) rotateZ(${toeTurn}deg) rotateY(${tilt}deg)`,
              }}
            >
              <TireTop
                side={side}
                tire={tire}
                colors={colors}
                labels={labels}
                hot={hot}
                event={event}
              />
            </div>
          </div>
          {side === 'right' && sideInfo}
        </div>

        <div className="grid flex-none grid-cols-3 gap-[4%] px-[9%]">
          {wearValues.map((wear, i) => (
            <span
              key={i}
              className={`text-center text-[0.8em] font-bold tabular-nums leading-none ${
                wearValues.length === 1 ? 'col-span-3 ' : ''
              }${wear === undefined ? 'text-white' : wearClass(wear, limit)}`}
            >
              {wear === undefined ? '--' : `${Math.round(wear)}%`}
            </span>
          ))}
        </div>
        {left !== undefined && (
          <div className="flex-none text-center text-xs font-black italic tabular-nums text-amber-300">
            {left} LAPS
          </div>
        )}
      </div>
    );
  }
);
TireCard.displayName = 'TireCard';
