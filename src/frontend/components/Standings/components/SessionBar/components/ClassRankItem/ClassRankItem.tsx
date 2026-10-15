import { memo } from 'react';
import { useSessionBarFields } from '@irdashies/context';
import { RacingHelmetIcon } from '../../../../../shared/RacingHelmetIcon';
import { sessionBarItemWrapperClass } from '../../sessionBarItemWrapperClass';
import type { SessionBarItemProps } from '../../sessionBarItemTypes';

export const ClassRankItem = memo(({ standalone }: SessionBarItemProps) => {
  const snapshot = useSessionBarFields(
    'playerClassSize',
    'playerClassPosition',
    'playerClassified'
  );
  const total = snapshot?.playerClassSize ?? 0;
  const rank = snapshot?.playerClassPosition ?? 0;
  if (!snapshot?.playerClassified || rank <= 0 || total <= 0) return null;

  return (
    <div className={sessionBarItemWrapperClass(standalone)}>
      <div className="flex justify-center gap-1 items-center tabular-nums">
        <RacingHelmetIcon size={14} />
        <span>
          {rank}/{total}
        </span>
      </div>
    </div>
  );
});
ClassRankItem.displayName = 'ClassRankItem';
