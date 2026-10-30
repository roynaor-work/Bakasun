import { panel } from './dialogs.mjs';
import { EMPTY } from './values.mjs';
export function create(host, options = EMPTY) { return panel(host, options, true); }
