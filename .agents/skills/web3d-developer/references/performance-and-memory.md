# Web3D Performance & Memory Management Guide

This guide provides battle-tested implementations for zero-leak memory lifecycle management, GC-free render loops, instancing, and spatial acceleration.

---

## 1. Zero-Leak Recursive Disposal Engine

WebGL cannot automatically garbage-collect GPU buffer allocations. Removing an `Object3D` from a scene only removes its reference in JavaScript; GPU vertex buffers, index buffers, uniforms, and texture samplers remain allocated in VRAM indefinitely.

### Complete Recursive Disposal Crawler

Use this production disposal utility when unmounting components or clearing scenes:

```javascript
/**
 * Recursively disposes all geometries, materials, textures, and render targets
 * attached to a Three.js Object3D tree.
 * @param {THREE.Object3D} root 
 */
export function disposeSceneGraph(root) {
  if (!root) return;

  const disposedTextures = new Set();
  const disposedMaterials = new Set();
  const disposedGeometries = new Set();

  const disposeTexture = (texture) => {
    if (!texture || disposedTextures.has(texture)) return;
    disposedTextures.add(texture);
    if (typeof texture.dispose === 'function') {
      texture.dispose();
    }
  };

  const disposeMaterial = (material) => {
    if (!material || disposedMaterials.has(material)) return;
    disposedMaterials.add(material);

    // Dispose all standard texture map slots
    const textureSlots = [
      'map', 'alphaMap', 'aoMap', 'bumpMap', 'displacementMap',
      'emissiveMap', 'envMap', 'gradientMap', 'lightMap',
      'metalnessMap', 'normalMap', 'roughnessMap', 'specularMap',
      'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap',
      'sheenColorMap', 'sheenRoughnessMap', 'transmissionMap', 'thicknessMap'
    ];

    textureSlots.forEach((slot) => {
      if (material[slot]) {
        disposeTexture(material[slot]);
      }
    });

    // Custom uniforms with texture values
    if (material.uniforms) {
      for (const key of Object.keys(material.uniforms)) {
        const val = material.uniforms[key]?.value;
        if (val && (val.isTexture || val.isWebGLRenderTarget)) {
          disposeTexture(val);
        }
      }
    }

    material.dispose();
  };

  root.traverse((node) => {
    // 1. Dispose Geometries
    if (node.geometry && !disposedGeometries.has(node.geometry)) {
      disposedGeometries.add(node.geometry);
      // If using three-mesh-bvh
      if (node.geometry.boundsTree) {
        node.geometry.disposeBoundsTree();
      }
      node.geometry.dispose();
    }

    // 2. Dispose Materials (handles single material and material arrays)
    if (node.material) {
      if (Array.isArray(node.material)) {
        node.material.forEach(disposeMaterial);
      } else {
        disposeMaterial(node.material);
      }
    }

    // 3. Clean up skeletons & bones
    if (node.isSkinnedMesh && node.skeleton) {
      node.skeleton.dispose();
    }
  });

  // Remove all child links
  while (root.children.length > 0) {
    const child = root.children[0];
    root.remove(child);
  }
}
```

### Renderer & RenderTarget Cleanups
When tearing down an entire canvas or Three.js instance:
```javascript
export function disposeRenderer(renderer, composer = null) {
  if (composer) {
    composer.dispose();
  }
  renderer.dispose();
  renderer.forceContextLoss();
  renderer.domElement = null;
}
```

---

## 2. Zero-GC Allocation in Render Loops

### The Garbage Collection Trap
At 60 FPS, each frame has **16.6ms**. At 120 FPS, each frame has **8.3ms**. If code instantiates objects inside `requestAnimationFrame` or R3F's `useFrame`:
```javascript
// ❌ CRITICAL ANTI-PATTERN: Triggers GC freezes every few seconds
useFrame(() => {
  const dir = new THREE.Vector3(0, 1, 0); // Allocated 60 times/sec!
  meshRef.current.position.add(dir.multiplyScalar(0.01));
});
```
VRAM is untouched, but the browser JavaScript engine's Eden/Young heap rapidly overflows, triggering minor GC pauses of 10–35ms. This is the #1 cause of micro-stutter in 3D web apps.

