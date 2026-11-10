// Runs before the application graph finishes loading, so the splash timer starts at once.
import {startBootSplash} from './boot-splash.mjs?v=island-v2-20261107-8';
const clip=name=>new URL('../assets/boot/'+name,import.meta.url).href;
export const splash=startBootSplash({sources:[[clip('boot-montage.mp4'),'video/mp4']]});
