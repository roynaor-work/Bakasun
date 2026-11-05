# Face camera correction

The previous face minimum used only15% of the unprojected Z depth. Its conservative head box crossed the landscape frame by up to3.78px in the three-quarter view. The correction adds the full half-depth projected toward the camera to the existing padded-height fit. Body/cloth framing and all motion code are unchanged.

I inspected the P03/P04 front comparisons in both phone orientations and checked all16 before/after records numerically. After correction, the entire projected head box keeps at least23.79px of crown/chin clearance in844×390. Front portrait margins are51.63–57.66px; the portrait three-quarter composition remains unchanged because its width fit already set the distance. The crown and chin remain visible, with the face still large enough to inspect eyes, lips and hair. This deliberately favors a small headroom margin over the previous nearly edge-to-edge front crop.

The comparison WebPs show before/after left-to-right for portrait and top-to-bottom for landscape. PNGs are the actual390×844/844×390 CSS frames rendered atDPR1.5. `camera-fit.json` binds all source/model/runtime hashes and conservative projected bounds.

This uses the selected31 camera fixture (P03 macro31, P04 crown29+wisps31), with no production model mutation. It is camera evidence, not final32 art acceptance or a mobile performance claim. Final selected assets still need the ordinary final package captures.
