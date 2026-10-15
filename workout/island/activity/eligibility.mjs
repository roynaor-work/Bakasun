/** Declarative city requirements shared by scheduling and registered events. */
export function eventEligible(state,rule={}) {
  return state.world.stage>=(rule.minCityStage??0)
    &&(!rule.requiresBuilding||state.buildings.some(b=>b.typeId!=='road'))
    &&(!rule.buildingId||state.buildings.some(b=>b.typeId===rule.buildingId));
}
