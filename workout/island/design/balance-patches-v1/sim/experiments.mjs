// The targeted stage numbers match the adapters' stage IDs.
// Use the original holdout/sensitivity seed blocks where the audit supplies one.
export const experiments = [
  {id: 'fire', adapter: 'fire', flag: 'balanceFire', stages: [7, 8, 9, 10], seedStart: 1801},
  {id: 'fire-certificate', adapter: 'fire', flag: 'balanceFireCertificate', stages: [1, 2, 4, 11, 13], seedStart: 1801},
  {id: 'catch', adapter: 'criminal', flag: 'balanceCatch', stages: [1, 5, 10], seedStart: 1701},
  {id: 'soccer', adapter: 'soccer', flag: 'balanceSoccerGoals', stages: [1, 8, 13, 15], seedStart: 1701},
  {id: 'hoops', adapter: 'hoops', flag: 'balanceHoops', stages: [1, 5, 10], seedStart: 1001},
  {id: 'naval', adapter: 'naval', flag: 'balanceNaval', stages: [24], seedStart: 10001},
  {id: 'alien', adapter: 'aliens', flag: 'balanceAlien', stages: [10], seedStart: 10001},
  {id: 'alpine', adapter: 'alpine', flag: 'balanceAlpine', stages: [14, 19, 29, 33], seedStart: 3701},
  {id: 'alpine-gear', adapter: 'alpine', flag: 'balanceAlpine', stages: [19], seedStart: 3701, variant: {gearProgress: true}},
];
