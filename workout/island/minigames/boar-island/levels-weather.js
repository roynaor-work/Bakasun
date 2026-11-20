import * as THREE from './vendor/three.module.js';
import { WEATHER_OVERRIDES, WEATHER_LAYERS } from './levels.mjs';

// boars-levels-v1: two full-screen layers (light, then texture; 1688x780 with alpha) over the 3D scene, under the HUD.
function createWeatherLayers() {
  const doc = globalThis.document;
  const host = doc?.getElementById('game'), canvas = doc?.getElementById('scene');
  if (!host || !canvas) return { show() {} };
  const root = doc.createElement('div');
  root.id = 'boar-weather-layers';
  root.setAttribute('aria-hidden', 'true');
  root.style.cssText = 'position:absolute;inset:0;z-index:1;pointer-events:none;opacity:0;transition:opacity .9s';
  canvas.after(root);
  let shown = '';
  return {
    show(kind) {
      const files = WEATHER_LAYERS[kind] || [];
      if (kind === shown) return;
      shown = kind;
      root.style.opacity = '0';
      root.dataset.weather = files.length ? kind : '';
      root.replaceChildren(...files.map(file => {
        const img = doc.createElement('img');
        img.alt = '';
        img.decoding = 'async';
        img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover';
        img.onerror = () => img.remove();
        img.src = new URL('../../' + file, import.meta.url).href;
        return img;
      }));
      if (files.length) requestAnimationFrame(() => { root.style.opacity = '1'; });
    },
  };
}


export function createCampaignWeather(base, { scene, world }) {
  const { hemi, sun, sky, seaU, mountain } = world;
  const colors = {
    fog: [scene.fog.color, seaU.fogColor.value],
    hemiSky: [hemi.color],
    sunCol: [sun.color],
    top: [sky.top.value],
    mid: [sky.mid.value],
    hor: [sky.horizon.value],
    seaTop: [seaU.skyTop.value],
    seaHor: [seaU.skyHor.value],
    mtn: mountain ? [mountain.color] : [],
  };
  const profiles = Object.entries(WEATHER_OVERRIDES).map(([id, preset]) => ({
    id, preset, strength: 0,
    colors: Object.entries(colors).flatMap(([key, targets]) =>
      preset[key] === undefined ? [] : targets.map(target => [target, new THREE.Color(preset[key])])
    ),
  }));
  let kind = 'clear';
  const layers = createWeatherLayers();

  function applyProfile({ preset, strength, colors }) {
    if (strength < 0.001) return;
    for (const [target, color] of colors) target.lerp(color, strength);
    if (preset.dens !== undefined) {
      scene.fog.density = THREE.MathUtils.lerp(scene.fog.density, preset.dens, strength);
      seaU.uFog.value = scene.fog.density * 1.1;
    }
    if (preset.chop !== undefined) {
      seaU.uChop.value = THREE.MathUtils.lerp(seaU.uChop.value, preset.chop, strength);
    }
  }

  return {
    set(next, instant = false) {
      kind = next;
      const preset = WEATHER_OVERRIDES[next];
      base.set(preset?.base ?? next, instant);
      layers.show(next);
      for (const profile of profiles) {
        if (instant) profile.strength = Number(profile.id === kind);
        applyProfile(profile);
      }
    },
    update(dt) {
      base.update(dt);
      const mix = 1 - Math.exp(-dt / 0.9);
      for (const profile of profiles) {
        profile.strength = THREE.MathUtils.lerp(profile.strength, Number(profile.id === kind), mix);
        applyProfile(profile);
      }
    },
    strike: base.strike,
    get kind() { return kind; },
    get flash() { return base.flash; },
  };
}
