import { describe, expect, it } from 'vitest';
import { channelRegistry, type ChannelName } from '@irdashies/types';
import { createProcessorDefinitions } from './app/processors/processorRegistry';
import {
  listWidgetRuntimeDefinitions,
  widgetChannelRate,
} from './frontend/widgetRuntime';

// Three layers state a rate for the same data: the processor (how often it
// computes), the channel (the most a window can be sent) and the widget (what
// it asks for). Nothing ties them together, so they drift: a widget can ask
// for more than its processor ever produces and silently get less. These
// specs make the drift visible. A known case stays listed, with the reason,
// until someone decides it; a new one fails here.

const processorRates = new Map<string, number | 'event'>(
  createProcessorDefinitions({
    referenceLapPersistence: { load: () => null, save: () => undefined },
  }).map((definition) => [
    definition.channel,
    definition.create({
      aggregateReplay: false,
      sourceReplay: false,
      snapshot: () => undefined,
    }).tickRateHz,
  ])
);

const asks = listWidgetRuntimeDefinitions().flatMap((definition) =>
  (definition.channels ?? []).flatMap((channel) => {
    const requested = widgetChannelRate(definition, channel);
    return requested === undefined
      ? []
      : [{ widget: definition.id, channel, requested }];
  })
);

const snapshotDefinition = (channel: ChannelName) => {
  const definition = channelRegistry[channel];
  return definition.kind === 'snapshot' ? definition : undefined;
};

describe('channel rate contract', () => {
  it('no widget asks for more than its processor produces', () => {
    const found = asks
      .filter(({ channel, requested }) => {
        const produced = processorRates.get(channel);
        const definition = snapshotDefinition(channel);
        return (
          definition !== undefined &&
          typeof produced === 'number' &&
          Math.min(requested, definition.maxRateHz) > produced
        );
      })
      .map(
        ({ widget, channel, requested }) => `${widget} ${channel} ${requested}`
      );

    expect(found).toEqual([
      // Battle takes the driverFocused preset (25 Hz) for relative gaps, but
      // RelativeGapProcessor ticks at 5 Hz, so it gets 5. Before the schedule
      // fix in #806 the processor ran every frame and Battle got about 21.
      'battle relative-gaps.snapshot 25',
    ]);
  });

  it('no widget asks for more than the channel can deliver', () => {
    const found = asks
      .filter(({ channel, requested }) => {
        const definition = snapshotDefinition(channel);
        return definition !== undefined && requested > definition.maxRateHz;
      })
      .map(
        ({ widget, channel, requested }) => `${widget} ${channel} ${requested}`
      );

    expect(found).toEqual([]);
  });

  it('no processor ticks faster than its channel can deliver', () => {
    const found = [...processorRates]
      .filter(([channel, rate]) => {
        const definition = snapshotDefinition(channel as ChannelName);
        return (
          definition !== undefined &&
          typeof rate === 'number' &&
          rate > definition.maxRateHz
        );
      })
      .map(([channel]) => channel);

    expect(found).toEqual([
      // Ticks at 25 Hz; the channel sends at most 10 Hz and defaults to 5.
      'session-bar.snapshot',
    ]);
  });
});
