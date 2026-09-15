/**
 * beltXence Cinematic RTX 4050 Graphics Engine
 * Delivers ultra-photorealistic PBR materials, procedural tangent-space normal maps,
 * IBL reflections via RoomEnvironment, UnrealBloom post-processing, and atmospheric dust.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Custom Cinematic Film Vignette & Contrast Shader
const CinematicVignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    offset: { value: 1.0 },
    darkness: { value: 1.15 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float offset;
    uniform float darkness;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec2 uv = (vUv - vec2(0.5)) * vec2(offset);
      float dist = length(uv);
      float vignette = clamp(1.0 - dist * dist * (darkness * 0.75), 0.0, 1.0);
      gl_FragColor = vec4(texel.rgb * vignette, texel.a);
    }
  `
};

/**
 * Generates a tangent-space normal map from a grayscale height canvas
 */
function createNormalMapFromHeight(heightCanvas, strength = 2.5) {
  const width = heightCanvas.width;
  const height = heightCanvas.height;
  const srcCtx = heightCanvas.getContext('2d');
  const srcData = srcCtx.getImageData(0, 0, width, height).data;

  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = width;
  normalCanvas.height = height;
  const dstCtx = normalCanvas.getContext('2d');
  const dstImg = dstCtx.createImageData(width, height);
  const dstData = dstImg.data;

  const getHeight = (x, y) => {
    const px = (x + width) % width;
    const py = (y + height) % height;
    return srcData[(py * width + px) * 4] / 255.0;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const hL = getHeight(x - 1, y);
      const hR = getHeight(x + 1, y);
      const hD = getHeight(x, y - 1);
      const hU = getHeight(x, y + 1);

      // Central difference
      const dx = (hR - hL) * strength;
      const dy = (hU - hD) * strength;
      const dz = 1.0;

      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const nx = -dx / len;
      const ny = -dy / len;
      const nz = dz / len;

      const idx = (y * width + x) * 4;
      dstData[idx] = Math.floor((nx * 0.5 + 0.5) * 255);
      dstData[idx + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
      dstData[idx + 2] = Math.floor((nz * 0.5 + 0.5) * 255);
      dstData[idx + 3] = 255;
    }
  }

  dstCtx.putImageData(dstImg, 0, 0);
  const tex = new THREE.CanvasTexture(normalCanvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Builds ultra-detailed PBR procedural texture sets
 */
export function createCinematicPBRTextures() {
  // 1. Vulcanized Conveyor Belt (1024x1024)
  const beltW = 1024;
  const beltH = 1024;

  // 1a. Height Map for Normal generation
  const heightCanvas = document.createElement('canvas');
  heightCanvas.width = beltW;
  heightCanvas.height = beltH;
  const hCtx = heightCanvas.getContext('2d');
  hCtx.fillStyle = '#808080';
  hCtx.fillRect(0, 0, beltW, beltH);

  // Chevron Traction Cleats / Lugs
  hCtx.strokeStyle = '#ffffff';
  hCtx.lineWidth = 14;
  hCtx.lineCap = 'round';
  hCtx.lineJoin = 'round';
  for (let y = -64; y < beltH + 128; y += 96) {
    hCtx.beginPath();
    hCtx.moveTo(beltW * 0.15, y + 36);
    hCtx.lineTo(beltW * 0.50, y);
    hCtx.lineTo(beltW * 0.85, y + 36);
    hCtx.stroke();
  }

  // Micro-creases & rubber grain
  for (let i = 0; i < 4000; i++) {
    const rx = Math.random() * beltW;
    const ry = Math.random() * beltH;
    const val = Math.random() > 0.5 ? '#909090' : '#707070';
    hCtx.fillStyle = val;
    hCtx.fillRect(rx, ry, Math.random() * 3 + 1, Math.random() * 2 + 1);
  }

  const beltNormalMap = createNormalMapFromHeight(heightCanvas, 3.2);
  beltNormalMap.repeat.set(1, 4);

  // 1b. Albedo / Diffuse Map
  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = beltW;
  albedoCanvas.height = beltH;
  const aCtx = albedoCanvas.getContext('2d');

  // Multi-tier vulcanized rubber base
  aCtx.fillStyle = '#181b20';
  aCtx.fillRect(0, 0, beltW, beltH);

  // Central trough coal polishing zone
  const troughGrad = aCtx.createLinearGradient(0, 0, beltW, 0);
  troughGrad.addColorStop(0.00, 'rgba(18, 20, 24, 1.0)');
  troughGrad.addColorStop(0.20, 'rgba(28, 32, 38, 1.0)');
  troughGrad.addColorStop(0.50, 'rgba(14, 16, 19, 1.0)'); // polished dark center
  troughGrad.addColorStop(0.80, 'rgba(28, 32, 38, 1.0)');
  troughGrad.addColorStop(1.00, 'rgba(18, 20, 24, 1.0)');
  aCtx.fillStyle = troughGrad;
  aCtx.fillRect(0, 0, beltW, beltH);

  // Longitudinal reinforcement carcass steel cords
  aCtx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
  aCtx.lineWidth = 1.5;
  for (let x = 12; x < beltW; x += 16) {
    aCtx.beginPath();
    aCtx.moveTo(x, 0);
    aCtx.lineTo(x, beltH);
    aCtx.stroke();
  }

  // Chevron tread visual shading
  aCtx.strokeStyle = 'rgba(10, 12, 14, 0.65)';
  aCtx.lineWidth = 12;
  aCtx.lineCap = 'round';
  aCtx.lineJoin = 'round';
  for (let y = -64; y < beltH + 128; y += 96) {
    aCtx.beginPath();
    aCtx.moveTo(beltW * 0.15, y + 36);
    aCtx.lineTo(beltW * 0.50, y);
    aCtx.lineTo(beltW * 0.85, y + 36);
    aCtx.stroke();
  }

  // Coal dust micro-splatter
  aCtx.fillStyle = 'rgba(8, 10, 12, 0.45)';
  for (let k = 0; k < 6000; k++) {
    const cx = beltW * 0.28 + Math.random() * (beltW * 0.44);
    const cy = Math.random() * beltH;
    aCtx.fillRect(cx, cy, Math.random() * 2.5, Math.random() * 2.5);
  }

  const beltAlbedoMap = new THREE.CanvasTexture(albedoCanvas);
  beltAlbedoMap.wrapS = THREE.RepeatWrapping;
  beltAlbedoMap.wrapT = THREE.RepeatWrapping;
  beltAlbedoMap.repeat.set(1, 4);

  // 1c. Roughness Map
  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = beltW;
  roughCanvas.height = beltH;
  const rCtx = roughCanvas.getContext('2d');
  const roughGrad = rCtx.createLinearGradient(0, 0, beltW, 0);
  roughGrad.addColorStop(0.00, '#d8d8d8'); // matte rubber edge (roughness 0.85)
  roughGrad.addColorStop(0.25, '#aaaaaa');
  roughGrad.addColorStop(0.50, '#707070'); // glossy coal-polished center (roughness 0.44)
  roughGrad.addColorStop(0.75, '#aaaaaa');
  roughGrad.addColorStop(1.00, '#d8d8d8');
  rCtx.fillStyle = roughGrad;
  rCtx.fillRect(0, 0, beltW, beltH);

  const beltRoughnessMap = new THREE.CanvasTexture(roughCanvas);
  beltRoughnessMap.wrapS = THREE.RepeatWrapping;
  beltRoughnessMap.wrapT = THREE.RepeatWrapping;
  beltRoughnessMap.repeat.set(1, 4);

  // 2. Machined Stainless Steel Roller (512x512) Lathe Circular Texture
  const rollerHCanvas = document.createElement('canvas');
  rollerHCanvas.width = 512;
  rollerHCanvas.height = 512;
  const rhCtx = rollerHCanvas.getContext('2d');
  rhCtx.fillStyle = '#808080';
  rhCtx.fillRect(0, 0, 512, 512);

  // Lathe turning circular micro-grooves
  for (let y = 0; y < 512; y += 4) {
    const gVal = 120 + Math.floor(Math.random() * 24);
    rhCtx.fillStyle = `rgb(${gVal}, ${gVal}, ${gVal})`;
    rhCtx.fillRect(0, y, 512, 2);
  }
  const rollerNormalMap = createNormalMapFromHeight(rollerHCanvas, 1.8);
  rollerNormalMap.repeat.set(1, 2);

  // 3. Powder-Coated Steel Chassis Orange-Peel Normal Map
  const chassisHCanvas = document.createElement('canvas');
  chassisHCanvas.width = 256;
  chassisHCanvas.height = 256;
  const chCtx = chassisHCanvas.getContext('2d');
  chCtx.fillStyle = '#808080';
  chCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2000; i++) {
    const rx = Math.random() * 256;
    const ry = Math.random() * 256;
    chCtx.fillStyle = Math.random() > 0.5 ? '#949494' : '#6c6c6c';
    chCtx.beginPath();
    chCtx.arc(rx, ry, Math.random() * 2.5 + 0.5, 0, Math.PI * 2);
    chCtx.fill();
  }
  const chassisNormalMap = createNormalMapFromHeight(chassisHCanvas, 1.2);
  chassisNormalMap.repeat.set(4, 4);

  // 4a. Dark Showroom Floor (1024x1024)
  const floorCanvas = document.createElement('canvas');
  floorCanvas.width = 1024;
  floorCanvas.height = 1024;
  const fCtx = floorCanvas.getContext('2d');

  // Dark mirror epoxy base
  fCtx.fillStyle = '#060a12';
  fCtx.fillRect(0, 0, 1024, 1024);

  // Precision metric showroom grid
  fCtx.strokeStyle = 'rgba(0, 240, 255, 0.08)';
  fCtx.lineWidth = 1;
  const step = 64;
  for (let p = 0; p <= 1024; p += step) {
    fCtx.beginPath();
    fCtx.moveTo(p, 0);
    fCtx.lineTo(p, 1024);
    fCtx.stroke();
    fCtx.beginPath();
    fCtx.moveTo(0, p);
    fCtx.lineTo(1024, p);
    fCtx.stroke();
  }

  // Major station markers & glowing coordinate ticks
  fCtx.fillStyle = 'rgba(0, 240, 255, 0.28)';
  for (let x = 0; x <= 1024; x += step * 2) {
    for (let y = 0; y <= 1024; y += step * 2) {
      fCtx.fillRect(x - 2, y - 2, 4, 4);
    }
  }

  // Subtle circular stage rim glow
  const stageGrad = fCtx.createRadialGradient(512, 512, 200, 512, 512, 510);
  stageGrad.addColorStop(0.0, 'rgba(0, 240, 255, 0.00)');
  stageGrad.addColorStop(0.7, 'rgba(0, 240, 255, 0.03)');
  stageGrad.addColorStop(0.95, 'rgba(0, 240, 255, 0.12)');
  stageGrad.addColorStop(1.0, 'rgba(0, 240, 255, 0.00)');
  fCtx.fillStyle = stageGrad;
  fCtx.fillRect(0, 0, 1024, 1024);

  const floorTextureDark = new THREE.CanvasTexture(floorCanvas);
  floorTextureDark.wrapS = THREE.RepeatWrapping;
  floorTextureDark.wrapT = THREE.RepeatWrapping;

  // 4b. Light Showroom Floor (1024x1024)
  const floorCanvasLight = document.createElement('canvas');
  floorCanvasLight.width = 1024;
  floorCanvasLight.height = 1024;
  const flCtx = floorCanvasLight.getContext('2d');

  flCtx.fillStyle = '#f1f5f9';
  flCtx.fillRect(0, 0, 1024, 1024);

  flCtx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
  flCtx.lineWidth = 1;
  for (let p = 0; p <= 1024; p += step) {
    flCtx.beginPath();
    flCtx.moveTo(p, 0);
    flCtx.lineTo(1024, p);
    flCtx.stroke();
    flCtx.beginPath();
    flCtx.moveTo(0, p);
    flCtx.lineTo(1024, p);
    flCtx.stroke();
  }

  flCtx.fillStyle = 'rgba(100, 116, 139, 0.40)';
  for (let x = 0; x <= 1024; x += step * 2) {
    for (let y = 0; y <= 1024; y += step * 2) {
      flCtx.fillRect(x - 2, y - 2, 4, 4);
    }
  }

  const floorTextureLight = new THREE.CanvasTexture(floorCanvasLight);
  floorTextureLight.wrapS = THREE.RepeatWrapping;
  floorTextureLight.wrapT = THREE.RepeatWrapping;

  return {
    beltAlbedoMap,
    beltNormalMap,
    beltRoughnessMap,
    rollerNormalMap,
    chassisNormalMap,
    floorTexture: floorTextureDark,
    floorTextureDark,
    floorTextureLight
  };
}

/**
 * Atmospheric Airborne Dust Particles
 * Micro-motes drifting slowly in the warm spotlight cones above the hopper and drive drum
 */
export class AtmosphericDust {
  constructor(scene) {
    this.scene = scene;
    this.count = 260;
    this.geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(this.count * 3);
    this.velocities = [];

    // Bounding region around conveyor gantry: X: [-0.6, 0.6], Y: [0.05, 0.55], Z: [-0.65, 0.65]
    for (let i = 0; i < this.count; i++) {
      this.positions[i * 3 + 0] = (Math.random() - 0.5) * 1.1;
      this.positions[i * 3 + 1] = 0.06 + Math.random() * 0.46;
      this.positions[i * 3 + 2] = (Math.random() - 0.5) * 1.25;

      this.velocities.push({
        vx: (Math.random() - 0.5) * 0.015,
        vy: 0.008 + Math.random() * 0.012,
        vz: (Math.random() - 0.5) * 0.015,
        phase: Math.random() * Math.PI * 2
      });
    }

    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));

    // Soft-particle circular texture
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 32;
    pCanvas.height = 32;
    const pCtx = pCanvas.getContext('2d');
    const pGrad = pCtx.createRadialGradient(16, 16, 0, 16, 16, 16);
    pGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.95)');
    pGrad.addColorStop(0.4, 'rgba(230, 245, 255, 0.40)');
    pGrad.addColorStop(1.0, 'rgba(230, 245, 255, 0.00)');
    pCtx.fillStyle = pGrad;
    pCtx.fillRect(0, 0, 32, 32);

    const dustTex = new THREE.CanvasTexture(pCanvas);

    this.material = new THREE.PointsMaterial({
      size: 0.012,
      map: dustTex,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.name = 'AtmosphericDust';
    this.scene.add(this.points);
  }

  update(delta, time) {
    if (!this.points.visible) return;
    const pos = this.geometry.attributes.position.array;
    for (let i = 0; i < this.count; i++) {
      const idx = i * 3;
      const v = this.velocities[i];

      pos[idx + 0] += Math.sin(time * 0.8 + v.phase) * 0.0006;
      pos[idx + 1] += v.vy * delta;
      pos[idx + 2] += Math.cos(time * 0.6 + v.phase) * 0.0006;

      // Wrap around gantry bounds
      if (pos[idx + 1] > 0.52) pos[idx + 1] = 0.06;
      if (pos[idx + 0] < -0.55) pos[idx + 0] = 0.55;
      if (pos[idx + 0] > 0.55) pos[idx + 0] = -0.55;
    }
    this.geometry.attributes.position.needsUpdate = true;
  }

  setVisible(val) {
    this.points.visible = !!val;
  }
}

