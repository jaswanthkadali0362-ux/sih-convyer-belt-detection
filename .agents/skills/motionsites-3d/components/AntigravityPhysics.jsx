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
