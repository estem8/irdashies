# Positive radio and lifecycle composition — 2026-11-12

F-2 has new integration evidence for reset/resume and positive radio snapshot
delivery, using the production lifecycle, default radio processor definition,
ProcessorHost, lifecycle channel connector and ChannelBus. It remains open for
an actual native simulator reconnect/session/radio sequence.

Fixture inventory found positive `RadioTransmitCarIdx` in two existing JSON
snapshots: `test-data/1783998516193/telemetry.json` contains `[2]`, and
`test-data/1733030013074/telemetry.json` contains `[19]`. These are individual
snapshots, not temporal recordings of a transmission or connection transition.
The earlier statement that the ordinary tape has no active radio input remains
true; it does not imply that every repository fixture lacks a positive sample.

Source inspection also establishes a separate constraint: the tape bridge
calls lifecycle enter with `replay: true`. RadioProcessor intentionally disables
transmission display in that mode. Adding a transmitter to a synthetic tape
would therefore not exercise live radio delivery; do not change replay policy
or label replay as live to obtain coverage.

`recordedRadioLifecycle.spec.ts` composes the production objects and feeds the
recorded `[2]` sample. Its transition order and SessionNum overrides are
explicitly synthetic. Captured deliveries are cloned at the transport boundary
so later processor mutation cannot rewrite past observations. The test verifies:

- Live enter delivers `[2]` to a subscribed renderer target.
- SessionNum 1→2 delivers a lifecycle change, reset `[]`, then positive `[2]`.
- Disconnect delivers reset `[]`; live reconnect resumes positive `[2]`.
- Hidden snapshot delivery stops while disconnect/enter lifecycle facts still
  arrive, in order.
- Replay enter remains suppressed after show and positive recorded input.
- Returning to live enter resumes `[2]` without changing subscriptions.

The test allows coalesced delivery under the real 25 Hz radio channel ceiling;
processor execution and immediate subscriber delivery are distinct. Initial
assertions assumed immediate snapshot delivery and were corrected to flush the
scheduled tail. No production behavior or cadence was changed.

All 50 tests in the new integration, RadioProcessor, lifecycle channel and
session lifecycle suites pass. TypeScript/ESLint and formatting accompany the
checkpoint. This is deterministic integration evidence, not an Electron/native
runtime capture, physical reconnect test, positive transmission duration test,
or a new performance result. The earlier seek/pause/native-hide experiments
were not repeated.

Remaining blocker: there is no available live iRacing source on this Linux
host, and the available snapshots/tape do not contain a recorded native
reconnect plus session transition with active radio. Continue F-2 when a live
source or suitable temporal fixture exists; retain this composition test as a
control. R3's verdict and the broader lifecycle acceptance remain unchanged.
