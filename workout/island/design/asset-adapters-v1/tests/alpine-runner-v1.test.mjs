import { checkAdapter } from './adapter-contract.mjs';
checkAdapter('alpine-runner-v1', () => import('../src/alpine-runner-v1.mjs'));
