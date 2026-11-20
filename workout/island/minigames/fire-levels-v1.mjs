import {polishValue} from './polish-flag.mjs';

export function fireLevelsEnabled(search) {
  return polishValue('fireLevels',search)!=='0';
}
