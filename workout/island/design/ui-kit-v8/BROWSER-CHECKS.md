# Browser verification

2026-11-06T11:21:42.220Z · Chromium 151.0.7922.173

- PASS: 390×844: DOM=model; physical sides; 2 directions × 4 safe areas; no overlaps
- PASS: 390×844: modal focus trap, Escape and input restoration
- PASS: 390×844: maximum safe score, 24-hour clock and two-word action fit
- PASS: 844×390: DOM=model; physical sides; 2 directions × 4 safe areas; no overlaps
- PASS: 844×390: modal focus trap, Escape and input restoration
- PASS: 844×390: maximum safe score, 24-hour clock and two-word action fit
- PASS: 360×640: DOM=model; physical sides; 2 directions × 4 safe areas; no overlaps
- PASS: 360×640: modal focus trap, Escape and input restoration
- PASS: 360×640: maximum safe score, 24-hour clock and two-word action fit
- PASS: 412×915: DOM=model; physical sides; 2 directions × 4 safe areas; no overlaps
- PASS: 412×915: modal focus trap, Escape and input restoration
- PASS: 412×915: maximum safe score, 24-hour clock and two-word action fit
- PASS: 1024×768: DOM=model; physical sides; 2 directions × 4 safe areas; no overlaps
- PASS: 1024×768: modal focus trap, Escape and input restoration
- PASS: 1024×768: maximum safe score, 24-hour clock and two-word action fit
- PASS: rapid dialog replacement keeps input suspended until the active modal closes
- PASS: destroying an open dialog restores input synchronously
- PASS: trusted second-finger pause tap stops an already active joystick
- PASS: long unbroken toast text wraps inside asymmetric safe areas in five sizes and never takes touch input
- PASS: short showcase container removes decorative location copy before it crowds the play marker
- PASS: floating base at four corners and four edge centres: actual rim contained, knob remains left, with and without a side notch
- PASS: mouse drag leaves zone, pointer capture follows, release returns neutral
- PASS: keyboard diagonal is normalized; Space emits exactly one action
- PASS: trusted simultaneous joystick + action: independent fingers, no duplicate click
- PASS: pointercancel never commits a held action
- PASS: release outside target cancels the action
- PASS: disabling a held button immediately cancels it
- PASS: changing action identity cancels the old hold; the next touch uses the new identity
- PASS: resize: movement zeroed, held action cancelled, no accidental release
- PASS: suspend: movement zeroed, held action cancelled, no accidental release
- PASS: blur: movement zeroed, held action cancelled, no accidental release
- PASS: hidden: movement zeroed, held action cancelled, no accidental release
- PASS: destroy removes input listeners; a detached adapter cannot emit
- PASS: reduced motion disables control transitions
- PASS: CSS/SVG-only fallback: five sizes, physical left/right, no overlapping targets
- PASS: published INTEGRATION HTML + JS assembled directly: all five sizes, controls and three dialogs work
- PASS: no JavaScript errors or external resource requests

Trusted CDP touches; actual mouse and keyboard. Blur and visibility state changes exercise the cancellation handlers via DOM events. Safe-area values are emulated CSS insets, not a physical notch.
