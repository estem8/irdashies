# Tape input coverage investigation — incomplete

Source `6ccaf741`, offline diagnostic over all 36,000 frames of the unchanged
600-second AI-race tape (SHA retained in adjacent JSON). RadioTransmitCarIdx
was always -1: this tape does not exercise a transmitting driver.
CarIdxLastLapTime changed 88 times; CarIdxLapCompleted changed 187 times.
SessionNum stayed 0 and IsReplayPlaying stayed false.

Feeding the selected decoded raw values directly into the current real
LapTimesProcessor with `enter { replay: false }` produced version 90 and 146
history samples. RadioProcessor remained version 0. The decoder used the
repository tape layout in an ad hoc script, bypassing native playback, SDK
normalization, host lifecycle and demand, channel publication and rendering.
This is diagnostic evidence, not runtime acceptance or a validated tape parser.

Thus radio inactivity has an input-data explanation, while lap-time data exists
and the processor can aggregate it offline. Next inspect real runtime host
snapshots/subscriber demand before attributing absent publication to a defect.
In particular, processor execution can be required by a dependency without a
direct channel consumer; absent publication alone does not prove absent work.
Normal matrix acceptance remains inconclusive; no required input gate was
removed and no synthetic input was spliced into its measurements.
