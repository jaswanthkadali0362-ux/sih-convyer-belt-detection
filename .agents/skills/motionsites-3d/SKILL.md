---
name: motionsites-3d
description: Generates cinematic dark-mode landing pages with interactive Three.js canvases, liquid glassmorphism, and Framer Motion scroll scrubbing. Trigger when the user requests 3D landing pages, MotionSites designs, or interactive spatial hero sections.
version: 1.0.0
stack:
  - React (Vite / Next.js)
  - Tailwind CSS
  - Framer Motion (useScroll, useTransform, whileHover)
  - Three.js / @react-three/fiber & @react-three/drei & @react-three/rapier
  - Lucide React (Icons)
---

# MotionSites 3D Webpage Generator

## System Role & Philosophy
You are an elite motion designer and creative frontend engineer trained in the MotionSites aesthetic:
1. **Pure dark-mode canvas (`#000000`)** with high-contrast text and luminous accent glows.
2. **Kinetic 3D foreground/background integration** (interactive Three.js canvas or Spline runtime) that reacts to cursor hover and scroll scrub.
3. **Signature "Liquid Glass" glassmorphism** with dynamic borders.
4. **Editorial typography** pairing modern geometric sans with italicized serif accents.

---

## Design Directives & Tokens

### 1. Color Palette (Dark Only)
- **Background**: `#000000` (Pure Black, no grays for body background)
- **Foreground**: `#FFFFFF` (Pure White)
- **Accent Glows**: Radial gradients using `#6366F1` (Indigo), `#A855F7` (Purple), or `#06B6D4` (Cyan) with 15-25% opacity
- **Cards / Panels**: `rgba(255, 255, 255, 0.02)` to `rgba(255, 255, 255, 0.05)`

### 2. Typography
- **Body / UI**: Inter, Plus Jakarta Sans, or Barlow (`font-sans`)
- **Accent / Editorial Words**: Instrument Serif, Playfair Display, or Italianno in *italics* (`font-serif italic font-normal`)

### 3. Signature Glassmorphism CSS ("Liquid Glass")
Add to `index.css`:
```css
.liquid-glass {
  background: rgba(255, 255, 255, 0.02);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.15), 0 8px 32px rgba(0, 0, 0, 0.37);
}

.liquid-glass-glow {
  position: relative;
}
.liquid-glass-glow::before {
  content: "";
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  padding: 1px;
  background: linear-gradient(180deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.05) 50%, transparent 100%);
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}
```

---

## Execution Rules
1. Implement 3D elements inside a responsive `@react-three/fiber` canvas that tracks cursor pointer coordinates.
2. Ensure all 3D canvas containers use `pointer-events-none` with interactive overlay layers where necessary to avoid blocking DOM scroll.
3. Scaffold using Tailwind CSS and Framer Motion transitions (`useScroll`, `useTransform`, `whileHover`).

---

## Required Dependencies
```bash
npm install @react-three/rapier @react-three/fiber @react-three/drei three framer-motion lucide-react
```

---

## Core Component Architectures

### Pattern A: Cursor-Repulsive Floating Shards (`AntigravityHero.jsx`)
```jsx
import React, { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, MeshTransmissionMaterial } from "@react-three/drei";
import * as THREE from "three";

function FloatingShard({ position, speed }) {
  const meshRef = useRef();
  const initialPos = useMemo(() => new THREE.Vector3(...position), [position]);

  useFrame((state) => {
    const { pointer, viewport } = state;
    // Map pointer to 3D world space coordinates
    const mouse3D = new THREE.Vector3(
      (pointer.x * viewport.width) / 2,
      (pointer.y * viewport.height) / 2,
      0
    );

    // Compute anti-gravity repulsion vector from cursor
    const distance = meshRef.current.position.distanceTo(mouse3D);
    const repulsionRadius = 2.5;

    if (distance < repulsionRadius) {
      const force = (1 - distance / repulsionRadius) * 0.08;
      const dir = new THREE.Vector3().subVectors(meshRef.current.position, mouse3D).normalize();
      meshRef.current.position.addScaledVector(dir, force);
    } else {
      // Drift back to zero-g rest position
      meshRef.current.position.lerp(initialPos, 0.02);
    }

    meshRef.current.rotation.x += 0.005 * speed;
    meshRef.current.rotation.y += 0.008 * speed;
  });

  return (
    <Float speed={speed} rotationIntensity={1.5} floatIntensity={2}>
      <mesh ref={meshRef} position={position}>
        <octahedronGeometry args={[0.45, 0]} />
        <MeshTransmissionMaterial
          backside
          samples={4}
          thickness={0.3}
          roughness={0.1}
          chromaticAberration={0.06}
          anisotropy={0.1}
          distortion={0.2}
          color="#c7d2fe"
        />
      </mesh>
    </Float>
  );
}

export default function AntigravityHero() {
  const shardPositions = [
    [-2.2, 1.2, 0],
    [2.4, -0.8, -1],
    [-1.5, -1.5, 0.5],
    [1.8, 1.8, -0.5],
    [0.2, 2.2, -1],
    [-0.5, -2.0, -0.5],
  ];

  return (
    <div className="absolute inset-0 z-0 pointer-events-none">
      <Canvas camera={{ position: [0, 0, 5], fov: 50 }}>
        <ambientLight intensity={0.8} />
        <pointLight position={[10, 10, 10]} intensity={1.5} color="#818cf8" />
        <pointLight position={[-10, -10, -10]} intensity={0.8} color="#c084fc" />
        {shardPositions.map((pos, i) => (
          <FloatingShard key={i} position={pos} speed={1 + i * 0.2} />
        ))}
      </Canvas>
    </div>
  );
}
```

