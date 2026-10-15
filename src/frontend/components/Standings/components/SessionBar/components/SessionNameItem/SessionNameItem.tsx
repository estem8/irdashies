import { memo } from 'react';
import { useSessionBarFields } from '@irdashies/context';
import { sessionBarItemWrapperClass } from '../../sessionBarItemWrapperClass';
import type { SessionBarItemProps } from '../../sessionBarItemTypes';

export const SessionNameItem = memo(({ standalone }: SessionBarItemProps) => {
  const session = useSessionBarFields('sessionName')?.sessionName;

  return (
    <div className={sessionBarItemWrapperClass(standalone)}>
      <div className="flex">{session}</div>
    </div>
  );
});
SessionNameItem.displayName = 'SessionNameItem';
