# Manufacturer promotion: scale and DPR check

The final `CarManufacturer` component was rendered in Storybook's
`AllManufacturers` story: 54 elements, widget-style parent transforms at
50%, 100%, 150% and 200%, crossed with emulated DPR 1, 1.5 and 2.
All 12 combinations completed. Bounding rectangles match exactly with and
without the removed promotion hint, and every sprite is inside the screenshot.

Candidate screenshots use the compiled current component. For the comparison,
the old `scale(1.25) translateZ(0)` is reconstructed on those same elements in
the browser; application source is never swapped. The script asserts the
compiled initial transform is `scale(1.25)`, waits for fonts/sheets, and captures
both states at each combination. This validates the static transform change,
not a separate rebuilt baseline or a Windows renderer.

The images are **not pixel-identical**. Depending on scale/DPR, 116–11,908 pixels
differ across the whole screenshots, with maximum channel difference 10–16 on
the 0–255 scale. Changed pixels are at most approximately 0.151% of the frame.
Visual inspection of the full 200%/DPR 2 pair found comparable logo shape and
readability. No exact-pixel or universal sharpness claim follows from this.
The story chooses one car per manufacturer; shared marques are not exhaustively
tested from both simulator sheets. This is also not coverage of animated row
motion, every intermediate scale step, every device DPR or Windows compositing.

Scalar [results](2026-11-12-manufacturer-visual.json) are retained in the repo.
Actual screenshots remain outside tracked files at
`perf-results/manufacturer-visual-r5/{before,after}-dpr<DPR>-scale<SCALE>.png`.

```bash
node tools/perf/capture/manufacturer-visual.mjs manufacturer-visual-r6
```

Use a fresh output directory and free ports 6006/9223. The capture tool launches
Storybook and a temporary Chromium profile, chooses the actual `about:blank`
page target (background extension pages may appear first), and closes its owned
process groups afterward. The same target-selection correction was applied to
the blind-spot visual helper; its earlier geometry results were not re-run here.

Validation: capture completed exit 0; ESLint passed for both capture helpers.
