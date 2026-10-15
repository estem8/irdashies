import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChannelBridge, SessionBarSnapshot } from '@irdashies/types';
import { useSessionBarFields } from './useSessionBarSnapshot';

const snapshot = (fields: Partial<SessionBarSnapshot>) =>
  ({ displayUnits: 0, version: 1, ...fields }) as SessionBarSnapshot;

const installBridge = () => {
  let publish: ((payload: SessionBarSnapshot) => void) | undefined;
  window.channelBridge = {
    subscribe: vi.fn(
      (_channel: string, callback: (payload: SessionBarSnapshot) => void) => {
        publish = callback;
        return vi.fn();
      }
    ),
  } as unknown as ChannelBridge;
  return (payload: SessionBarSnapshot) => publish?.(payload);
};

afterEach(() => {
  delete (window as { channelBridge?: ChannelBridge }).channelBridge;
});

describe('useSessionBarFields', () => {
  it('is undefined until the first snapshot arrives', () => {
    installBridge();
    const { result } = renderHook(() => useSessionBarFields('airTemp'));
    expect(result.current).toBeUndefined();
  });

  it('returns only the named fields', () => {
    const publish = installBridge();
    const { result } = renderHook(() =>
      useSessionBarFields('airTemp', 'trackTemp')
    );
    act(() => publish(snapshot({ airTemp: 20, trackTemp: 31, fuelLevel: 50 })));
    expect(result.current).toEqual({ airTemp: 20, trackTemp: 31 });
  });

  it('does not render when a field it did not ask for changes', () => {
    const publish = installBridge();
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useSessionBarFields('airTemp');
    });
    act(() => publish(snapshot({ airTemp: 20, fuelLevel: 50 })));
    const afterFirst = renders;
    const first = result.current;

    act(() => publish(snapshot({ airTemp: 20, fuelLevel: 49, version: 2 })));
    act(() => publish(snapshot({ airTemp: 20, fuelLevel: 48, version: 3 })));

    expect(renders).toBe(afterFirst);
    expect(result.current).toBe(first);
  });

  it('renders when a field it asked for changes', () => {
    const publish = installBridge();
    const { result } = renderHook(() => useSessionBarFields('airTemp'));
    act(() => publish(snapshot({ airTemp: 20 })));
    act(() => publish(snapshot({ airTemp: 21, version: 2 })));
    expect(result.current?.airTemp).toBe(21);
  });
});
