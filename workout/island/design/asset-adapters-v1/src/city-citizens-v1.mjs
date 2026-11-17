// Generated from the audited catalog.json. No asset I/O happens during import.
import { createAdapter } from './runtime.mjs';

export const metadata = Object.freeze({
  "id": "city-citizens-v1",
  "game": "city",
  "flag": "?assetCityCitizensV1=1",
  "available": true,
  "source": {
    "branch": "codex/city-citizens-v1",
    "commit": "9eca44477b005772cbd1379831a069c68a17b9a5",
    "root": "workout/island/design/city-citizens-v1"
  },
  "license": {
    "spdx": "CC0-1.0",
    "note": "LICENSES.md explicitly CC0 for original people/motions and animal derivatives; skeleton.json preserves the existing canonical18 interoperability contract.",
    "files": [
      "LICENSES.md"
    ]
  },
  "bytes": 5168586,
  "runtimeBytes": 5165113,
  "dependencies": [
    "Host local Three.js/GLTFLoader/SkeletonUtils for skinned clones, embedded clips and canonical18 skeleton; no animal source files are required."
  ],
  "missing": [],
  "assets": [
    {
      "name": "animals/bird.glb",
      "path": "animals/bird.glb",
      "type": "glb",
      "bytes": 21880,
      "sha256": "7172baf1ded435cd34487c8fe47188ad9ea08662f265c1d3df7f2109b9292eb6"
    },
    {
      "name": "animals/butterfly.glb",
      "path": "animals/butterfly.glb",
      "type": "glb",
      "bytes": 13584,
      "sha256": "f374920fa38151573eb26ea62420cd63a5ecf6e120a5cd2c5c93c22141c30fd4"
    },
    {
      "name": "animals/cat.glb",
      "path": "animals/cat.glb",
      "type": "glb",
      "bytes": 44200,
      "sha256": "f73143950ee2c41d7f50ff2a9b2b51af7b515302aa31db1e6e0454e3d49350d0"
    },
    {
      "name": "animals/dog.glb",
      "path": "animals/dog.glb",
      "type": "glb",
      "bytes": 43080,
      "sha256": "f4d086acbfd79ea634ac65849bddaa64f53c0d73554db95d0200067df1344850"
    },
    {
      "name": "animals/fish.glb",
      "path": "animals/fish.glb",
      "type": "glb",
      "bytes": 16412,
      "sha256": "948c3651a34d90725d2d3bfb5f9cd3e0286066170eb97854016d9fc9b1e080e9"
    },
    {
      "name": "animals/pigeon.glb",
      "path": "animals/pigeon.glb",
      "type": "glb",
      "bytes": 27612,
      "sha256": "11a550fed9079f850df115b72589e36c7f1dc6343b9d0adc9bed71df7b9dba8e"
    },
    {
      "name": "manifest.json",
      "path": "manifest.json",
      "type": "json",
      "bytes": 116269,
      "sha256": "5eef2a8519d2829e536ee304be084a176b136f5cf7751ccbce18077582da9b38"
    },
    {
      "name": "people/adult-man-a.glb",
      "path": "people/adult-man-a.glb",
      "type": "glb",
      "bytes": 132420,
      "sha256": "eb02cafe070c58463b9c140782d348bf460a6fb6550a5f0762c076be977c798f"
    },
    {
      "name": "people/adult-man-b.glb",
      "path": "people/adult-man-b.glb",
      "type": "glb",
      "bytes": 132420,
      "sha256": "30fb5859c2dc1d12e4d66c7964cc39682b627b621f4cd36314403dd61e041dfc"
    },
    {
      "name": "people/adult-man-c.glb",
      "path": "people/adult-man-c.glb",
      "type": "glb",
      "bytes": 132420,
      "sha256": "ee60e632eea89bd881d248717639d86723ddb8d6173a4a404c1bd9ba4ba39acd"
    },
    {
      "name": "people/adult-woman-a.glb",
      "path": "people/adult-woman-a.glb",
      "type": "glb",
      "bytes": 134204,
      "sha256": "33d07ebaca4dbf47de9be133f56c2921422f8aa434cfc6d5e8fad68668e73acf"
    },
    {
      "name": "people/adult-woman-b.glb",
      "path": "people/adult-woman-b.glb",
      "type": "glb",
      "bytes": 134204,
      "sha256": "427c04dbb90f53501c57b0644b6f21464771c1d928516a2c85592265ef76c510"
    },
    {
      "name": "people/adult-woman-c.glb",
      "path": "people/adult-woman-c.glb",
      "type": "glb",
      "bytes": 134204,
      "sha256": "87164015d143aa000610b8a7ec72494c20c54f4798d63fe9b063014cbb00a7df"
    },
    {
      "name": "people/boy-a.glb",
      "path": "people/boy-a.glb",
      "type": "glb",
      "bytes": 132400,
      "sha256": "adbf96b064d40a4fdf2c3e2000ad65799353f458ae40f417c975e0e0bf97a6f4"
    },
    {
      "name": "people/boy-b.glb",
      "path": "people/boy-b.glb",
      "type": "glb",
      "bytes": 132400,
      "sha256": "473dc1261895cb02c7cfe3204a390d98f27e453b160ad51431f85dc7bffcd94d"
    },
    {
      "name": "people/boy-c.glb",
      "path": "people/boy-c.glb",
      "type": "glb",
      "bytes": 132400,
      "sha256": "e784c3bfb18c3dc5714c5496efd783fad8dc67e2513f542f5b4c59b88a5a9837"
    },
    {
      "name": "people/cleaner-a.glb",
      "path": "people/cleaner-a.glb",
      "type": "glb",
      "bytes": 137820,
      "sha256": "c6b8ac5039c392ce4385023e2c55ef1e86bfc0cf57974b00f88e804f430e07d6"
    },
    {
      "name": "people/cleaner-b.glb",
      "path": "people/cleaner-b.glb",
      "type": "glb",
      "bytes": 137820,
      "sha256": "3c97be0565f8dace43cdf12d345755ac2794b52cef21b59e8a2ad9f3aa3fe7e4"
    },
    {
      "name": "people/cleaner-c.glb",
      "path": "people/cleaner-c.glb",
      "type": "glb",
      "bytes": 137820,
      "sha256": "5f48bc8a7b24544dca236a8d45f7472aad5f756238910008f01f5f1eff29739b"
    },
    {
      "name": "people/courier-a.glb",
      "path": "people/courier-a.glb",
      "type": "glb",
      "bytes": 136052,
      "sha256": "78e6755d50569c61071f1475271cdbc4c35c8256956a3d2315977431d7358b67"
    },
    {
      "name": "people/courier-b.glb",
      "path": "people/courier-b.glb",
      "type": "glb",
      "bytes": 136052,
      "sha256": "15b20eebdbb7fa643c01c9d860b91bdff292faab703e9551fbab95d15c216eae"
    },
    {
      "name": "people/courier-c.glb",
      "path": "people/courier-c.glb",
      "type": "glb",
      "bytes": 136052,
      "sha256": "736fba9b52d66f2107a106981758063daf796bc72d16f92a709217a392a2ad19"
    },
    {
      "name": "people/elder-man-a.glb",
      "path": "people/elder-man-a.glb",
      "type": "glb",
      "bytes": 135332,
      "sha256": "8c7d441bf7da00b629293f8f4094359e977a80224a95a6e467c5c7de68f2a379"
    },
    {
      "name": "people/elder-man-b.glb",
      "path": "people/elder-man-b.glb",
      "type": "glb",
      "bytes": 135332,
      "sha256": "a1bbec7eeb443aa949d105b5284a18c5d14b7b2a1de1b63cd5567b975f356baa"
    },
    {
      "name": "people/elder-man-c.glb",
      "path": "people/elder-man-c.glb",
      "type": "glb",
      "bytes": 135332,
      "sha256": "20b4440d67809d2ab1f760abb64d8504cae4fa66592ab57e6c39c13cfabfd66c"
    },
    {
      "name": "people/elder-woman-a.glb",
      "path": "people/elder-woman-a.glb",
      "type": "glb",
      "bytes": 136404,
      "sha256": "ba50b8af4ab7dcdd00bdcf79b4af9c3c025796953cc76a5fccc2af6d34dae720"
    },
    {
      "name": "people/elder-woman-b.glb",
      "path": "people/elder-woman-b.glb",
      "type": "glb",
      "bytes": 136404,
      "sha256": "922d26fffb815a5fc74b5692b976590f6d7d9b3214708c72f74730ce8e63864d"
    },
    {
      "name": "people/elder-woman-c.glb",
      "path": "people/elder-woman-c.glb",
      "type": "glb",
      "bytes": 136404,
      "sha256": "8d82aa5ecc93156fed64c7f35eca32f1ab6f398fd009fad22bf1a0f8335c2dec"
    },
    {
      "name": "people/firefighter-a.glb",
      "path": "people/firefighter-a.glb",
      "type": "glb",
      "bytes": 135960,
      "sha256": "56a9c852979ee1eb48a2678fabf08900c9db78450de592e0b8337335e15d960c"
    },
    {
      "name": "people/firefighter-b.glb",
      "path": "people/firefighter-b.glb",
      "type": "glb",
      "bytes": 135960,
      "sha256": "b50cd3fbc84a55a160855a95b954b1abc89e3438cf68b83ea33e53d94a82285b"
    },
    {
      "name": "people/firefighter-c.glb",
      "path": "people/firefighter-c.glb",
      "type": "glb",
      "bytes": 135960,
      "sha256": "4a2b3c081a04dead7b738b9847a0a6e8cccde8d40e2e0d5d7c3598c84f86c7e8"
    },
    {
      "name": "people/gardener-a.glb",
      "path": "people/gardener-a.glb",
      "type": "glb",
      "bytes": 135900,
      "sha256": "fffe50245782e8f522eb2d3c2368f826cab2c60507920c1a0995f53937a3bdd3"
    },
    {
      "name": "people/gardener-b.glb",
      "path": "people/gardener-b.glb",
      "type": "glb",
      "bytes": 135900,
      "sha256": "dbd4385b86cf621a421d6fb64d3ed6b62e8a31df6de490a80767bc39ad43553d"
    },
    {
      "name": "people/gardener-c.glb",
      "path": "people/gardener-c.glb",
      "type": "glb",
      "bytes": 135900,
      "sha256": "97bf0d2ad272f86c40b77623b529ccfda1f1c7aa24a50b2c778b388f0483c689"
    },
    {
      "name": "people/girl-a.glb",
      "path": "people/girl-a.glb",
      "type": "glb",
      "bytes": 134280,
      "sha256": "4f5d47636cc1ab8a4db80e97b5283ffbec3c00867201cc6fe6ef9208cf94e83f"
    },
    {
      "name": "people/girl-b.glb",
      "path": "people/girl-b.glb",
      "type": "glb",
      "bytes": 134280,
      "sha256": "c58a89c05302b8bc0f58f488c995a69f7c0b3f74467f70116e3e748c99b2bab8"
    },
    {
      "name": "people/girl-c.glb",
      "path": "people/girl-c.glb",
      "type": "glb",
      "bytes": 134280,
      "sha256": "36e0d263312c61d87f80893d5f319667a00a4f5c89983b63ada92709d6db1da7"
    },
    {
      "name": "people/maintenance-a.glb",
      "path": "people/maintenance-a.glb",
      "type": "glb",
      "bytes": 137784,
      "sha256": "2419d0bc573714b284dd4f5b086ebabda13dc4a6cd827e2a6081c2e999707f3f"
    },
    {
      "name": "people/maintenance-b.glb",
      "path": "people/maintenance-b.glb",
      "type": "glb",
      "bytes": 137784,
      "sha256": "8753fff1e0b78d1f29a0f88de15677b70e01f4660f1c7c9c417cc5da2904d7ce"
    },
    {
      "name": "people/maintenance-c.glb",
      "path": "people/maintenance-c.glb",
      "type": "glb",
      "bytes": 137784,
      "sha256": "7c8a25ad0d6a98611db66aa602b28fa10c22564472110d983aa2a94bbec38777"
    },
    {
      "name": "people/police-a.glb",
      "path": "people/police-a.glb",
      "type": "glb",
      "bytes": 137676,
      "sha256": "7484456df7773f38a68be703cd216bd00ead5c819ddf408457b90bbd17cedbc9"
    },
    {
      "name": "people/police-b.glb",
      "path": "people/police-b.glb",
      "type": "glb",
      "bytes": 137676,
      "sha256": "448198a893da19b7f5b59504d9210640f558e8c1f4133f020a3f1be22775f9c4"
    },
    {
      "name": "people/police-c.glb",
      "path": "people/police-c.glb",
      "type": "glb",
      "bytes": 137676,
      "sha256": "4bd098835cab75362a4640e246e12eb4edd007134d96177659ca39e68a208358"
    },
    {
      "name": "skeleton.json",
      "path": "skeleton.json",
      "type": "json",
      "bytes": 3380,
      "sha256": "4aa1cad6894c44312a6ad7dcaac3e0ae93da63ba56d3318bb54ffd1e6ed7e6e7"
    }
  ]
});

export function create(options = {}) {
  return createAdapter(metadata, {
    baseURL: new URL('../../../assets/city-citizens-v1/', import.meta.url),
    ...options,
  });
}

const adapter = create();
export const { load, ready, get, dispose } = adapter;
export default adapter;
