import assert from 'node:assert/strict';

export function memoryScalarBytes(attribute) {
  if (attribute?.type !== 'scalar' || attribute.units !== 'bytes')
    return undefined;
  assert.equal(typeof attribute.value, 'string', 'Expected hexadecimal scalar');
  assert.match(attribute.value, /^(?:0x)?[0-9a-f]+$/i);
  const bytes = BigInt('0x' + attribute.value.replace(/^0x/i, ''));
  // Some provider counters contain unsigned sentinel/underflow values. Keep
  // them exact and visibly non-numeric rather than rounding or summing them.
  return bytes <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(bytes)
    : { exactBytes: bytes.toString() };
}

/** Merge provider events in a single named dump; never sum overlapping nodes. */
export function summarizeMemoryDump(trace) {
  assert.ok(Array.isArray(trace.traceEvents), 'Missing trace events');
  const events = trace.traceEvents.filter((e) => e.ph === 'v' && e.args?.dumps);
  assert.equal(
    new Set(events.map((e) => String(e.id))).size,
    1,
    'Expected one dump ID per named trace'
  );
  const processes = new Map();
  for (const event of events) {
    const process = processes.get(event.pid) ?? {
      pid: event.pid,
      allocators: {},
      processTotals: {},
    };
    processes.set(event.pid, process);
    Object.assign(process.processTotals, event.args.dumps.process_totals);
    for (const [name, node] of Object.entries(
      event.args.dumps.allocators ?? {}
    )) {
      const values = process.allocators[name] ?? {};
      for (const [key, attribute] of Object.entries(node.attrs ?? {})) {
        const bytes = memoryScalarBytes(attribute);
        if (bytes !== undefined) {
          if (Object.hasOwn(values, key))
            assert.deepEqual(
              values[key],
              bytes,
              `Conflicting memory counter ${name}/${key}`
            );
          values[key] = bytes;
        }
      }
      process.allocators[name] = values;
    }
  }
  assert.ok(
    [...processes.values()].some((p) => Object.keys(p.allocators).length > 0),
    'No allocator providers'
  );
  return [...processes.values()];
}
