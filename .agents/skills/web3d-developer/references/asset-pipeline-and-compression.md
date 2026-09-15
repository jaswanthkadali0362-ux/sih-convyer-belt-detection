# Web3D Asset Pipeline & Compression Guide

This guide establishes the production standard for compressing, transcoding, and streaming 3D assets (GLTF/GLB) with minimal network transfer and instantaneous GPU uploads.

---

## 1. The Asset Compression Hierarchy

Raw 3D files (FBX, OBJ, uncompressed GLTF) are unacceptable for web deployment. Every model must pass through a modern compression pipeline:

```text
[Raw 3D Asset (OBJ / FBX / GLTF)]
               │
               ▼
   [gltf-transform optimize]
   ├── prune (remove unused nodes & materials)
   ├── dedup (merge duplicate vertex attributes & textures)
   ├── reorder (GPU vertex cache optimization)
   └── quantize / weld (eliminate sub-millimeter precision waste)
               │
               ├─────────────────────────┐
               ▼                         ▼
   [Mesh Compression]            [Texture Transcoding]
   ├── Draco (Max wire savings)  ├── KTX2 / Basis Universal
   └── Meshopt (Fastest decode)  └── ORM Channel Packing (R=AO, G=Rough, B=Metal)
```

---

## 2. gltf-transform Production Recipes

Install the CLI globally or via npx:
```bash
npm install -g @gltf-transform/cli
```

### Recipe A: Universal Web Optimization (Meshopt + WebP / KTX2)
*Best for fast startup on mobile devices with zero decoding lag:*
```bash
# Clean, weld, and quantize geometry
gltf-transform optimize input.glb output_opt.glb \
  --prune true \
  --dedup true \
  --weld true \
  --quantize true \
  --texture-compress webp

# Or for direct GPU texture formats (KTX2 UASTC/ETC1S)
gltf-transform etc1s input.glb output_ktx2.glb --quality 180
```

### Recipe B: Maximum Network Compression (Draco)
*Best for large architectural or mechanical assemblies over cellular connections:*
```bash
gltf-transform draco input.glb output_draco.glb \
  --method edgebreaker \
  --quantize-position 14 \
  --quantize-normal 10 \
  --quantize-texcoord 12
```

---

## 3. High-Performance Three.js Loader Setup

Always configure loaders with Web Workers and WASM decoders to prevent freezing the main UI thread during download and parsing:

```javascript
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export function createProductionGLTFLoader(renderer) {
  const gltfLoader = new GLTFLoader();

  // 1. Draco Decoder (Offloads decoding to Web Worker)
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  dracoLoader.setDecoderConfig({ type: 'js' });
  gltfLoader.setDRACOLoader(dracoLoader);

  // 2. KTX2 Basis Universal Decoder (GPU compressed textures)
  const ktx2Loader = new KTX2Loader();
  ktx2Loader.setTranscoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/basis/');
  ktx2Loader.detectSupport(renderer);
  gltfLoader.setKTX2Loader(ktx2Loader);

  // 3. Meshopt Decoder
  gltfLoader.setMeshoptDecoder(MeshoptDecoder);

  return gltfLoader;
}
```

In React Three Fiber:
```jsx
import { useGLTF } from '@react-three/drei';

// Automatically caches and decodes via worker
export function Model({ url }) {
  const { scene } = useGLTF(url, '/draco-decoders/');
  return <primitive object={scene} />;
}

// Preload for instant mount
useGLTF.preload('/models/conveyor.glb');
```

---

## 4. Texture Budgets & ORM Channel Packing

### The 1-Texture ORM Pattern
Instead of loading 3 separate grayscale textures for Ambient Occlusion, Roughness, and Metalness:
* **Red Channel:** Ambient Occlusion (AO)
* **Green Channel:** Roughness
* **Blue Channel:** Metalness

This cuts HTTP requests from 3 down to 1 and reduces texture sampler unit binding overhead in the shader stage.

```javascript
// Binding a single ORM texture in Three.js
const ormTexture = textureLoader.load('textures/conveyor_orm.webp');
ormTexture.colorSpace = THREE.NoColorSpace; // Must remain linear!

const material = new THREE.MeshStandardMaterial({
  map: albedoMap, // sRGB
  aoMap: ormTexture, // Red channel
  roughnessMap: ormTexture, // Green channel
  metalnessMap: ormTexture, // Blue channel
  aoMapIntensity: 1.0,
  roughness: 1.0,
  metalness: 1.0
});
```

### Texture Resolution Guidelines
| Asset Role | Max Resolution | Format | Color Space |
| :--- | :--- | :--- | :--- |
| **Hero Object Albedo** | $2048 \times 2048$ | WebP / KTX2 UASTC | `SRGBColorSpace` |
| **Secondary Props Albedo** | $1024 \times 1024$ | WebP / KTX2 ETC1S | `SRGBColorSpace` |
| **ORM Packed Maps** | $1024 \times 1024$ | WebP / KTX2 ETC1S | `NoColorSpace` (Linear) |
| **Normal Maps** | $1024 \times 1024$ (or $2048$) | PNG / KTX2 UASTC | `NoColorSpace` (Linear) |
| **UI Sprites / Decals** | $512 \times 512$ | WebP / PNG | `SRGBColorSpace` |

*Rule:* All textures MUST be Power-of-Two (e.g. 512, 1024, 2048) to allow hardware mipmap generation (`generateMipmaps = true`). Non-power-of-two (NPOT) textures disable trilinear filtering and cause shimmering artifacts.
