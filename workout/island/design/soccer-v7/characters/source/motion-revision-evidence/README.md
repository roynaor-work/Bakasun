# Authored source correction evidence

`revision.json` binds the published 31-clip / 1,209-frame source revision to its preceding e60a hash. Nine clips changed; the other 22 clips and canonical skeleton remain identical. `e60a-motion-build.py` is an archived historical source listing, not the active build entry point. Use `../motion-build.py` to regenerate the current library.

The source corrections retain actual strike/parry windows, the fall terminal/get-up entry match, and the supported seated slide finish. They fix entry/return flat-boot dragging, introduce weight-bearing release and airborne leg transfer, and remove the late goalkeeper arm solver's unnecessary axial twist.

The canonical prescan uses actual decoded rigid boot vertices from native15 and checks fixed vertex identities at 30/120/240 Hz. Its flat-skate flags require at least seven near-floor witnesses in both frames, more than 3 mm horizontal movement, and less than 1° rigid-foot orientation change. A flag is a diagnostic requiring actual viewer confirmation. A lack of flags does not prove floor clearance or natural motion.

`cold31-canonical-120hz.json` covers all 31 clips after composition. The remaining files bind each isolated correction to its own staged input and explain preserved channels, strike windows, wrist geometry and floor effects. Their staged hashes intentionally differ from the final composed hash. The root agent independently rendered the composed motion with the actual native15 model and no precomputed floor envelope; that phone and fixed-vertex confirmation is in `../../iterations/21/motion-preflight/`.

Canonical interpolation of running feet still requires contact IK, the exact boot hull and whole-mesh floor correction in the viewer. Native glTF animation alone does not implement those systems. Final native GLB embedding, floor envelopes and displayed transition audits must use the final motion/model hashes together; historical reports must not be presented as that final verification.
