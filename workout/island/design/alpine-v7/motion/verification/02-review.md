# Motion review 02 — corrections and final holdout checks

The later diagnostic captures use the actual character GLBs and ordinary
AnimationMixer playback. `render.json` in the later folders records the input
hash. The main iteration folders separately cover portrait/landscape and
near/far views of the complete production scene.

| First review issue | Correction | Observed result |
|---|---|---|
| Hollow shoulder caps in ordinary glide and turns. | Connected shoulder skin coverage, sleeve winding and coat smoothing were repaired by the character author. | The openings are closed in `02-ski/contact-sheet.webp`, `03-snowboard/contact-sheet.webp` and the final recovery still. |
| Ski rear grab required an excessive backward arch. | Pitch the ski tails during flight; bind the grip target to the actual ski, and target the glove palm. | Torso inclination falls from about61° to about22°. `02-ski/trick_tail_grab-side.webp` shows a more upright compact aerial pose. |
| Long snowboard could prop the body on a vertical tip during recovery. | Use its longitudinal X axis for the forward roll and recovery. | Body-only maximum clearance during the earlier rise check dropped from about0.41m to about0.027m; support transfers toward the boots. |
| Narrow parallel board stance looked stiff. | Widen binding goals to0.36m locally and add outward12° boot yaw. | Wider stance and distinct soft snowboard boots are visible in `03-snowboard/glide.webp`. Bindings remain attached to the feet. |
| Dense audit found a toe strike hidden by the still composition. | Preserve each boot's neutral Z position instead of centering the heel-biased lowest-sole centroid. | The failed check is retained in `05-before-contact-fix.json`: about−7.3mm in the three board LODs. The corrected source has positive toe/heel clearance and is checked again in `dense-boundaries.json`. |
| Helmet bore the initial recovery contact while hands hovered. | Add a continuous palm catch at the end of the roll and start of recovery, then fade it as the boots come underneath. | `04-palm-support/get_up-side.webp` at12% shows both palms supporting the rider and the helmet clearing the surface. It reads as a short athletic hand-plant after the tumble. |
| Diagnostic cameras cropped equipment at extreme poses. | Fit the camera to actual animated vertices, including poles. | Later captures keep the full equipment silhouette within the viewport. |

The board placement convention is now explicit: outer yaw+π/2, local−X travel,
right foot leading. Toe pressure and the board's small presentation arc map to
the same world direction as the turn. The visible grip label is “rear grab”;
the stable legacy identifier remains `trick_tail_grab`.

The final dense audit samples decoded GLBs at120Hz, every retained Float32
key time on both sides at±1e−7/±1e−6s, and event boundaries. It includes every
LOD, all dominant foot vertices, rigid poles and board, and the entire weighted
body during fall/recovery. A separate JSON playback check compares the
self-contained JSON alternatives to the embedded GLB clips.

These are authored game motions with deliberately readable timing, not motion
capture or a physical collision simulation. The numerical checks establish
attachment, clearance, interpolation continuity and the intended joint action;
they do not establish physical-phone frame rate.
