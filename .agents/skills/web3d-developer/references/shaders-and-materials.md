# Web3D Shaders & Materials Engineering Guide

This guide covers modern GLSL shader architecture, extending Three.js PBR materials via `onBeforeCompile`, and future-proofing for WebGPU with Three Shading Language (TSL).

---

## 1. Shader Architecture Selection

Choose the correct shader strategy based on visual requirements:

| Strategy | When to Use | Advantages | Drawbacks |
| :--- | :--- | :--- | :--- |
| **`MeshStandardMaterial`** | Standard physical props | Full PBR, IBL reflections, shadows, zero shader code. | Limited to built-in properties. |
| **`onBeforeCompile`** | Custom effects needing realistic lighting | Injects custom GLSL while retaining PBR lighting, shadows, and envmaps. | Requires hooking into Three.js internal shader chunks. |
| **`ShaderMaterial`** | Stylized FX, backgrounds, post-processing | Full control over vertex & fragment stages; Three.js injects projection/model matrices. | Must re-implement lighting and shadow calculations manually. |
| **`RawShaderMaterial`** | Pure low-level WebGL passes | Zero overhead; no injected attributes or uniforms. | Must declare all attributes, uniforms, and matrices manually. |
| **TSL (NodeMaterial)** | Modern Three.js / WebGPU pipelines | Cross-compiles to GLSL (WebGL) and WGSL (WebGPU) node graph. | Modern Three.js r160+ Node system. |

---

## 2. Injected PBR Shaders via `onBeforeCompile`

When you need custom vertex deformation (e.g. conveyor belt ripple, vibration displacement) or procedural coloring (e.g. temperature heatmaps, infrared overlay) **while keeping realistic PBR lighting and shadows**, never write a raw `ShaderMaterial`. Use `onBeforeCompile`.

### Production Pattern: Heatmap / Telemetry Overlay
```javascript
import * as THREE from 'three';

export function createTelemetryPBRMaterial(baseColor = 0x223344) {
  const material = new THREE.MeshStandardMaterial({
    color: baseColor,
    roughness: 0.4,
    metalness: 0.6
  });

  // Custom uniforms
  const customUniforms = {
    uTime: { value: 0 },
    uHeatmapIntensity: { value: 0.0 }, // Dynamic sensor value
    uVibrationFreq: { value: 5.0 }
  };

  material.onBeforeCompile = (shader) => {
    // 1. Expose uniforms to the compiled shader
    Object.assign(shader.uniforms, customUniforms);
    material.userData.shader = shader;

    // 2. Inject vertex uniforms & displacement
    shader.vertexShader = `
      uniform float uTime;
      uniform float uVibrationFreq;
      uniform float uHeatmapIntensity;
      varying vec3 vWorldPosition;
      ${shader.vertexShader}
    `.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      vWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
      // High-frequency surface vibration simulation
      transformed.y += sin(transformed.x * uVibrationFreq + uTime * 10.0) * (uHeatmapIntensity * 0.02);
      `
    );

    // 3. Inject fragment uniforms & color blending
    shader.fragmentShader = `
      uniform float uTime;
      uniform float uHeatmapIntensity;
      varying vec3 vWorldPosition;
      ${shader.fragmentShader}
    `.replace(
      '#include <dithering_fragment>',
      `
      #include <dithering_fragment>
      // Thermal / warning gradient overlay based on sensor intensity
      vec3 heatColor = mix(vec3(0.0, 0.8, 1.0), vec3(1.0, 0.1, 0.0), uHeatmapIntensity);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, heatColor, uHeatmapIntensity * 0.7);
      `
    );
  };

  // Critical: Provide custom cache key so Three.js does not recompiles duplicate shaders
  material.customProgramCacheKey = () => 'telemetry_pbr_material_v1';

  return { material, uniforms: customUniforms };
}
```

---

## 3. High-Performance GLSL Procedural Noise

Avoid sampling 2D noise textures when procedural noise can be calculated in math. Use this fast, artifact-free 2D Simplex Noise function:

```glsl
// Fast 2D Simplex Noise (Stefan Gustavson / Ian McEwan)
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
        + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
```

---

## 4. WebGPU & Three Shading Language (TSL) Future-Proofing

In modern Three.js WebGPU renderers (`three/webgpu`), materials use Node systems and TSL:

```javascript
import { MeshStandardNodeMaterial, color, timerLocal, sin, uv, mul } from 'three/webgpu';

export function createModernWebGPUMaterial() {
  const material = new MeshStandardNodeMaterial({
    roughness: 0.2,
    metalness: 0.8
  });

  // Procedural node-graph color modulation
  const time = timerLocal();
  const animatedUv = uv().x.add(time.mul(0.2));
  const dynamicColor = color(0x00f0ff).mul(sin(animatedUv.mul(10.0)).mul(0.5).add(0.5));

  material.colorNode = dynamicColor;
  return material;
}
```
