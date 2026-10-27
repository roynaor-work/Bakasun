# Easy city access and navigation — 27 October 2026

Base: main `08f351c` after PR180. Release: `island-easy-city-20261027-1`.

## Player behavior

- A persistent bottom bar exposes Games, My ranking, Training and Learning with
  visible names and icons. Games and personal results receive visual emphasis.
  Existing game availability, learning prerequisites and saved results still
  control access. The ranking screen is explicitly local, per-game progress;
  it does not invent opponents or compare unrelated game scoring systems.
- Training links save the island before entering the existing daily workout,
  free exercise selector or exercise library. Soccer practice remains available.
- Map, tour and zoom controls remain beside the map. A miniature map shows actual
  roads, footprints, player location and camera extent; named destinations fly
  the camera to built facilities. Rotation is a deliberate More action, with a
  visible return to pan. Map keyboard controls are scoped to its focused canvas.
- A single drag pans instead of orbiting. Pinch and wheel retain anchored zoom.
  The camera starts at the inhabited core; the whole-island overview remains
  one action away in Map. Camera flights respect reduced motion and reuse the
  drawing buffer rather than resizing it on each animation frame.
- Tour mode begins by the city hall, follows the original child rig, uses the
  connected sidewalk graph and displays a ground route. The player can change
  destination, drag to leave follow mode, or stop. It never cuts through a
  building or jumps between disconnected roads. Game updates wait during a tour,
  pointer gesture or camera flight. Automatic emergencies also wait during map
  interaction and resume normally afterwards. GPU route/ground-marker resources
  are freed on leaving the tour.
- New cities use 102 roads instead of the prior 352 in the standard initial
  fixture, with the same 37 initial reservations. Short legal links replace the
  island-wide five-cell lattice. Unequal neighborhoods sit near the original
  center, while first-home water coverage, access and future growth stay valid.
- A later civilian airport has an actual 7×4 footprint, a long runway and offset
  terminal. It opens at expansion stage 1. The original 2×2 military airbase and
  previously earned construction retain their dimensions and positions.

## Save compatibility

Existing towns keep every building, road, reservation identity/coordinate,
currency, resource, level and game result. The compact plan applies to newly
prepared towns. Existing towns gain the new controls and inhabited-core camera,
and receive the later airport slot when eligible. There is no automatic reset,
relocation, deletion, new save version or cloud synchronization.

## Validation

- 124 focused tests pass, including 13 new cases covering compact planning,
  legacy grid preservation, airport unlock/footprint/geometry, walking graph
  routing, single-drag pan, focused keyboard input, gesture cancellation, tour
  resources, camera framing, real personal results and drawing-buffer reuse.
- Full run: 2,707 tests, 2,664 pass, 38 skip, 5 fail. The same five known Windows
  baseline failures remain: squat calibration, camera/exercise voice docs and
  original tennis/soccer lab hashes. No unrelated test is weakened. Old planner
  expectations were updated where the requested compact layout replaces sprawl;
  connections, coverage, immutability and save validation remain asserted.
  The final automatic-emergency interlock and UI refinements were followed by
  the focused 124-test run; the full-suite snapshot predates those extra cases.
- Browser: all four frequent actions opened their real flows. Free training
  reached `/workout/#/free`; learning reached the daily station selector.
  A house built through the production UI changed 25 available lots to 24 and
  survived reload. The unopened airport card explains its expansion requirement
  rather than reporting a reached limit or a missing plot.
  Ranking fits a 390×700 frame. Map destinations closed the panel and moved the
  camera. Single dragging moved the map in an 844×390 frame without opening a
  building. A tour selected a 26-point route, progressed to 17 remaining points,
  and moved the avatar/camera along the connected streets. Direct game console
  checks were clean. Responsive checks are not physical-phone/touch tests.
  The iframe wrapper logged MutationObserver errors, also seen in the prior
  review; they did not reproduce in a fresh direct game tab. Source unconfirmed.
- Screenshots use a synthetic local test city and the production app. No personal
  save or name is read. The later-airport capture uses earned stage 1 in that
  fixture. All original character, car, palm and building art is retained.

| View | Image |
| --- | --- |
| Main map and frequent actions | [desktop](desktop.jpg) |
| Map and destinations | [map](map-desktop.jpg) |
| Tour route | [tour](tour.jpg) |
| Later airport | [airport](airport.jpg) |
| Portrait map | [phone](phone.jpg) |
| Portrait map panel | [map panel](map-phone.jpg) |
| Portrait results | [results](scores-phone.jpg) |
| Landscape map | [landscape](landscape.jpg) |
| Building and reloading | [saved house](build-reloaded.jpg) |

Prepared for review; not yet merged or published. Next: review the four visible
actions and tour/map interaction, then test a physical phone before merging.
No Claude handoff is needed. This chat stays open for that review.
