/** Isolated atlas consumer. No imports from or mutations of production game code.
 * Pass the same THREE instance as your renderer. Positions are copied on spawn.
 */
export class WeaponEffects {
  constructor(THREE, manifest, atlasTexture) {
    this.THREE = THREE;
    this.manifest = manifest;
    this.texture = atlasTexture;
    this.active = [];
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.generateMipmaps = false;
    this.texture.minFilter = this.texture.magFilter = THREE.LinearFilter;
  }

  spawn(scene, name, position, options = {}) {
    const T = this.THREE, sequence = this.manifest.atlas.sequences[name];
    if (!sequence) throw new Error(`Unknown atlas sequence: ${name}`);
    const map = this.texture.clone();
    map.needsUpdate = true;
    const material = new T.SpriteMaterial({map, color: options.color ?? 0xffffff,
      transparent: true, depthWrite: false, opacity: options.opacity ?? 1,
      blending: sequence.blend === 'additive' ? T.AdditiveBlending : T.NormalBlending,
      toneMapped: false, rotation: options.rotation ?? 0});
    const sprite = new T.Sprite(material);
    sprite.center.set(...sequence.pivot);
    sprite.position.copy(position);
    const scale = options.scale ?? 1;
    sprite.scale.set(scale * (options.aspect ?? 1), scale, 1);
    scene.add(sprite);
    const item = {sprite, sequence, map, age: 0, duration: options.duration ?? sequence.durationSeconds,
      frame: options.frame ?? null, rise: options.rise ?? 0, grow: options.grow ?? 0,
      opacity: material.opacity, scale, aspect: options.aspect ?? 1, fade: options.fade ?? false};
    if (sequence.staticVariants && item.frame === null) item.frame = 0;
    this.active.push(item);
    this.setFrame(item, item.frame ?? 0);
    return sprite;
  }

  setFrame(item, index) {
    const {width, height} = this.manifest.atlas;
    const frame = item.sequence.frames[index];
    // Manifest rects have top-left image origin. Three uses bottom-left UV origin.
    item.map.repeat.set((frame.w - 1) / width, (frame.h - 1) / height);
    item.map.offset.set((frame.x + .5) / width, 1 - (frame.y + frame.h - .5) / height);
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const item = this.active[i];
      item.age += dt;
      if (item.age >= item.duration) { this.remove(i); continue; }
      const u = item.age / item.duration;
      const frame = item.frame ?? Math.min(item.sequence.frames.length - 1,
        Math.floor(u * item.sequence.frames.length));
      this.setFrame(item, frame);
      item.sprite.position.y += item.rise * dt;
      const scale = item.scale * (1 + item.grow * u);
      item.sprite.scale.set(scale * item.aspect, scale, 1);
      if (item.fade) item.sprite.material.opacity = item.opacity * (1-u);
    }
  }

  remove(index) {
    const [item] = this.active.splice(index, 1);
    item.sprite.removeFromParent();
    item.sprite.material.dispose();
    item.map.dispose();
  }

  clear() { while (this.active.length) this.remove(this.active.length-1); }
  dispose() { this.clear(); this.texture.dispose(); }
}

/** Gesture-controlled audio, Ogg preferred with an actual MP3 playback fallback.
 * Clips overlap naturally; switch/mute/dispose stops all active voices.
 */
export class WeaponAudio {
  constructor(manifest, baseURL = new URL('./', import.meta.url)) {
    this.manifest = manifest;
    this.baseURL = baseURL;
    this.enabled = false;
    this.voices = new Set();
    this.lastCodec = null;
    this.lastError = null;
    this.generation = 0;
  }

  async play(key, volume = .5, forceCodec = null) {
    if (!this.enabled) return false;
    const clip = this.manifest.audio[key];
    if (!clip) throw new Error(`Unknown audio clip: ${key}`);
    const generation = this.generation;
    const probe = new Audio();
    const preferred = forceCodec ?? (probe.canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'mp3');
    for (const codec of forceCodec ? [preferred] : [preferred, preferred === 'ogg' ? 'mp3' : 'ogg']) {
      if (!this.enabled || generation !== this.generation) return false;
      const voice = new Audio(new URL(clip.sources[codec], this.baseURL));
      voice.volume = Math.max(0, Math.min(1, volume));
      this.voices.add(voice);
      const done = () => this.voices.delete(voice);
      voice.addEventListener('ended', done, {once: true});
      try {
        await voice.play();
        if (generation !== this.generation) {voice.pause(); done(); return false;}
        this.lastCodec = codec;
        this.lastError = null;
        return true;
      } catch (error) {
        voice.pause();
        done();
        if (generation !== this.generation) return false;
        this.lastError = `${codec}: ${error.message}`;
      }
    }
    return false;
  }

  stop() {
    this.generation++;
    for (const voice of this.voices) { voice.pause(); voice.removeAttribute('src'); voice.load(); }
    this.voices.clear();
  }
}
