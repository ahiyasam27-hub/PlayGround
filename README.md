# PlayGround

<!-- omgithub:readme:start -->
## 🚀 Build, play, and remix with OMGithub

**Created using [OMGithub.com](https://go.ondev.store/).**

[![OMGithub](https://img.shields.io/badge/OMGithub-Open%20project-orange?style=for-the-badge)](https://go.ondev.store/ahiyasam27-hub/PlayGround)
[![GitHub](https://img.shields.io/badge/GitHub-Source-181717?logo=github&style=for-the-badge)](https://github.com/ahiyasam27-hub/PlayGround)

- 🎮 [Open the project](https://go.ondev.store/ahiyasam27-hub/PlayGround).
- ✨ [Remix this project](https://go.ondev.store/ahiyasam27-hub/PlayGround?remix=1).
- 💻 [Explore the source](https://github.com/ahiyasam27-hub/PlayGround).
- 🛠️ [Check build runs](https://github.com/ahiyasam27-hub/PlayGround/actions).
- 🐛 [Report an issue](https://github.com/ahiyasam27-hub/PlayGround/issues).
- 👤 [Explore the creator's projects](https://go.ondev.store/ahiyasam27-hub).
- 🌍 [Create with OMGithub](https://go.ondev.store/).
<!-- omgithub:readme:end -->

## Environment models

Place environment `.glb` and `.gltf` assets under `public/assets/environment/`; keep attribution and license details alongside each model (the demo uses `stylized-tree.glb.attribution.json`). The demo asset is **Stylized Tree by Lowlypoly**, used under **CC Attribution**; see [its attribution record](public/assets/environment/stylized-tree.glb.attribution.json) and [Sketchfab page](https://sketchfab.com/3d-models/none-96bfe5f5fe3e43e9b4db5ab78fd12710).

`game.js` creates an `EnvironmentAssetManager` from `environment-assets.js` and calls `place(url, placements, options)`. Placements carry a world position, optional rotation/scale, and region/biome labels. Models are cached by ID, normalized to the requested height, and shared across placed instances. Status callbacks cover loading progress, success, and errors.

For this app served from its project root, the demo uses `./public/assets/environment/stylized-tree.glb`. Keep a standalone GLB path relative to the page URL. For a `.gltf`, upload its referenced textures and buffers beside it in the same relative folder structure: GLTFLoader resolves those dependency paths relative to the `.gltf` document.
