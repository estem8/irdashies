import { describe, expect, it, vi } from 'vitest';
import type { ChannelDefinition } from '@irdashies/types';
import { CHANNEL_DELIVERY, ChannelBus } from './channelBridge';

class FakeClock {
  now = 0;
  private tasks: {
    at: number;
    callback: () => void;
    cancelled: boolean;
  }[] = [];

  schedule = (callback: () => void, delayMs: number) => {
    const task = { at: this.now + delayMs, callback, cancelled: false };
    this.tasks.push(task);
    return { cancel: () => (task.cancelled = true) };
  };

  advance(ms: number): void {
    this.now += ms;
    const due = this.tasks
      .filter((task) => !task.cancelled && task.at <= this.now)
      .sort((a, b) => a.at - b.at);
    this.tasks = this.tasks.filter((task) => !due.includes(task));
    for (const task of due) task.callback();
  }
}

const registry: Readonly<Record<string, ChannelDefinition>> = {
  snapshot: { kind: 'snapshot', defaultRateHz: 10, maxRateHz: 60 },
  event: { kind: 'event' },
};

const createTarget = (id = 1) => ({
  id,
  destroyed: false,
  visible: true,
  send: vi.fn(),
  isDestroyed() {
    return this.destroyed;
  },
  isVisible() {
    return this.visible;
  },
});

const createBus = (clock = new FakeClock()) => ({
  clock,
  bus: new ChannelBus({
    registry,
    now: () => clock.now,
    schedule: clock.schedule,
  }),
});