/**
 * RTX 4050 Cinematic Post-Processing Pipeline
 */
export class CinematicPostProcessor {
  constructor(renderer, scene, camera, container) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.container = container;

    this.enabled = true;
    this.bloomEnabled = true;
    this.vignetteEnabled = true;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // 1. Primary Render Target
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    // 2. Photorealistic UnrealBloomPass
    // Tuned for precision laser, LED status dots, and specular glints without blowout
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.25,  // strength
      0.35,  // radius
      0.88   // threshold
    );
    this.composer.addPass(this.bloomPass);

    // 3. Cinematic Vignette Shader
    this.vignettePass = new ShaderPass(CinematicVignetteShader);
    this.composer.addPass(this.vignettePass);

    // 4. OutputPass (accurate sRGB / ACES Tone Mapping output)
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);

    // 5. IBL Room Environment Generator
    this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.pmremGenerator.compileEquirectangularShader();
    this.roomEnvironment = new RoomEnvironment();
    this.envMapTexture = this.pmremGenerator.fromScene(this.roomEnvironment, 0.04).texture;
    this.scene.environment = this.envMapTexture;
  }

  setSize(width, height) {
    this.composer.setSize(width, height);
    this.bloomPass.resolution.set(width, height);
  }

  setBloom(enabled, strength = 0.25) {
    this.bloomEnabled = !!enabled;
    this.bloomPass.enabled = this.bloomEnabled;
    if (enabled) {
      this.bloomPass.strength = strength;
    }
  }

  setVignette(enabled) {
    this.vignetteEnabled = !!enabled;
    this.vignettePass.enabled = this.vignetteEnabled;
  }

  setIBLEnabled(enabled) {
    this.scene.environment = enabled ? this.envMapTexture : null;
  }

  render(delta) {
    if (this.enabled) {
      this.composer.render(delta);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  dispose() {
    if (this.envMapTexture) this.envMapTexture.dispose();
    if (this.pmremGenerator) this.pmremGenerator.dispose();
    if (this.composer) this.composer.dispose();
  }
}
