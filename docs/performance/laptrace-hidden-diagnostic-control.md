# Lap Trace hidden-window diagnostic preparation

Prepared, runtime not yet verified:

```sh
node tools/perf/capture/lifecycle-probe.mjs laptrace-hidden-r1 hidden-laptrace
```

The ordinary ten-widget tape fixture has no saved reference lap, so the earlier
hidden-window probe did not exercise plot or brake-cue frames. This mode injects
a synthetic reference into the isolated renderer store after replay seek/pause
checks. It uses the initialized track ID, car path and track length. It does not
save the reference to disk and restores the original reference before exit.
Audio remains disabled in the fixture. Raw review media stays in perf-results.

The direct draw observer wraps the real named measure boundary. Both
lapTraceFrame and lapTraceBrakeCue must execute before hide, remain unchanged
through a 20-second native-hidden interval after settling, then advance after
show. A visible screenshot is captured before hide; no screenshot is requested
while hidden. Failure to exercise either path is not a successful hidden test.

This probes rendering/lifecycle with synthetic reference data. It does not
validate reference-lap accuracy, live simulator input, high-refresh display
behavior, or total CPU. Require successful controller shutdown, fixed-duration
marker, candidate restoration and absence of failure artifacts in addition to
the lifecycle result. Syntax and targeted ESLint pass; runtime remains pending.
