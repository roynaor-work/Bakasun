# Final24 skin shading controls

Actual final24/native7c models were loaded through in-memory payload overrides into the frozen `86f55eca…aa128d0` viewer. This is a static diagnostic using the final model geometry and materials, not the final controller proof. The two capture reports identify every model SHA, camera, lighting and viewport. All four model hashes were unchanged at the end, all 12 captures had zero JavaScript errors and zero remote requests, and the browser was closed. No model, texture, viewer or source file was edited.

At 390×844 CSS pixels and DPR 1.5, the fair player04 and dark player02 both retain angular cheek/temple patches. Disabling Skin shadow reception makes a small local difference around sockets and the side of the face. Removing the Skin normal map removes fine grain but does not remove the broad patches. Replacing vertex normals with area-weighted normals welded across coincident rest positions also leaves the main patches. The normal replacement was real: face-region normal changes had medians 1.42°/1.58° and95th percentiles 12.67°/14.42° for04/02.

A second neutral-albedo control removes the skin color texture. A neutral diffuse-only control additionally removes normal/ORM/AO maps and environment response. Both retain the broad angular facial planes. The evidence therefore does not support a shadow toggle, weaker pore normal map or simple seam-normal weld as a sufficient fix. Underlying surface form and interpolation remain the actionable geometry concern; these controls do not identify one unique authoring stage as the cause.

|Control against baseline|Player04 mean RGB difference|Player02 mean RGB difference|
|---|---:|---:|
|No Skin received shadow|0.226|0.109|
|Skin normal scale zero|0.135|0.136|
|Welded smooth Skin normals|0.581|0.660|

Values are mean absolute channel differences on the fixed face rectangle x 30–349, y 260–679, on a 0–255 scale. They describe these captures only; they are not a quality metric.

My independent close-up face score remains **7–7.5/10** against the requested EA mobile reference. The new socket/cornea reads as a curved wet surface, but angular cheek/temple transitions, a taut almost closed mouth, coarse brows, bright sclera and the cap-like hair edge remain visible. There is no basis here for raising the face score to 8 by changing a material flag. A useful next geometry check is to compare a controlled denser, tangentially smoothed facial surface while preserving eye/lip/nose landmarks, then recheck both skin tones in the same camera. Any proposed correction needs the same actual-phone-frame capture before acceptance.