describe('ChannelBus', () => {
  it('rejects unknown channels and invalid rates', () => {
    const { bus } = createBus();
    const target = createTarget();

    expect(() => bus.subscribe(target, 'missing')).toThrow('Unknown channel');
    expect(() => bus.subscribe(target, 'snapshot', 0)).toThrow(
      'Invalid channel rate'
    );
    expect(() => bus.subscribe(target, 'event', 10)).toThrow(
      'Event channels do not accept'
    );
  });

  it('clamps requested snapshot rates to the channel maximum', () => {
    const { bus, clock } = createBus();
    const target = createTarget();
    bus.subscribe(target, 'snapshot', 1_000);

    bus.publish('snapshot', 1);
    clock.advance(10);
    bus.publish('snapshot', 2);
    expect(target.send).toHaveBeenCalledTimes(1);

    clock.advance(7);
    expect(target.send).toHaveBeenCalledTimes(2);
    expect(target.send).toHaveBeenLastCalledWith(
      CHANNEL_DELIVERY,
      'snapshot',
      2
    );
  });

  describe('delivery schedule', () => {
    // Publishes arrive on a fixed cadence; every delivery is counted.
    const run = (rateHz: number, publishEveryMs: number, seconds: number) => {
      const { bus, clock } = createBus();
      const target = createTarget();
      bus.subscribe(target, 'snapshot', rateHz);
      const publishes = Math.round((seconds * 1000) / publishEveryMs);
      for (let i = 0; i < publishes; i++) {
        bus.publish('snapshot', i);
        clock.advance(publishEveryMs);
      }
      return { delivered: target.send.mock.calls.length, publishes, target };
    };

    it('delivers every publish that lands just before its slot', () => {
      // 16.2 ms spacing is shorter than the 16.67 ms slot of a 60 Hz
      // subscription. A catch-up timer used to fire after the next publish and
      // drop it, which halved the rate on Windows.
      const { delivered, publishes } = run(60, 16.2, 10);
      expect(delivered).toBeGreaterThanOrEqual(publishes * 0.97);
      expect(delivered).toBeLessThanOrEqual(publishes);
    });

    it('delivers a 60 Hz stream with jitter at the declared rate', () => {
      const { bus, clock } = createBus();
      const target = createTarget();
      bus.subscribe(target, 'snapshot', 60);
      // Frames 14 or 19 ms apart average 16.5 ms, as a paced loop produces.
      for (let i = 0; i < 600; i++) {
        bus.publish('snapshot', i);
        clock.advance(i % 2 === 0 ? 14 : 19);
      }
      expect(target.send.mock.calls.length).toBeGreaterThanOrEqual(570);
    });

    it('keeps the declared average when publishes do not divide the interval', () => {
      // 10 Hz subscription on a 25 Hz stream: slots fall between publishes.
      const { delivered } = run(10, 40, 20);
      expect(delivered).toBeGreaterThanOrEqual(198);
      expect(delivered).toBeLessThanOrEqual(202);
    });

    it('does not exceed the declared rate on a faster stream', () => {
      // 25 Hz subscription on a 60 Hz stream.
      const { delivered } = run(25, 1000 / 60, 20);
      expect(delivered).toBeGreaterThanOrEqual(495);
      expect(delivered).toBeLessThanOrEqual(505);
    });

    it('keeps deliveries apart after a late one', () => {
      // 25 Hz subscription (40 ms slots). The delivery for the slot at 40 ms
      // is late (75 ms); a publish at 76 ms must not follow it back to back.
      const { bus, clock } = createBus();
      const target = createTarget();
      bus.subscribe(target, 'snapshot', 25);
      const times: number[] = [];
      target.send.mockImplementation(() => times.push(clock.now));
      bus.publish('snapshot', 0);
      clock.advance(75);
      bus.publish('snapshot', 1);
      clock.advance(1);
      bus.publish('snapshot', 2);
      clock.advance(100);
      expect(times.length).toBeGreaterThanOrEqual(3);
      for (let i = 1; i < times.length; i++) {
        expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(30);
      }
    });

    it('delivers the newest snapshot once the slot arrives', () => {
      const { bus, clock } = createBus();
      const target = createTarget();
      bus.subscribe(target, 'snapshot', 10);
      bus.publish('snapshot', 1);
      clock.advance(20);
      bus.publish('snapshot', 2);
      clock.advance(20);
      bus.publish('snapshot', 3);
      expect(target.send).toHaveBeenCalledTimes(1);
      clock.advance(60);
      expect(target.send).toHaveBeenCalledTimes(2);
      expect(target.send).toHaveBeenLastCalledWith(
        CHANNEL_DELIVERY,
        'snapshot',
        3
      );
    });

    it('restarts the slot after a long gap', () => {
      const { bus, clock } = createBus();
      const target = createTarget();
      bus.subscribe(target, 'snapshot', 10);
      bus.publish('snapshot', 1);
      clock.advance(5_000);
      bus.publish('snapshot', 2);
      expect(target.send).toHaveBeenCalledTimes(2);
      // The slot after a gap is one interval ahead, not a backlog of slots.
      clock.advance(10);
      bus.publish('snapshot', 3);
      expect(target.send).toHaveBeenCalledTimes(2);
    });
  });

  it('reports the highest rate any visible subscriber wants', () => {
    const { bus } = createBus();
    expect(bus.maxActiveRateHz()).toBeUndefined();

    const slow = createTarget(1);
    const fast = createTarget(2);
    const events = createTarget(3);
    bus.subscribe(slow, 'snapshot', 25);
    bus.subscribe(events, 'event');
    expect(bus.maxActiveRateHz()).toBe(25);

    bus.subscribe(fast, 'snapshot', 60);
    expect(bus.maxActiveRateHz()).toBe(60);

    // A hidden window no longer counts — the SDK loop can drop back down.
    fast.visible = false;
    bus.rendererBecameHidden(2);
    expect(bus.maxActiveRateHz()).toBe(25);

    fast.visible = true;
    bus.rendererBecameVisible(2);
    expect(bus.maxActiveRateHz()).toBe(60);

    bus.unsubscribe(2, 'snapshot');
    bus.unsubscribe(1, 'snapshot');
    expect(bus.maxActiveRateHz()).toBeUndefined();
  });

  it('coalesces snapshot updates and trails with the latest value', () => {
    const { bus, clock } = createBus();
    const target = createTarget();
    bus.subscribe(target, 'snapshot', 10);

    bus.publish('snapshot', { value: 1 });
    clock.advance(20);
    bus.publish('snapshot', { value: 2 });
    clock.advance(20);
    bus.publish('snapshot', { value: 3 });

    expect(target.send).toHaveBeenCalledTimes(1);
    clock.advance(60);
    expect(target.send).toHaveBeenLastCalledWith(CHANNEL_DELIVERY, 'snapshot', {
      value: 3,
    });
    expect(target.send).toHaveBeenCalledTimes(2);
  });

  it('seeds snapshot subscribers but does not replay events', () => {
    const { bus } = createBus();
    bus.publish('snapshot', { value: 7 });
    bus.publish('event', { type: 'old' });
    const target = createTarget();

    bus.subscribe(target, 'snapshot');
    bus.subscribe(target, 'event');

    expect(target.send).toHaveBeenCalledOnce();
    expect(target.send).toHaveBeenCalledWith(CHANNEL_DELIVERY, 'snapshot', {
      value: 7,
    });
  });

  it('can discard a cached snapshot without affecting subscribers', () => {
    const { bus } = createBus();
    bus.publish('snapshot', { value: 7 });
    bus.clearSnapshot('snapshot');
    const target = createTarget();
    bus.subscribe(target, 'snapshot');

    expect(target.send).not.toHaveBeenCalled();
    expect(() => bus.clearSnapshot('event')).toThrow(
      'Cannot clear event channel'
    );
  });

  it('suppresses hidden renderers and removes destroyed renderers', () => {
    const { bus } = createBus();
    const target = createTarget();
    bus.subscribe(target, 'snapshot');

    target.visible = false;
    bus.publish('snapshot', { value: 1 });
    expect(target.send).not.toHaveBeenCalled();

    target.visible = true;
    target.destroyed = true;
    bus.publish('snapshot', { value: 2 });
    expect(bus.subscriberCount('snapshot')).toBe(0);
  });

  it('still delivers events to a hidden renderer', () => {
    const { bus } = createBus();
    const target = createTarget();
    bus.subscribe(target, 'event');

    // A hidden window cannot be re-seeded from a snapshot, so an event
    // dropped here is lost for good. This is the minimised-Gantry case: the
    // window stayed subscribed but missed every incident of a race.
    target.visible = false;
    bus.publish('event', { type: 'first' });
    bus.publish('event', { type: 'second' });

    expect(target.send).toHaveBeenCalledTimes(2);
    expect(target.send).toHaveBeenNthCalledWith(1, CHANNEL_DELIVERY, 'event', {
      type: 'first',
    });
    expect(target.send).toHaveBeenNthCalledWith(2, CHANNEL_DELIVERY, 'event', {
      type: 'second',
    });
    // Hidden or not, an event subscription is still real demand.
    expect(bus.subscriberCount('event')).toBe(1);
  });

  it('keeps delivering events across a hide and show cycle', () => {
    const { bus } = createBus();
    const target = createTarget();
    bus.subscribe(target, 'event');

    target.visible = false;
    bus.rendererBecameHidden(target.id);
    bus.publish('event', { type: 'whileHidden' });

    target.visible = true;
    bus.rendererBecameVisible(target.id);
    bus.publish('event', { type: 'whileVisible' });

    expect(target.send).toHaveBeenCalledTimes(2);
    expect(target.send).toHaveBeenNthCalledWith(1, CHANNEL_DELIVERY, 'event', {
      type: 'whileHidden',
    });
  });

  it('subscribes an already-hidden renderer to events as active', () => {
    const { bus } = createBus();
    const target = createTarget();

    // The Gantry window is created with `show: false`, so its first subscribe
    // can land before the window is ever shown.
    target.visible = false;
    bus.subscribe(target, 'event');
    bus.publish('event', { type: 'beforeFirstShow' });

    expect(target.send).toHaveBeenCalledOnce();
  });

  it('cancels pending delivery on unsubscribe and renderer removal', () => {
    const { bus, clock } = createBus();
    const first = createTarget(1);
    const second = createTarget(2);
    bus.subscribe(first, 'snapshot', 10);
    bus.subscribe(second, 'snapshot', 10);
    bus.publish('snapshot', 1);
    bus.publish('snapshot', 2);

    bus.unsubscribe(first.id, 'snapshot');
    bus.removeRenderer(second.id);
    clock.advance(100);

    expect(first.send).toHaveBeenCalledTimes(1);
    expect(second.send).toHaveBeenCalledTimes(1);
    expect(bus.subscriberCount('snapshot')).toBe(0);
  });

  it('tracks publication and delivery counts per renderer and channel', () => {
    const { bus } = createBus();
    const target = createTarget(9);
    bus.subscribe(target, 'event');
    bus.publish('event', { type: 'first' });
    bus.publish('event', { type: 'second' });

    expect(bus.metricsSnapshot()).toEqual({
      publications: { '9:event': 2 },
      deliveries: { '9:event': 2 },
      channelPublications: { event: 2 },
      channelDeliveries: { event: 2 },
    });
  });

  it('keeps processor demand and publication counts with delivery disabled', () => {
    const target = createTarget();
    const bus = new ChannelBus({ registry, deliveryEnabled: false });
    bus.subscribe(target, 'snapshot');
    bus.publish('snapshot', 1);

    expect(bus.subscriberCount('snapshot')).toBe(1);
    expect(target.send).not.toHaveBeenCalled();
    expect(bus.metricsSnapshot()).toMatchObject({
      channelPublications: { snapshot: 1 },
      channelDeliveries: {},
    });
  });

  it('does not seed a reactivated renderer when delivery is disabled', () => {
    const first = createTarget(1);
    const second = createTarget(2);
    const bus = new ChannelBus({ registry, deliveryEnabled: false });
    bus.subscribe(first, 'snapshot');
    bus.subscribe(second, 'snapshot');

    second.visible = false;
    bus.rendererBecameHidden(second.id);
    bus.publish('snapshot', { value: 1 });

    second.visible = true;
    bus.rendererBecameVisible(second.id);

    expect(bus.subscriberCount('snapshot')).toBe(2);
    expect(first.send).not.toHaveBeenCalled();
    expect(second.send).not.toHaveBeenCalled();
    expect(bus.metricsSnapshot()).toMatchObject({
      channelPublications: { snapshot: 1 },
      channelDeliveries: {},
    });
  });

  it('reschedules a pending snapshot when the requested rate changes', () => {
    const { bus, clock } = createBus();
    const target = createTarget();
    bus.subscribe(target, 'snapshot', 5);
    bus.publish('snapshot', 1);
    clock.advance(10);
    bus.publish('snapshot', 2);

    bus.subscribe(target, 'snapshot', 20);
    clock.advance(40);
    expect(target.send).toHaveBeenCalledTimes(2);
    expect(target.send).toHaveBeenLastCalledWith(
      CHANNEL_DELIVERY,
      'snapshot',
      2
    );
  });

  it('keeps hidden subscriptions registered without counting them as demand', () => {
    const { bus, clock } = createBus();
    const target = createTarget();
    const subscriberCounts: number[] = [];
    bus.onSubscriberCountChanged((channel, count) => {
      if (channel === 'snapshot') subscriberCounts.push(count);
    });
    bus.subscribe(target, 'snapshot', 10);
    bus.publish('snapshot', 1);
    bus.publish('snapshot', 2);

    target.visible = false;
    bus.rendererBecameHidden(target.id);
    clock.advance(100);
    bus.publish('snapshot', 3);

    expect(bus.registeredSubscriberCount('snapshot')).toBe(1);
    expect(bus.subscriberCount('snapshot')).toBe(0);
    expect(target.send).toHaveBeenCalledTimes(1);

    target.visible = true;
    bus.rendererBecameVisible(target.id);
    expect(bus.registeredSubscriberCount('snapshot')).toBe(1);
    expect(bus.subscriberCount('snapshot')).toBe(1);
    expect(target.send).toHaveBeenCalledTimes(1);

    bus.publish('snapshot', 4);
    expect(target.send).toHaveBeenCalledTimes(2);
    expect(target.send).toHaveBeenLastCalledWith(
      CHANNEL_DELIVERY,
      'snapshot',
      4
    );
    expect(subscriberCounts).toEqual([1, 0, 1]);
  });

  it('seeds a shown renderer from the live cache when other demand remains', () => {
    const { bus, clock } = createBus();
    const first = createTarget(1);
    const second = createTarget(2);
    bus.subscribe(first, 'snapshot', 10);
    bus.subscribe(second, 'snapshot', 10);
    bus.publish('snapshot', 1);

    second.visible = false;
    bus.rendererBecameHidden(second.id);
    clock.advance(100);
    bus.publish('snapshot', 2);

    second.visible = true;
    bus.rendererBecameVisible(second.id);

    expect(bus.subscriberCount('snapshot')).toBe(2);
    expect(second.send).toHaveBeenCalledTimes(2);
    expect(second.send).toHaveBeenLastCalledWith(
      CHANNEL_DELIVERY,
      'snapshot',
      2
    );
  });

  it('does not duplicate a fresh snapshot published during reactivation', () => {
    const { bus } = createBus();
    const target = createTarget();
    target.visible = false;
    bus.subscribe(target, 'snapshot', 10);
    bus.onSubscriberCountChanged((channel, count) => {
      if (channel === 'snapshot' && count > 0) {
        bus.publish('snapshot', 7);
      }
    });

    target.visible = true;
    bus.rendererBecameVisible(target.id);

    expect(target.send).toHaveBeenCalledOnce();
    expect(target.send).toHaveBeenCalledWith(CHANNEL_DELIVERY, 'snapshot', 7);
  });

  it('reports the registered count alongside the active count', () => {
    const { bus } = createBus();
    const target = createTarget();
    const counts: [number, number][] = [];
    bus.onSubscriberCountChanged((channel, activeCount, registeredCount) => {
      if (channel === 'snapshot') counts.push([activeCount, registeredCount]);
    });

    bus.subscribe(target, 'snapshot', 10);
    target.visible = false;
    bus.rendererBecameHidden(target.id);
    bus.unsubscribe(target.id, 'snapshot');

    expect(counts).toEqual([
      [1, 1],
      [0, 1],
      [0, 0],
    ]);
  });

  it('notifies when a hidden renderer subscribes', () => {
    const { bus } = createBus();
    const target = createTarget();
    const listener = vi.fn();
    bus.onSubscriberCountChanged(listener);

    // The Gantry is created with `show: false`, so its first subscribe can
    // land while hidden. Registered demand still changed.
    target.visible = false;
    bus.subscribe(target, 'snapshot', 10);

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith('snapshot', 0, 1);
    expect(bus.subscriberCount('snapshot')).toBe(0);
    expect(bus.registeredSubscriberCount('snapshot')).toBe(1);
  });

  it('notifies when an inactive subscription is removed', () => {
    const { bus } = createBus();
    const first = createTarget(1);
    const second = createTarget(2);
    first.visible = false;
    second.visible = false;
    bus.subscribe(first, 'snapshot', 10);
    bus.subscribe(second, 'snapshot', 10);
    const listener = vi.fn();
    bus.onSubscriberCountChanged(listener);

    bus.unsubscribe(first.id, 'snapshot');
    expect(listener).toHaveBeenLastCalledWith('snapshot', 0, 1);
    expect(bus.registeredSubscriberCount('snapshot')).toBe(1);

    bus.removeRenderer(second.id);
    expect(listener).toHaveBeenLastCalledWith('snapshot', 0, 0);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(bus.registeredSubscriberCount('snapshot')).toBe(0);
  });

  it('delivers the latest snapshot once to a window shown after hidden publishes', () => {
    const { bus, clock } = createBus();
    const target = createTarget();
    bus.subscribe(target, 'snapshot', 10);
    bus.publish('snapshot', 1);

    target.visible = false;
    bus.rendererBecameHidden(target.id);
    clock.advance(100);
    bus.publish('snapshot', 2);
    bus.publish('snapshot', 3);
    expect(target.send).toHaveBeenCalledTimes(1);

    // Stands in for a processor that kept running while the window was hidden
    // and republishes its current snapshot as soon as demand returns.
    bus.onSubscriberCountChanged((channel, activeCount) => {
      if (channel === 'snapshot' && activeCount > 0) bus.publish('snapshot', 3);
    });
    target.visible = true;
    bus.rendererBecameVisible(target.id);

    expect(target.send).toHaveBeenCalledTimes(2);
    expect(target.send).toHaveBeenLastCalledWith(
      CHANNEL_DELIVERY,
      'snapshot',
      3
    );
  });
});
