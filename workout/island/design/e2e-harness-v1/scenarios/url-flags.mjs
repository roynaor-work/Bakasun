// These flags already exist in the application. The harness adds no app flags.
// Expectations inspect the resulting renderer, rather than just echoing the URL.
export const urlCases = Object.freeze([
  {id: 'soccer-v4', game: 'soccer', query: {soccerChars: 'v4'}, expectation: {path: 'metrics.assetStats.characterSet', equals: 'v4'}},
  {id: 'soccer-no-v6-goals', game: 'soccer', query: {soccerV6: '0'}, expectation: {path: 'metrics.designScene.goals', equals: 'v5'}},
  {id: 'hoops-v4', game: 'streetSlam', query: {athleteBody: '0', hoopsTall: '0', hoopsV7: '0'}, expectation: {path: 'metrics.characterVersion', equals: 4}},
  {id: 'hoops-v3', game: 'streetSlam', query: {athleteBody: '0', hoopsTall: '0', hoopsV7: '0', hoopsV4: '0', hoopsV5: '0', hoopsV8: '0'}, expectation: {path: 'metrics.characterVersion', equals: 1}},
  {id: 'ski-low', game: 'alpineRush', query: {quality: 'low'}, expectation: {path: 'quality', equals: 'low'}},
  {id: 'ski-env-off', game: 'alpineRush', query: {env: 'off'}, expectation: {path: 'metrics.environment', equals: null}},
  {id: 'tennis-v24-loading', game: 'tennis', query: {tennisLoad: 'v24'}, expectation: {path: 'metrics.load.mode', equals: 'v24'}},
  {id: 'racing-no-v7', game: 'islandRacing', query: {racingV7: '0'}, expectation: {path: 'metrics.v7.enabled', equals: false}},
  {id: 'alien-no-v7', game: 'alienDefense', query: {defenseV7: '0'}, expectation: {path: 'metrics.defenseV7', equals: false}},
  {id: 'naval-no-v7', game: 'navalDuel', query: {navalV7: '0'}, expectation: {path: 'metrics.v7.enabled', equals: false}},
  {id: 'fire-no-v7', game: 'fireRescue', query: {fireV7: '0'}, expectation: {path: 'metrics.fireV7.enabled', equals: false}},
  {id: 'catch-v5', game: 'catchCriminal', query: {catchV6: '0'}, expectation: {path: 'catchV6', equals: false}},
  {id: 'boar-v1', game: 'boarDefense', query: {boar: 'v1'}, expectation: {path: 'boarFlags.LEGACY', equals: true}}
]);

export function selectUrlCase(id) {
  const value = urlCases.find(c => c.id === id);
  if (!value) throw new Error(`Unknown URL case: ${id}`);
  return value;
}
