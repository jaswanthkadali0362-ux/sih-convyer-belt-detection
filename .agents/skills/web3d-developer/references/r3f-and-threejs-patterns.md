# React Three Fiber (R3F) & Three.js Architecture Patterns

This guide details declarative R3F setups, frame-rate independent camera damping math, WebGL context loss handling, and real-time IoT digital twin telemetry integration.

---

## 1. Production R3F Canvas Architecture

### Preventing React Re-render Bottlenecks
The cardinal rule of React Three Fiber: **Never drive 60/120 FPS animations via React `useState` or Redux updates.** React's reconciliation engine runs on the CPU and will choke the frame budget.

```jsx
// ❌ WRONG: Causes 60 full React component re-renders per second!
const [pos, setPos] = useState([0, 0, 0]);
useFrame(() => setPos([x, y, z]));

// ✅ PRODUCTION PATTERN: Mutate Three.js Object3D properties directly via ref
import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

function RotatingTwin() {
  const meshRef = useRef();

  useFrame((state, delta) => {
    // Clamped delta protects against tab-switch jumps
    const safeDelta = Math.min(delta, 0.1);
    if (meshRef.current) {
      meshRef.current.rotation.y += 1.0 * safeDelta;
    }
  });

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#00f0ff" roughness={0.3} metalness={0.8} />
    </mesh>
  );
}

export function App() {
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 2, 5], fov: 45 }}
      gl={{
        antialias: true,
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping
      }}
      onCreated={({ gl }) => {
        // Prevent context loss failure
        gl.domElement.addEventListener('webglcontextlost', (e) => {
          e.preventDefault();
          console.warn('[WebGL] Context lost! Waiting for restoration...');
        });
        gl.domElement.addEventListener('webglcontextrestored', () => {
          console.info('[WebGL] Context restored successfully.');
        });
      }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 10, 5]} intensity={1.5} castShadow />
      <RotatingTwin />
      <OrbitControls makeDefault enableDamping dampingFactor={0.05} />
    </Canvas>
  );
}
```

---

## 2. Framerate-Independent Dampening Mathematics

Naive frame interpolation:
$$\vec{x}_{t} = \vec{x}_{t-1} + (\vec{x}_{\text{target}} - \vec{x}_{t-1}) \cdot \alpha$$
is mathematically flawed: a user on a 120Hz display (8.3ms) moves twice as fast as a user on a 60Hz display (16.6ms).

### The Exact Exponential Decay Formulation
To guarantee identical animation speed regardless of monitor refresh rate:

$$\vec{x}(t) = \vec{x}_{\text{target}} + (\vec{x}(t - \Delta t) - \vec{x}_{\text{target}}) \cdot e^{-\lambda \cdot \Delta t}$$

In JavaScript / Three.js:

```javascript
/**
 * Smoothly damps a Vector3 towards a target independently of framerate.
 * @param {THREE.Vector3} current - In-place mutated vector
 * @param {THREE.Vector3} target - Target vector
 * @param {number} lambda - Smoothing factor (e.g. 4 to 12)
 * @param {number} delta - Frame delta time in seconds
 */
export function dampVector3(current, target, lambda, delta) {
  const factor = 1.0 - Math.exp(-lambda * delta);
  current.lerp(target, factor);
}

/**
 * Smoothly damps a Quaternion towards a target rotation.
 * @param {THREE.Quaternion} current - In-place mutated quaternion
 * @param {THREE.Quaternion} target - Target quaternion
 * @param {number} lambda - Smoothing factor
 * @param {number} delta - Frame delta time
 */
export function dampQuaternion(current, target, lambda, delta) {
  const factor = 1.0 - Math.exp(-lambda * delta);
  current.slerp(target, factor);
}
```

---

## 3. Real-Time IoT & Digital Twin Telemetry Synchronization

When synchronizing a 3D model with hardware sensors (e.g., ESP32, MPU6050, IMU, Conveyor trackers):

### Coordinate Frame Transformation
Hardware IMUs (aerospace/automotive standard) use:
* **X:** Forward (Roll)
* **Y:** Right (Pitch)
* **Z:** Down (Yaw)

Three.js uses a Right-Handed Coordinate System:
* **X:** Right
* **Y:** Up
* **Z:** Forward / Backward (Out of screen)

### Telemetry Binding Engine (Zero-Allocation)
```javascript
import * as THREE from 'three';

export class HardwareDigitalTwinController {
  constructor(targetObject) {
    this.target = targetObject;

    // Scratchpad objects (zero allocations during telemetry stream)
    this._targetEuler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._targetQuat = new THREE.Quaternion();
    this._tareQuat = new THREE.Quaternion();
    this._invTareQuat = new THREE.Quaternion();

    // Tare offsets
    this.offsetPitch = 0;
    this.offsetRoll = 0;
    this.offsetYaw = 0;
  }

  /**
   * Called on incoming WebSocket or Serial message (e.g. 50Hz–200Hz)
   * Converts degrees to radians and updates target orientation
   */
  onSensorTelemetry(pitchDeg, rollDeg, yawDeg) {
    const pitchRad = THREE.MathUtils.degToRad(pitchDeg - this.offsetPitch);
    const rollRad = THREE.MathUtils.degToRad(rollDeg - this.offsetRoll);
    const yawRad = THREE.MathUtils.degToRad(yawDeg - this.offsetYaw);

    // Map IMU Euler to Three.js orientation
    this._targetEuler.set(pitchRad, yawRad, -rollRad, 'YXZ');
    this._targetQuat.setFromEuler(this._targetEuler);
  }

  /**
   * Zeros the current orientation as level
   */
  tare() {
    this._tareQuat.copy(this._targetQuat);
    this._invTareQuat.copy(this._tareQuat).invert();
  }

  /**
   * Called every animation frame (e.g. 60Hz / 120Hz)
   * Smoothly interpolates the 3D model to the latest sensor packet
   */
  update(delta) {
    const safeDelta = Math.min(delta, 0.1);
    const dampSpeed = 15.0; // Responsive tracking without jitter
    const factor = 1.0 - Math.exp(-dampSpeed * safeDelta);

    this.target.quaternion.slerp(this._targetQuat, factor);
  }
}
```
