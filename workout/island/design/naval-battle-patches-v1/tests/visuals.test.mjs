import assert from 'node:assert/strict';
import test from 'node:test';
import {setImmediate as nextTurn} from 'node:timers/promises';
import * as THREE from '../../../vendor/three.module.js';
import {createNavalBattleVisuals} from '../../../minigames/naval-visual-effects.mjs';
import {SINKING_BUBBLES, WATER_COLUMN} from '../../../minigames/naval-visual-atlases.mjs';

const balance = {shipX: 0, sinkSeconds: 1, render: {worldScale: 1, enemySpacing: 1}, combat: {laneSpacing: 1}};

function fixture() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(3, 4, 2);
  const playerShip = {x: 0, z: 0, hp: 3};
  const fleet = [
    {x: 10, z: 0, hp: 0, sunkAt: 0, active: true},
    {x: 15, z: 0, hp: 3, active: true},
  ];
  const model = {time: .35, playerShip, enemies: fleet, blast: {life: 0}};
  return {scene, camera, model};
}

test('optional billboards follow actual sinks and near water misses', async () => {
  const {scene, camera, model} = fixture();
  const loader = {loadAsync: async () => new THREE.Texture()};
  const visuals = createNavalBattleVisuals(scene, model, balance, loader);
  await nextTurn();

  Object.assign(model.blast, {x: 13, z: 0, life: .4, at: .1, owner: 'player', hit: false});
  visuals.update(camera);
  assert.deepEqual(visuals.metrics(), {bubbles: 1, waterColumns: 1, bubblesReady: true, waterColumnReady: true});
  assert.ok(scene.children.every(mesh => mesh.userData.noReflect && mesh.material.depthWrite === false));

  model.time = .65;
  model.blast.life = 0;
  visuals.update(camera);
  assert.equal(visuals.metrics().waterColumns, 1);
  assert.equal(visuals.metrics().bubbles, 1);

  model.time = 1.4;
  visuals.update(camera);
  assert.equal(visuals.metrics().bubbles, 0);
  assert.equal(visuals.metrics().waterColumns, 0);

  for (const [at, x, hit, overDiver] of [[2, 13, true, false], [3, 28, false, false], [4, 13, false, true]]) {
    model.time = at + .2;
    Object.assign(model.blast, {x, life: .4, at, hit, overDiver});
    visuals.update(camera);
    assert.equal(visuals.metrics().waterColumns, 0);
  }
  visuals.dispose();
  visuals.dispose();
  assert.equal(scene.children.length, 0);
});

test('the two assets fail independently and late textures are disposed', async () => {
  const {scene, camera, model} = fixture();
  let finishBubbles;
  const loader = {
    loadAsync(source) {
      if (source === SINKING_BUBBLES.source) return new Promise(resolve => { finishBubbles = resolve; });
      assert.equal(source, WATER_COLUMN.source);
      return Promise.reject(new Error('unavailable atlas'));
    },
  };
  const visuals = createNavalBattleVisuals(scene, model, balance, loader);
  await nextTurn();
  visuals.update(camera);
  assert.deepEqual(visuals.metrics(), {bubbles: 0, waterColumns: 0, bubblesReady: false, waterColumnReady: false});

  visuals.dispose();
  const lateTexture = new THREE.Texture();
  let releases = 0;
  lateTexture.addEventListener('dispose', () => { releases++; });
  finishBubbles(lateTexture);
  await nextTurn();
  assert.equal(releases, 1);
  assert.equal(scene.children.length, 0);

  const partial = createNavalBattleVisuals(scene, model, balance, {
    loadAsync: async source => {
      if (source === WATER_COLUMN.source) throw new Error('unavailable atlas');
      return new THREE.Texture();
    },
  });
  await nextTurn();
  partial.update(camera);
  assert.deepEqual(partial.metrics(), {bubbles: 1, waterColumns: 0, bubblesReady: true, waterColumnReady: false});
  partial.dispose();
});
