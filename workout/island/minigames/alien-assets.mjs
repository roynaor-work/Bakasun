/** The supplied ship noses point +X. Correct the alien battle presentation
 * relative to the existing bake specs, without altering shared asset metadata. */
export function alienModelSpecs(balance){
 const turn=spec=>({...spec,rotationY:(spec.rotationY+balance.render.facingCorrectionDegrees+360)%360});
 return {player:turn(balance.models.player),enemies:balance.models.enemies.map(turn)};
}
