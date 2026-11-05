# Circular motor coordinates

`createLocomotionCurve({origin:[x,y,z],yaw,radius:8})` in
`locomotion-curve.js` embeds the motor's unwrapped +Z arc distance in an exact
circle. It has no Three dependency and never retains an Actor or rig.

- `mapPoint([x,y,z])` and `inversePoint(world,nearDistance)` map points. The
  inverse unwraps to the nearest supplied arc distance; x must be below radius.
- `rootPoint(distance)` and `headingAt(distance)` describe the moving root.
- `mapOrientation(quaternion,z)` and `inverseOrientation(quaternion,z)` use
  the local tangent at that foot's own arc position, keeping plants fixed.
- `geometryFromWorldHips({distance,measuredAt,hips})` captures each actual
  UpLeg world position in the current root's rigid tangent frame. Pass the
  result directly to `motor.step(dt,geometry)` each physics frame.

The optional geometry callback maps a fixed anchor, current and predicted
roots, and the captured hip offset into world space. The motor uses the exact
Euclidean current/predicted reaches and the current tangent's rearward test.
The speed/phase/cadence, .02s anticipation, reach thresholds and physical toeoff
predicate remain the same as the straight motor. Numeric prediction inputs are
retained in `heelRecord.release.reachPrediction.worldPrediction` so an auditor
can reconstruct the result without trusting the reported distances.

Motor exports and clones preserve numeric state, Infinity, and live intra-state
heel-record aliases, while omitting transient geometry callbacks. Rebind a
fresh geometry sample before any nonzero cloned-foot step. Numeric
`predict`/`predictPose` never step feet and remain safe without rebinding.

Run `node source/locomotion-curve-check.mjs` from the character folder. The
proof checks an independent circle-centre construction, point inversion,
finite-difference tangent, opposite-squad headings, quaternion inversion,
world-fixed anchors, and current/future world hip reaches. Its scope is the
coordinate contract; final actual bundled geometry requires a browser audit.
`locomotion-state-check.mjs` also verifies callback exclusion and state aliases.
