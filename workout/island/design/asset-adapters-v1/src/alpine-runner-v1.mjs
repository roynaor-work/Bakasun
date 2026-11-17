// Generated from the audited catalog.json. No asset I/O happens during import.
import { createAdapter } from './runtime.mjs';

export const metadata = Object.freeze({
  "id": "alpine-runner-v1",
  "game": "alpine",
  "flag": "?assetAlpineRunnerV1=1",
  "available": true,
  "source": {
    "branch": "codex/alpine-runner-v1",
    "commit": "e726ec0f811d5fdb200362c9a7a6ae6adc4582af",
    "root": "workout/island/design/alpine-runner-v1"
  },
  "license": {
    "spdx": "CC0-1.0",
    "note": "LICENSES.md: הקדשת נכסי החבילה CC0-1.0; רישיונות ספריות תצוגה אינם מועתקים משום שאינן נכללות.",
    "files": [
      "LICENSES.md"
    ]
  },
  "bytes": 1732339,
  "runtimeBytes": 1729731,
  "dependencies": [
    "המארח מספק GLTFLoader ו־AnimationMixer של Three.js; כל 26 ה־GLB מכילים נתונים פנימיים."
  ],
  "missing": [
    "חיבור מנוע שלושה נתיבים ואריחי 30 מ׳; גובה הקפיצה מובנה בצומת Root ואין להוסיף אותו שוב; חיבור lane-change נעשה בעולם."
  ],
  "assets": [
    {
      "name": "assets/characters/skier-coral.glb",
      "path": "assets/characters/skier-coral.glb",
      "type": "glb",
      "bytes": 338840,
      "sha256": "b05992706ddf2c79e7eb09408a8e42589f84f68831ca8dcc4961446ec80e00a2"
    },
    {
      "name": "assets/characters/skier-teal.glb",
      "path": "assets/characters/skier-teal.glb",
      "type": "glb",
      "bytes": 338840,
      "sha256": "b62e740c093ee07342578d4d092f4644a6ded57c702c39e3d58ab8a7b609deba"
    },
    {
      "name": "assets/characters/skier-violet.glb",
      "path": "assets/characters/skier-violet.glb",
      "type": "glb",
      "bytes": 338840,
      "sha256": "48a42707f27c0ebcb0305d58092826501b60eae20beece796212d72f82235404"
    },
    {
      "name": "assets/effects/ski-trail.json",
      "path": "assets/effects/ski-trail.json",
      "type": "json",
      "bytes": 1702,
      "sha256": "468ab370e20da23d44256672e1cfea24739e21db069fbcf2e533a836d764786b"
    },
    {
      "name": "assets/effects/snow-spray.json",
      "path": "assets/effects/snow-spray.json",
      "type": "json",
      "bytes": 2051,
      "sha256": "1e30d65c8c78c15e241b693c70ee1d01047d72833b0853b57765b974854ef170"
    },
    {
      "name": "assets/effects/turbo-streaks.json",
      "path": "assets/effects/turbo-streaks.json",
      "type": "json",
      "bytes": 2045,
      "sha256": "67dda6af58137166392203cf7c76c94581afed16849756e2e315dc6ee881f924"
    },
    {
      "name": "assets/icons/celebrate.svg",
      "path": "assets/icons/celebrate.svg",
      "type": "text",
      "bytes": 576,
      "sha256": "7aee103bf8b6edf213a4ce73f6ac61c5639be3c2a2b30c3b04ff1839d2ab30fa"
    },
    {
      "name": "assets/icons/coin.svg",
      "path": "assets/icons/coin.svg",
      "type": "text",
      "bytes": 366,
      "sha256": "7378e7be4ec7cb5c261cc6a9e41508efc43c0e0f0532267d8ffe08512074e15f"
    },
    {
      "name": "assets/icons/distance.svg",
      "path": "assets/icons/distance.svg",
      "type": "text",
      "bytes": 392,
      "sha256": "bdf69ce5f045355083d94d37d5e40ccc5cc4fc4facff2e95661c7c0454ebd255"
    },
    {
      "name": "assets/icons/double_coin.svg",
      "path": "assets/icons/double_coin.svg",
      "type": "text",
      "bytes": 498,
      "sha256": "3f79b6d58da1a306bd4b296ccc86d8feecb9fa68ee1a1feaea35012b7ef0e3dd"
    },
    {
      "name": "assets/icons/jump.svg",
      "path": "assets/icons/jump.svg",
      "type": "text",
      "bytes": 310,
      "sha256": "638da0fb3b76d220de2c7270962e9fbc81f3de8547d347c60ee25af059e51ca6"
    },
    {
      "name": "assets/icons/left.svg",
      "path": "assets/icons/left.svg",
      "type": "text",
      "bytes": 244,
      "sha256": "c9adfe34c274b75f1aaba353bea7bb03f74bbfad6641fb7a6fc157f78a5f5679"
    },
    {
      "name": "assets/icons/magnet.svg",
      "path": "assets/icons/magnet.svg",
      "type": "text",
      "bytes": 412,
      "sha256": "5f911eea0a8f6a089b1a87a5762165b410f64a51d4b34251bb78a2dfa516b556"
    },
    {
      "name": "assets/icons/pause.svg",
      "path": "assets/icons/pause.svg",
      "type": "text",
      "bytes": 320,
      "sha256": "c9e7d04cb634bfafaf42a6c6933b57624bbb0507fc470377503f25c455fcf13a"
    },
    {
      "name": "assets/icons/play.svg",
      "path": "assets/icons/play.svg",
      "type": "text",
      "bytes": 287,
      "sha256": "3bc23e00d5aa8df4cc157e0294167f33feb847565f1e339c9c7ad40f652e1eeb"
    },
    {
      "name": "assets/icons/restart.svg",
      "path": "assets/icons/restart.svg",
      "type": "text",
      "bytes": 373,
      "sha256": "530e408a318bf50360e464da999cf3f16dea9cf765e7fd71a4981f7677f05cdd"
    },
    {
      "name": "assets/icons/right.svg",
      "path": "assets/icons/right.svg",
      "type": "text",
      "bytes": 244,
      "sha256": "e2ee00d4331e0e794377a7ceb14c98ccbb5ae7d5b46b6c06c19ecef1c6f48e46"
    },
    {
      "name": "assets/icons/shield.svg",
      "path": "assets/icons/shield.svg",
      "type": "text",
      "bytes": 414,
      "sha256": "238c2b57bdbcfb500464fe028a5f3e9e26b0407c9335557c7372e25624bca29f"
    },
    {
      "name": "assets/icons/slide.svg",
      "path": "assets/icons/slide.svg",
      "type": "text",
      "bytes": 311,
      "sha256": "7ff66930d6bf6ba96299486f4909f130b33dc992ad4d128f7a4a1ffa19dc26f3"
    },
    {
      "name": "assets/icons/star.svg",
      "path": "assets/icons/star.svg",
      "type": "text",
      "bytes": 375,
      "sha256": "24e4cc0fcd4a00a5a4c0ee7821a56d0d0f9a6306dc5df2547393b8a7fee0dd48"
    },
    {
      "name": "assets/icons/turbo.svg",
      "path": "assets/icons/turbo.svg",
      "type": "text",
      "bytes": 333,
      "sha256": "34d920b35e3e5a8fff3162d394c6b58c0bda270bd589e2af1845e95c890183ab"
    },
    {
      "name": "assets/icons/wardrobe.svg",
      "path": "assets/icons/wardrobe.svg",
      "type": "text",
      "bytes": 393,
      "sha256": "9cf909979277d08634d74332670f10f1d725a08e72146f45a5c1741117232800"
    },
    {
      "name": "assets/props/cable_car.glb",
      "path": "assets/props/cable_car.glb",
      "type": "glb",
      "bytes": 10316,
      "sha256": "c2f4b36d5c9155f686c6d1ce7f947642ea5472403b9e00bc7b61ae67cd5b2b33"
    },
    {
      "name": "assets/props/coin.glb",
      "path": "assets/props/coin.glb",
      "type": "glb",
      "bytes": 7192,
      "sha256": "a3c7cf5c5296046e48d9be9aa0ad2ee2783c0caa677fbe087e02b1e9045a289c"
    },
    {
      "name": "assets/props/double_coin.glb",
      "path": "assets/props/double_coin.glb",
      "type": "glb",
      "bytes": 12616,
      "sha256": "bec12bd9f67fa22f0915a8848a0f916e458db02b757aa1b9dc6fdf25957bcdf4"
    },
    {
      "name": "assets/props/high_beam.glb",
      "path": "assets/props/high_beam.glb",
      "type": "glb",
      "bytes": 6924,
      "sha256": "ffef849278b6bc9bac800e8eef77bad17604c398047c7252bce176386a21593f"
    },
    {
      "name": "assets/props/ice_crevasse.glb",
      "path": "assets/props/ice_crevasse.glb",
      "type": "glb",
      "bytes": 4268,
      "sha256": "1e78be43f35e3f0056853cbbe14c372c4e68fca78d7d247342450e324896d38c"
    },
    {
      "name": "assets/props/low_fence.glb",
      "path": "assets/props/low_fence.glb",
      "type": "glb",
      "bytes": 7620,
      "sha256": "24f90a85c4c8e8d96ed594ac155413f11f9e56b53c28d40549ece73d263c7d34"
    },
    {
      "name": "assets/props/magnet.glb",
      "path": "assets/props/magnet.glb",
      "type": "glb",
      "bytes": 6316,
      "sha256": "1a0d94b61cd216e0fad48bb44a7854fcca45471e84dfba8cafb3718078586aa8"
    },
    {
      "name": "assets/props/penguin.glb",
      "path": "assets/props/penguin.glb",
      "type": "glb",
      "bytes": 39156,
      "sha256": "a61c18d9df2bdae185b500bdf5bc2faab2564f5b79bfa1394ad5cf28c6e11176"
    },
    {
      "name": "assets/props/rock.glb",
      "path": "assets/props/rock.glb",
      "type": "glb",
      "bytes": 5504,
      "sha256": "ebe08497291287fd16c3b36318ebcd8a59228c49fca3b532b40933610265a3be"
    },
    {
      "name": "assets/props/rolling_snowball.glb",
      "path": "assets/props/rolling_snowball.glb",
      "type": "glb",
      "bytes": 12800,
      "sha256": "830683e2047fa72ff5b916b4320578b68a2df5210bfcb0751bd9d7214d98d747"
    },
    {
      "name": "assets/props/shield.glb",
      "path": "assets/props/shield.glb",
      "type": "glb",
      "bytes": 5116,
      "sha256": "91eefcac51b1c90c8d02ec6584b048c912f677ce7a8085f5c5beb137a93a74bd"
    },
    {
      "name": "assets/props/snowman.glb",
      "path": "assets/props/snowman.glb",
      "type": "glb",
      "bytes": 33032,
      "sha256": "30a524ff596e9a8f56e41bf20a3410ebbb34948b794b4ad4f597d7efa60729b4"
    },
    {
      "name": "assets/props/star.glb",
      "path": "assets/props/star.glb",
      "type": "glb",
      "bytes": 3408,
      "sha256": "25f1e0d3d37dd403e509996d1b15e103be2d91ba1b00a42f7f1fe09be30e0370"
    },
    {
      "name": "assets/props/tree.glb",
      "path": "assets/props/tree.glb",
      "type": "glb",
      "bytes": 8680,
      "sha256": "53b8dcb077af6bd606e622ecd15a678621deb14797118e7bcfb693782e4e4a62"
    },
    {
      "name": "assets/props/turbo.glb",
      "path": "assets/props/turbo.glb",
      "type": "glb",
      "bytes": 3696,
      "sha256": "0f20446994732c144829edb55e254553b56ba9220efc71ac229fb06421f9e32c"
    },
    {
      "name": "assets/tiles/bridge.glb",
      "path": "assets/tiles/bridge.glb",
      "type": "glb",
      "bytes": 45792,
      "sha256": "e4598418c70ee8f2b3980d85a9212c7aa617c6b96e5d25666be94de98766af18"
    },
    {
      "name": "assets/tiles/forest.glb",
      "path": "assets/tiles/forest.glb",
      "type": "glb",
      "bytes": 72716,
      "sha256": "3fd1a704cc541526775dac7e994cf07df3fb541e6b38929f413a72c5ffb2bc74"
    },
    {
      "name": "assets/tiles/gentle_turn.glb",
      "path": "assets/tiles/gentle_turn.glb",
      "type": "glb",
      "bytes": 47484,
      "sha256": "32fee947f878574a5f67d119634677c75e0276c3a949de97a6d216ee371b4656"
    },
    {
      "name": "assets/tiles/ice_tunnel.glb",
      "path": "assets/tiles/ice_tunnel.glb",
      "type": "glb",
      "bytes": 53876,
      "sha256": "0f8cd271e7607b9f69341ddc6beb84b9caad6bfdfc29ddfa3d61ab52e18670e9"
    },
    {
      "name": "assets/tiles/slope.glb",
      "path": "assets/tiles/slope.glb",
      "type": "glb",
      "bytes": 49032,
      "sha256": "b0f4f2bbffe8eb0f0b5c50259999d43bdb5a974bd0c60e39f088ac7a54bae875"
    },
    {
      "name": "assets/tiles/straight.glb",
      "path": "assets/tiles/straight.glb",
      "type": "glb",
      "bytes": 47408,
      "sha256": "e81f848b094cd8c6185902d34638d5da7d271ad47e9067aef3f3152ce02cc72b"
    },
    {
      "name": "assets/tiles/summit.glb",
      "path": "assets/tiles/summit.glb",
      "type": "glb",
      "bytes": 34468,
      "sha256": "be432b3c9b856c38b75a69c5eea9e3d708721fc5ac672ed7daf1130b007f9f66"
    },
    {
      "name": "assets/tiles/village.glb",
      "path": "assets/tiles/village.glb",
      "type": "glb",
      "bytes": 66604,
      "sha256": "80c515be4d418995d698017e15e6da51e60fff1ebe372f2cc99c7214e9c1db6c"
    },
    {
      "name": "character-spec.json",
      "path": "character-spec.json",
      "type": "json",
      "bytes": 14688,
      "sha256": "772828c2736ddc44100146518fe226278a4a410e794cc8b660239338367c5d52"
    },
    {
      "name": "manifest.json",
      "path": "manifest.json",
      "type": "json",
      "bytes": 63369,
      "sha256": "6e08e782d7d230b02f14c33ed3794e5c39c90eaaeba101816ae7dabc37d8755a"
    },
    {
      "name": "world-spec.json",
      "path": "world-spec.json",
      "type": "json",
      "bytes": 39484,
      "sha256": "0692ae4943c095d6c1cc642aa859da0acaa9541015382c65fb735ad3f9111498"
    }
  ]
});

export function create(options = {}) {
  return createAdapter(metadata, {
    baseURL: new URL('../../../assets/alpine-runner-v1/', import.meta.url),
    ...options,
  });
}

const adapter = create();
export const { load, ready, get, dispose } = adapter;
export default adapter;