---

### Pattern B: Zero-G Rigid Body Physics (`AntigravityPhysics.jsx`)
```jsx
import React, { useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Physics, RigidBody, CuboidCollider, BallCollider } from "@react-three/rapier";
import { MeshTransmissionMaterial } from "@react-three/drei";
import * as THREE from "three";

// 1. Invisible Kinematic Collider that tracks mouse pointer
function CursorCollider() {
  const rigidRef = useRef();
  const { viewport } = useThree();

  useFrame((state) => {
    if (!rigidRef.current) return;
    
    // Convert 2D screen pointer (-1 to 1) to 3D world coordinates
    const targetX = (state.pointer.x * viewport.width) / 2;
    const targetY = (state.pointer.y * viewport.height) / 2;

    // Smoothly step kinematic body to follow cursor
    rigidRef.current.setNextKinematicTranslation({
      x: targetX,
      y: targetY,
      z: 0,
    });
  });

  return (
    <RigidBody ref={rigidRef} type="kinematicPosition" colliders={false}>
      <BallCollider args={[0.9]} />
    </RigidBody>
  );
}

// 2. Invisible bounding box to keep shards inside the viewport
function ViewportBoundaries() {
  const { viewport } = useThree();
  const w = viewport.width;
  const h = viewport.height;
  const depth = 6;
  const thickness = 1;

  return (
    <RigidBody type="fixed" colliders={false}>
      {/* Top */}
      <CuboidCollider args={[w / 2, thickness / 2, depth / 2]} position={[0, h / 2 + thickness / 2, 0]} restitution={0.8} />
      {/* Bottom */}
      <CuboidCollider args={[w / 2, thickness / 2, depth / 2]} position={[0, -h / 2 - thickness / 2, 0]} restitution={0.8} />
      {/* Left */}
      <CuboidCollider args={[thickness / 2, h / 2, depth / 2]} position={[-w / 2 - thickness / 2, 0, 0]} restitution={0.8} />
      {/* Right */}
      <CuboidCollider args={[thickness / 2, h / 2, depth / 2]} position={[w / 2 + thickness / 2, 0, 0]} restitution={0.8} />
      {/* Front & Back */}
      <CuboidCollider args={[w / 2, h / 2, thickness / 2]} position={[0, 0, -depth / 2]} restitution={0.8} />
      <CuboidCollider args={[w / 2, h / 2, thickness / 2]} position={[0, 0, depth / 2]} restitution={0.8} />
    </RigidBody>
  );
}

// 3. Individual Dynamic Rigid Body Shard
function PhysicsShard({ position, geometryType = "octahedron", scale = 1 }) {
  const rigidRef = useRef();

  return (
    <RigidBody
      ref={rigidRef}
      colliders="hull"
      position={position}
      restitution={0.85} // Bounciness
      friction={0.2}
      linearDamping={0.3} // Soft zero-G drift drag
      angularDamping={0.4}
    >
      <mesh scale={scale}>
        {geometryType === "octahedron" && <octahedronGeometry args={[0.6, 0]} />}
        {geometryType === "dodecahedron" && <dodecahedronGeometry args={[0.5, 0]} />}
        {geometryType === "icosahedron" && <icosahedronGeometry args={[0.55, 0]} />}

        {/* Liquid glass aesthetic */}
        <MeshTransmissionMaterial
          backside
          samples={4}
          thickness={0.4}
          roughness={0.12}
          chromaticAberration={0.08}
          anisotropy={0.1}
          distortion={0.15}
          color="#c7d2fe"
        />
      </mesh>
    </RigidBody>
  );
}

// 4. Main Exported Canvas
export default function AntigravityPhysics() {
  const shardConfigs = [
    { pos: [-2.0, 1.2, 0], type: "octahedron", scale: 1.1 },
    { pos: [2.2, -0.8, -0.5], type: "dodecahedron", scale: 0.9 },
    { pos: [-1.4, -1.5, 0.4], type: "icosahedron", scale: 1.0 },
    { pos: [1.6, 1.6, -0.2], type: "octahedron", scale: 0.8 },
    { pos: [0.0, 2.0, -0.6], type: "icosahedron", scale: 1.2 },
    { pos: [-0.6, -1.8, -0.3], type: "dodecahedron", scale: 0.95 },
    { pos: [2.5, 0.5, 0.2], type: "octahedron", scale: 1.0 },
  ];

  return (
    <div className="absolute inset-0 z-0 pointer-events-auto">
      <Canvas camera={{ position: [0, 0, 6], fov: 45 }}>
        <ambientLight intensity={0.9} />
        <pointLight position={[10, 10, 10]} intensity={2.0} color="#818cf8" />
        <pointLight position={[-10, -10, -10]} intensity={1.2} color="#c084fc" />

        {/* Zero-G Physics Engine */}
        <Physics gravity={[0, 0, 0]}>
          <ViewportBoundaries />
          <CursorCollider />

          {shardConfigs.map((cfg, idx) => (
            <PhysicsShard
              key={idx}
              position={cfg.pos}
              geometryType={cfg.type}
              scale={cfg.scale}
            />
          ))}
        </Physics>
      </Canvas>
    </div>
  );
}
```
