# Dribble flight detail

The authored dribble differs from run2 by up to73.96mm at the free sole. Its
10 upper-body style deltas alone do not retain this late-swing foot motion.
`createDribbleFootStyle` samples the two original clips' actual canonical FK
at241 phases, retaining the sole-position and world-foot-orientation difference.

Apply the detail to physical-planner flight targets before the existing bent-leg
reach clamp. Plants, inherited native swings and neutral settle steps receive
zero weight. The detail fades out below15mm of exact boot-hull clearance,
reaches full clearance weight at55mm, and is suppressed at speeds far from the
authored2.4m/s. It preserves the physical motor's phase, roots and anchor state.
The final controller must still scan the actual complete mesh after IK.

The isolated native15 fixture measured45.386mm additional forward toe motion
after physical reach constraints, with exactly zero planted-toe change. The
69 specified gait and21 dribble/alias matrices passed at30Hz and120Hz with the
50ms horizontal-transfer-end motor revision. These finite matrices do not
certify every ordered pair, the final combined recovery viewer or new assets.

The source declares planted-foot ball cues at Left phase.20/Right.70. Its
late-swing excursion peaks at Left.875/Right.375; that preparatory maximum is
not a declared contact. The current presentation ball meets the actual toe at
the declared.20/.70 cues with radius.11m. Do not silently relabel the excursion
maximum as a source contact. Both timing and visible movement remain available
to the independent final action review.

The helper has no Actor references or mutable controller state. One global
instance derived from the bound clips/rig/boot hull can serve every identity,
LOD and opposing squad. Expose `apply()`'s numeric native/applied deltas and
weights alongside base motor contributors for independent audit.
