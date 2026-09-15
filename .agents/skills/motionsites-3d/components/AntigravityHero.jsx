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
