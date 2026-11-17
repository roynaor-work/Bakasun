import { checkAdapter } from './adapter-contract.mjs';
checkAdapter('city-citizens-v1', () => import('../src/city-citizens-v1.mjs'));
