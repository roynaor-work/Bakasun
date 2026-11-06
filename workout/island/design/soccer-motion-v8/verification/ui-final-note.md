# Final 07: horizontal cue rail diagnostic

The `390x844 / far` capture summary's one horizontally offscreen control is the final **RightFoot support cue at 3.015 s**, displayed as `תמיכה 3.02`, in `keeper_dive_high_right`. It is button index 7 inside the intentionally scrollable event rail. No preview, runtime or source files were changed for this diagnostic.

The capture tool's `visible` predicate checks nonzero element dimensions and CSS visibility; it does not account for clipping by a scrollable ancestor. Its `offscreenControls` predicate then checks the button's unscrolled bounding box against the whole viewport. The raw count is accurate, but includes content that can be brought into view by scrolling the cue rail.

| Measurement | Before focus | After keyboard focus |
| --- | ---: | ---: |
| Viewport width | 390 px | 390 px |
| Document width | 390 px | 390 px |
| Button horizontal bounds | −37.58…6.42 px | 93.42…137.42 px |
| Button size | 44×44 px | 44×44 px |
| Rail horizontal bounds | 84.77…373 px | 84.77…373 px |
| Rail content / client width | 420 / 288 px | 420 / 288 px |
| Rail `scrollLeft` in RTL layout | 0 px | −131 px |

The rail has computed `overflow-x:auto` and `touch-action:auto`. Focusing the offscreen button automatically scrolled that rail into view. Pressing Enter then successfully sought to **3.015 s** and left playback paused. This proves the control remains reachable through normal keyboard interaction; the rail's CSS also permits native horizontal panning.

The near/far summary rows inspect different active clips: the near row is recorded before its clip loop, while the far row is recorded after the near loop has finished on the final goalkeeper clip. The initial short-pass rail has fewer cues. The difference of 0 versus 1 therefore does not demonstrate a camera-dependent layout change.

Conclusion: intentional scroll content, with no page-level horizontal overflow or inaccessible control found. Keep the original capture metric unchanged; this note supplies the missing scroll-container context.
