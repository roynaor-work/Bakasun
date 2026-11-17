// Small engine-independent state adapter for the fire-rooms-v1 naming contract.
// It changes only the direct variant roots; it preserves authored child transforms.
export function setBurnState(root, state, onlyId = null) {
  if (!['intact', 'burning', 'burnt'].includes(state)) throw new Error(`Unknown burn state: ${state}`);
  let count = 0;
  root.traverse(node => {
    if (!node.name.startsWith('burn_') || (onlyId && node.name !== `burn_${onlyId}`)) return;
    const id = node.name.slice(5);
    for (const child of node.children) {
      if (child.name === `intact_${id}`) {
        child.visible = state !== 'burnt';
        child.scale.setScalar(state === 'burnt' ? 0 : 1);
      }
      if (child.name === `burnt_${id}`) {
        child.visible = state === 'burnt';
        child.scale.setScalar(state === 'burnt' ? 1 : 0);
      }
    }
    node.userData.fireState = state;
    count++;
  });
  return count;
}

export function collectBurnables(root) {
  const result = [];
  root.traverse(node => {
    if (!node.name.startsWith('burn_')) return;
    const id = node.name.slice(5);
    const intact = node.children.find(n => n.name === `intact_${id}`);
    const burnt = node.children.find(n => n.name === `burnt_${id}`);
    const fire = node.children.find(n => n.name === `fire_${id}`);
    if (!intact || !burnt || !fire) throw new Error(`Incomplete burnable: ${id}`);
    result.push({ id, node, intact, burnt, fire });
  });
  return result;
}

export function spriteFrame(elapsed, fps = 12, frameCount = 8) {
  return Math.floor(Math.max(0, elapsed) * fps) % frameCount;
}
