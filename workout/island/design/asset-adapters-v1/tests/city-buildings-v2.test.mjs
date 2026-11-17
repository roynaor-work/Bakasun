import { checkAdapter } from './adapter-contract.mjs';
checkAdapter('city-buildings-v2', () => import('../src/city-buildings-v2.mjs'));
