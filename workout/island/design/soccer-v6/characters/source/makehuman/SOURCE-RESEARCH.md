# MakeHuman source research

Research/download only; no repository files were edited.

## Current upstream license evidence

- Official system asset pack page: https://github.com/makehumancommunity/makehuman-static-website/blob/master/content/Assets/AssetPacks/makehuman_system_assets.md
- Raw page downloaded: https://raw.githubusercontent.com/makehumancommunity/makehuman-static-website/master/content/Assets/AssetPacks/makehuman_system_assets.md
- Local page: `/tmp/soccer-human/makehuman_system_assets.md`
- The current official table explicitly labels `afro01`, `short01`, `short02`, `short03`, `short04`, `young_caucasian_male`, and `young_african_male` CC0.
- Official asset-pack download links resolved from official `hugo.toml`: https://files2.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip and https://files.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip . These two hosts were not used for downloading.
- Official current asset license text: https://raw.githubusercontent.com/makehumancommunity/makehuman/master/LICENSE.ASSETS.md (local `/tmp/soccer-human/LICENSE.ASSETS.md`).

## Actual binary source

- Package URL: https://archive.ubuntu.com/ubuntu/pool/universe/m/makehuman/makehuman-data_1.1.1-1_all.deb
- Package download: `/tmp/soccer-human/makehuman-data.deb` (262831670 bytes).
- The package was downloaded and selectively extracted; it was not installed.
- Extracted original files: `/tmp/soccer-human/ubuntu/usr/share/makehuman/data/`
- Four adult male skin atlases are copied to `/tmp/soccer-human/young_lightskinned_male_diffuse{,2,3}.png` and `/tmp/soccer-human/young_darkskinned_male_diffuse.png`. All are genuine decoded 2048x2048 RGB PNGs; author must resize/atlas to target constraint.
- Hair staging directories: `/tmp/soccer-human/ubuntu-hair/{short01,short02,short03,short04,afro01}/` contain genuine alpha diffuse PNG, `.mhclo` fitting map, material, compressed source NPZ, and an OBJ transcription.
- Ubuntu ships hair source as NPZ instead of OBJ. Staged `.obj` files are exact transcriptions of `coord`, `texco`, `fvert`, `fuvs` arrays (repeated triangle corners removed); no mesh shape edits. Original NPZ included beside each OBJ.

## Provenance distinction

- The historical 2017 package and the separate GitHub mirror retain AGPL-era text headers. The current official system-assets page now explicitly grants CC0 to the named system assets. Preserve both facts in final provenance.
- Initial mirror OBJ/mhclo downloads remain under `/tmp/soccer-human/base/hair/` from https://github.com/dmaugis/makehuman-py3-assets/tree/master/base/hair . Prefer the Ubuntu staging geometry because this records actual binary provenance consistently.
- Raw GitHub PNG responses were LFS pointers, not images. Those pointers under `/tmp/soccer-human/base/` must not be used as image files. Real images are at top level and in `ubuntu-hair`.
- Direct GitHub LFS media endpoint and LFS batch were blocked; no network bypass was attempted. Ubuntu archive is an independently authorized package source.

## SHA-256

| File | SHA-256 |
| --- | --- |
| `/tmp/soccer-human/makehuman-data.deb` | `881a79c3a6640e2ecc579093f6895d161fd902856504b123ef750e843f4304a7` |
| `/tmp/soccer-human/makehuman_system_assets.md` | `f33900d0cd0c101b7a18b9c14569c3df93c62e8b0d23c9ed9a1bfba388538b8c` |
| `/tmp/soccer-human/LICENSE.ASSETS.md` | `f6089cba01cb570a24712b41ab8a586ccd3cc5ef53dc266ca50b95c288956d2c` |
| `/tmp/soccer-human/ubuntu-hair/afro01/afro01.obj` | `d82bfa64bead1b164d54d655c2211a2fe0f59526da03575737a89612e5f47c1c` |
| `/tmp/soccer-human/ubuntu-hair/short04/short04.obj` | `ad658fc72338c2b01f40aa69bd2d3eaa15fba73606ec65bc7cfb081533034c8b` |
| `/tmp/soccer-human/ubuntu-hair/short03/short03.obj` | `f1f866a3726c2ec067d1c9ddc1d977809f7fca41ee9a69c1a82b9be1ecca69c9` |
| `/tmp/soccer-human/ubuntu-hair/short02/short02.obj` | `f89527df7598b98aff9dfba7b96b416968bc2bee334bcb90b7414eb13e32a42e` |
| `/tmp/soccer-human/ubuntu-hair/short01/short01.obj` | `9ada607454a3abdb336e6b5d0b944e342c5ef55bc26c08b5f04fee3f4ba36a46` |
| `/tmp/soccer-human/ubuntu-hair/afro01/afro_diffuse.png` | `e1dee945acd35c1063344c4bbb8f9120ca5957ba505fa4d370d463af522cad33` |
| `/tmp/soccer-human/ubuntu-hair/short04/short04_diffuse.png` | `cda4d0df71fede3a0301c388ffca3429fbf00ff7b5046c9a5d5a476511b05a01` |
| `/tmp/soccer-human/ubuntu-hair/short03/short03_diffuse.png` | `595bdc8553609dfdf88ae8debe1a81e2913feb2a8f8ec16d9b7307f6ceb742e8` |
| `/tmp/soccer-human/ubuntu-hair/short02/short02_diffuse.png` | `d668e8e413749136c0a51520b17c8f23b0eef99a4596dc4d0d2aabe9ba31e3c5` |
| `/tmp/soccer-human/ubuntu-hair/short02/short02_normal.png` | `f3ca91aa4d56aa353726176efa2d5dfb432d47a18a38b2dd9819b0e409252785` |
| `/tmp/soccer-human/ubuntu-hair/short01/short01_diffuse.png` | `63bc8691e25d3b8906cd9721fb422c51a95bbe7cee56905b05fdfe4982a80e7a` |
| `/tmp/soccer-human/young_lightskinned_male_diffuse.png` | `6222821cf0425b4459f00c3db4cffc1fa965922fc314f328076bdec7a2791510` |
| `/tmp/soccer-human/young_lightskinned_male_diffuse2.png` | `678a646169a85a5a2baaef44d1550e468d754adc254665e3b304d896e030dc80` |
| `/tmp/soccer-human/young_lightskinned_male_diffuse3.png` | `f78279ec6fbf5b152d819a6614bfa99f4045914232095c120b181daf3c9af5e8` |
| `/tmp/soccer-human/young_darkskinned_male_diffuse.png` | `a541ebd3e900f61bcd84cdccb36293759bc88d76f636f7011a11daf42cae5959` |
