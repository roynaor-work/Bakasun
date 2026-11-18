const LEGACY_WORLD = 'island.v1';
export const PROGRESSION_WORLD = 'island.cityProgress.v1';
const PROGRESSION_SOUND = 'island.cityProgress.sound';

export function cityProgressEnabled(search = '') {
  return new URLSearchParams(search).get('cityProgress') !== '0';
}

/** The progression save starts from a copy of the ordinary city. A rollback
 * can open and continue the original city, even after new building types exist. */
export function cityProgressStorage(storage) {
  if (!storage) return storage;
  const keyFor = key => {
    if (key === LEGACY_WORLD || key.startsWith(`${LEGACY_WORLD}.corrupt.`)) {
      return PROGRESSION_WORLD + key.slice(LEGACY_WORLD.length);
    }
    return key === 'island.sound' ? PROGRESSION_SOUND : key;
  };
  const ownKeys = () => Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter(key => key === PROGRESSION_SOUND || key === PROGRESSION_WORLD || key?.startsWith(`${PROGRESSION_WORLD}.corrupt.`));
  let canSeed = true;
  return {
    getItem(key) {
      const value = storage.getItem(keyFor(key));
      if (key !== LEGACY_WORLD || !canSeed) return value;
      canSeed = false;
      if (value !== null) return value;
      return storage.getItem(LEGACY_WORLD);
    },
    setItem(key, value) { storage.setItem(keyFor(key), value); },
    removeItem(key) { storage.removeItem(keyFor(key)); },
    get length() { return ownKeys().length; },
    key(index) {
      const key = ownKeys()[index];
      if (!key) return null;
      return key === PROGRESSION_SOUND ? 'island.sound' : LEGACY_WORLD + key.slice(PROGRESSION_WORLD.length);
    },
  };
}
