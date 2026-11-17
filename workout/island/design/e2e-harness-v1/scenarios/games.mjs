// Only public DOM selectors and read-only telemetry paths belong in adapters.
export const games = Object.freeze([
  {id: 'soccer', label: 'כדורגל', aliases: ['football'], action: '#shoot', secondary: '#pass', stick: '.soccer-stick-zone'},
  {id: 'streetSlam', label: 'כדורסל', aliases: ['basketball', 'hoops'], action: '#shoot', secondary: '#pass', stick: '.soccer-stick-zone'},
  {id: 'tennis', label: 'טניס', aliases: [], action: '#shoot', secondary: '#pass', stick: '.soccer-stick-zone'},
  {id: 'islandRacing', label: 'מרוצים', aliases: ['racing'], action: '[data-game-control=nitro]', stick: '.racing-steer'},
  {id: 'alpineRush', label: 'סקי', aliases: ['ski', 'alpine'], action: '[data-action=alpine-boost]', stick: '.alpine-joystick'},
  {id: 'alienDefense', label: 'חלליות', aliases: ['spaceships', 'alien'], action: '#shoot', secondary: '#pass', stick: '.soccer-stick-zone'},
  {id: 'navalDuel', label: 'ספינות', aliases: ['ships', 'naval'], action: '#shoot', stick: '.soccer-stick-zone'},
  {id: 'fireRescue', label: 'כיבוי אש', aliases: ['fire'], action: '#shoot', secondary: '#pass', stick: '.soccer-stick-zone'},
  {id: 'catchCriminal', label: 'פושע', aliases: ['criminal', 'thief', 'catch'], action: '.catch-fire', stick: '.catch-steer'},
  {id: 'boarDefense', label: 'חזירים', aliases: ['pigs', 'boar'], embedded: true}
]);

export function resolveGame(value) {
  const game = games.find(g => g.id === value || g.label === value || g.aliases.includes(value));
  if (!game) throw new Error(`Unknown game: ${value}. Choose ${games.map(g => g.id).join(', ')}`);
  return game;
}

export const phases = Object.freeze(['opening', 'play30', 'finish']);