### Reusable Scratchpad Pattern
Keep vectors, matrices, and quaternions allocated in module or component closure:

```javascript
// ✅ PRODUCTION PATTERN: Zero memory allocation during runtime
import * as THREE from 'three';

// Pre-allocated scratch objects (reused across all frames)
const _scratchVecA = new THREE.Vector3();
const _scratchVecB = new THREE.Vector3();
const _scratchQuat = new THREE.Quaternion();
const _scratchMatrix = new THREE.Matrix4();

export function animateObjectTowards(mesh, targetPos, speed, delta) {
  // In-place vector operations
  _scratchVecA.copy(targetPos);
  _scratchVecB.copy(mesh.position);
  
  // Calculate distance without allocation
  const distance = _scratchVecA.distanceTo(_scratchVecB);
  if (distance < 0.001) return;

  // Damped interpolation
  const dampFactor = 1.0 - Math.exp(-speed * delta);
  mesh.position.lerp(_scratchVecA, dampFactor);
}
```

---

## 3. High-Performance Instancing & Batching

### InstancedMesh (Vanilla Three.js)
When rendering dozens, hundreds, or thousands of repeating objects (screws, rollers, particles, obstacles):

```javascript
import * as THREE from 'three';

export function createConveyorRollers(count = 100) {
  const geometry = new THREE.CylinderGeometry(0.1, 0.1, 1.2, 16);
  const material = new THREE.MeshStandardMaterial({ color: 0x8899a6, roughness: 0.3 });
  
  const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
  instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const dummy = new THREE.Object3D();

  for (let i = 0; i < count; i++) {
    dummy.position.set(0, 0, (i - count / 2) * 0.25);
    dummy.rotation.z = Math.PI / 2;
    dummy.updateMatrix();
    instancedMesh.setMatrixAt(i, dummy.matrix);
  }

  instancedMesh.instanceMatrix.needsUpdate = true;
  return { instancedMesh, dummy };
}
```

### Drei Instancing in R3F
```jsx
import { Instances, Instance } from '@react-three/drei';

export function Rollers({ items }) {
  return (
    <Instances limit={1000} range={items.length}>
      <cylinderGeometry args={[0.1, 0.1, 1.2, 16]} />
      <meshStandardMaterial roughness={0.3} metalness={0.8} />
      {items.map((item, index) => (
        <Instance
          key={index}
          position={item.position}
          rotation={[0, 0, Math.PI / 2]}
        />
      ))}
    </Instances>
  );
}
```

---

## 4. Accelerated Raycasting with BVH

Naive Three.js raycasting (`raycaster.intersectObjects`) checks every triangle linearly ($O(N)$ complexity). On a model with 50,000 polygons, mouse movement will immediately drop framerates.

Accelerate with `three-mesh-bvh` ($O(\log N)$):

```javascript
import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

// 1. Extend Three.js prototype once at initialization
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

// 2. Build BVH tree for the geometry
export function setupHighPolyMesh(mesh) {
  mesh.geometry.computeBoundsTree({
    maxLeafTris: 10,
    strategy: 0 // CENTER
  });
}
```

---

## 5. Dynamic Device Pixel Ratio (DPR) Scaling

Never let the user's screen run uncapped 3x DPR (common on modern Retina/OLED devices):

```javascript
// Clamping DPR in Vanilla Three.js
const dpr = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(dpr);

// Responsive resize handler
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
});
```

In R3F:
```jsx
<Canvas
  dpr={[1, 2]} // Clamped min 1, max 2
  performance={{ min: 0.5 }} // Allows R3F to degrade quality when FPS drops
>
  {/* Scene content */}
</Canvas>
```
