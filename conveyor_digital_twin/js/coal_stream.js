/**
 * beltXence Volumetric Coal Stream & Bulk Material Flow Visualizer
 * High-performance, GPU-instanced bulk coal flow strictly conforming to the
 * CAD conveyor belt's exact inclined profile and kinematic transport.
 * 
 * Profile:
 *  - Tail intake section: Z: -0.53 to -0.39 (Y ≈ 0.109m)
 *  - Mid incline section: Z: -0.39 to -0.12 (incline up to Y ≈ 0.177m)
 *  - Intermediate plateau: Z: -0.12 to -0.05 (Y ≈ 0.178m)
 *  - Upper incline: Z: -0.05 to +0.47 (incline up to Y ≈ 0.235m)
 *  - Elevated Head discharge drum: Z: +0.47 to +0.54 (Y ≈ 0.248m)
 *  - Parabolic ballistic discharge stream off the elevated head drum into hopper
 */

import * as THREE from 'three';

export class CoalStream {
  constructor(scene, conveyorAssembly) {
    this.scene = scene;
    this.conveyorAssembly = conveyorAssembly;
    this.group = new THREE.Group();
    this.group.name = 'CoalStream';

    // 400 total active bulk coal rocks and lumps: 180 large faceted chunks + 220 dense gravel fines
    this.countLumps = 180;
    this.countFines = 220;
    this.totalCount = this.countLumps + this.countFines;

    this.coalSpeed = 0.14; // Calmed, realistic industrial transport velocity
    this.isActive = true;

    this.tailZ = -0.52;      // Low intake feed hopper end
    this.headZ = 0.535;      // Elevated head discharge drum crest
    this.beltLength = this.headZ - this.tailZ;

    this._dummy = new THREE.Object3D();

    this.initMaterials();
    this.initCoalFlow();

    this.scene.add(this.group);
  }

  /**
   * Computes the exact top surface height Y and local incline angle of the carrying belt at position Z
   */
  getBeltProfile(z) {
    if (z <= -0.389) {
      return { y: 0.1092, angle: 0 };
    } else if (z <= -0.125) {
      const t = (z - (-0.389)) / (-0.125 - (-0.389));
      const y = 0.1092 + t * (0.1774 - 0.1092);
      const angle = Math.atan2(0.1774 - 0.1092, -0.125 - (-0.389));
      return { y, angle };
    } else if (z <= -0.050) {
      const t = (z - (-0.125)) / (-0.050 - (-0.125));
      const y = 0.1774 + t * (0.1783 - 0.1774);
      return { y, angle: 0.015 };
    } else if (z <= 0.470) {
      const t = (z - (-0.050)) / (0.470 - (-0.050));
      const y = 0.1783 + t * (0.2350 - 0.1783);
      const angle = Math.atan2(0.2350 - 0.1783, 0.470 - (-0.050));
      return { y, angle };
    } else {
      const t = Math.min(1.0, (z - 0.470) / (0.540 - 0.470));
      const y = 0.2350 + t * (0.2485 - 0.2350);
      return { y, angle: 0 };
    }
  }

  initMaterials() {
    // Anthracite coal with clear specular facets and visible geometry
    this.coalLumpMaterial = new THREE.MeshStandardMaterial({
      color: 0x383e4a, // Anthracite charcoal with clear contrast
      roughness: 0.35,
      metalness: 0.28,
      flatShading: true
    });

    this.coalFineMaterial = new THREE.MeshStandardMaterial({
      color: 0x2c313a, // Gravel fines
      roughness: 0.48,
      metalness: 0.18,
      flatShading: true
    });
  }

  initCoalFlow() {
    // 1. Large faceted angular coal lumps
    const lumpGeo = new THREE.DodecahedronGeometry(0.0078, 0);
    const posLump = lumpGeo.attributes.position;
    for (let i = 0; i < posLump.count; i++) {
      const vx = posLump.getX(i);
      const vy = posLump.getY(i);
      const vz = posLump.getZ(i);
      const jx = 0.75 + Math.random() * 0.50;
      const jy = 0.60 + Math.random() * 0.55;
      const jz = 0.75 + Math.random() * 0.50;
      posLump.setXYZ(i, vx * jx, vy * jy, vz * jz);
    }
    lumpGeo.computeVertexNormals();

    this.meshLumps = new THREE.InstancedMesh(lumpGeo, this.coalLumpMaterial, this.countLumps);
    this.meshLumps.castShadow = true;
    this.meshLumps.receiveShadow = true;

    // 2. Smaller dense coal gravel & fines
    const fineGeo = new THREE.IcosahedronGeometry(0.0048, 0);
    const posFine = fineGeo.attributes.position;
    for (let i = 0; i < posFine.count; i++) {
      const vx = posFine.getX(i);
      const vy = posFine.getY(i);
      const vz = posFine.getZ(i);
      posFine.setXYZ(i, vx * (0.8 + Math.random() * 0.4), vy * (0.6 + Math.random() * 0.4), vz * (0.8 + Math.random() * 0.4));
    }
    fineGeo.computeVertexNormals();

    this.meshFines = new THREE.InstancedMesh(fineGeo, this.coalFineMaterial, this.countFines);
    this.meshFines.castShadow = true;
    this.meshFines.receiveShadow = true;

    this.lumpData = [];
    this.fineData = [];

    // Distribute large chunks uniformly along the conveyor
    for (let i = 0; i < this.countLumps; i++) {
      const progress = i / this.countLumps;
      const z = this.tailZ + progress * this.beltLength;
      const prof = this.getBeltProfile(z);

      // Troughed cross-section: concentrated in center, tapering to ±22mm edges
      const lateralFactor = (Math.random() - 0.5) * 2.0; // -1 to 1
      const x = lateralFactor * 0.021;
      const troughHeight = (1.0 - Math.pow(Math.abs(lateralFactor), 1.8)) * 0.0075;
      const y = prof.y + 0.0035 + troughHeight + (Math.random() * 0.003);

      const scaleBase = 0.85 + Math.random() * 0.65;
      const scaleX = scaleBase * (0.8 + Math.random() * 0.4);
      const scaleY = scaleBase * (0.7 + Math.random() * 0.4);
      const scaleZ = scaleBase * (0.8 + Math.random() * 0.4);

      const rotX = prof.angle + (Math.random() - 0.5) * 0.5;
      const rotY = Math.random() * Math.PI * 2;
      const rotZ = (Math.random() - 0.5) * 0.5;

      this.lumpData.push({
        x,
        y,
        z,
        scaleX,
        scaleY,
        scaleZ,
        rotX,
        rotY,
        rotZ,
        heightOffset: troughHeight + (Math.random() * 0.0025),
        spinX: (Math.random() - 0.5) * 4.0,
        spinZ: (Math.random() - 0.5) * 4.0,
        isDischarging: false,
        fallTime: 0
      });

      this._dummy.position.set(x, y, z);
      this._dummy.rotation.set(rotX, rotY, rotZ);
      this._dummy.scale.set(scaleX, scaleY, scaleZ);
      this._dummy.updateMatrix();
      this.meshLumps.setMatrixAt(i, this._dummy.matrix);
    }

    // Distribute dense gravel fines uniformly along the conveyor
    for (let i = 0; i < this.countFines; i++) {
      const progress = (i + 0.5) / this.countFines;
      const z = this.tailZ + progress * this.beltLength;
      const prof = this.getBeltProfile(z);

      const lateralFactor = (Math.random() - 0.5) * 2.0;
      const x = lateralFactor * 0.023;
      const troughHeight = (1.0 - Math.pow(Math.abs(lateralFactor), 1.6)) * 0.005;
      const y = prof.y + 0.002 + troughHeight + (Math.random() * 0.002);

      const scaleBase = 0.75 + Math.random() * 0.70;
      const scaleX = scaleBase * (0.8 + Math.random() * 0.4);
      const scaleY = scaleBase * (0.6 + Math.random() * 0.4);
      const scaleZ = scaleBase * (0.8 + Math.random() * 0.4);

      const rotX = prof.angle + (Math.random() - 0.5) * 0.6;
      const rotY = Math.random() * Math.PI * 2;
      const rotZ = (Math.random() - 0.5) * 0.6;

      this.fineData.push({
        x,
        y,
        z,
        scaleX,
        scaleY,
        scaleZ,
        rotX,
        rotY,
        rotZ,
        heightOffset: troughHeight + (Math.random() * 0.002),
        spinX: (Math.random() - 0.5) * 5.0,
        spinZ: (Math.random() - 0.5) * 5.0,
        isDischarging: false,
        fallTime: 0
      });

      this._dummy.position.set(x, y, z);
      this._dummy.rotation.set(rotX, rotY, rotZ);
      this._dummy.scale.set(scaleX, scaleY, scaleZ);
      this._dummy.updateMatrix();
      this.meshFines.setMatrixAt(i, this._dummy.matrix);
    }

    this.meshLumps.instanceMatrix.needsUpdate = true;
    this.meshFines.instanceMatrix.needsUpdate = true;

    this.group.add(this.meshLumps);
    this.group.add(this.meshFines);
  }

  update(delta, beltSpeedMps = 2.96) {
    if (!this.isActive) return;

    // Movement speed dynamically linked to conveyor speed
    // Calibrated so coal moves visibly and smoothly up the conveyor
    const normalizedSpeed = Math.max(0.04, (beltSpeedMps / 2.96) * this.coalSpeed);
    const stepZ = normalizedSpeed * delta;

    // 1. Advance large coal lumps
    for (let i = 0; i < this.countLumps; i++) {
      const c = this.lumpData[i];

      if (!c.isDischarging) {
        // Move forward along conveyor (+Z towards head drum)
        c.z += stepZ;

        // Stick strictly to belt CAD profile
        const prof = this.getBeltProfile(c.z);
        c.y = prof.y + 0.0035 + c.heightOffset;
        c.rotX = prof.angle;

        // Crest of head discharge pulley reached
        if (c.z >= this.headZ) {
          c.isDischarging = true;
          c.fallTime = 0;
        }
      } else {
        // Parabolic discharge into hopper
        c.fallTime += delta;
        const t = c.fallTime;
        c.z += stepZ * 1.15;
        const headY = 0.2485;
        c.y = headY - (0.5 * 9.8 * t * t * 0.45);

        c.rotX += c.spinX * delta;
        c.rotZ += c.spinZ * delta;

        // Recirculate back to intake hopper
        if (c.y < 0.04 || c.fallTime > 0.40) {
          c.isDischarging = false;
          c.fallTime = 0;
          c.z = this.tailZ + (Math.random() * 0.03);
          const lateralFactor = (Math.random() - 0.5) * 2.0;
          c.x = lateralFactor * 0.021;
          c.heightOffset = (1.0 - Math.pow(Math.abs(lateralFactor), 1.8)) * 0.0075 + (Math.random() * 0.003);
          const prof = this.getBeltProfile(c.z);
          c.y = prof.y + 0.0035 + c.heightOffset;
        }
      }

      this._dummy.position.set(c.x, c.y, c.z);
      this._dummy.rotation.set(c.rotX, c.rotY, c.rotZ);
      this._dummy.scale.set(c.scaleX, c.scaleY, c.scaleZ);
      this._dummy.updateMatrix();
      this.meshLumps.setMatrixAt(i, this._dummy.matrix);
    }
    this.meshLumps.instanceMatrix.needsUpdate = true;

    // 2. Advance small coal gravel fines
    for (let i = 0; i < this.countFines; i++) {
      const c = this.fineData[i];

      if (!c.isDischarging) {
        c.z += stepZ;
        const prof = this.getBeltProfile(c.z);
        c.y = prof.y + 0.002 + c.heightOffset;
        c.rotX = prof.angle;

        if (c.z >= this.headZ) {
          c.isDischarging = true;
          c.fallTime = 0;
        }
      } else {
        c.fallTime += delta;
        const t = c.fallTime;
        c.z += stepZ * 1.15;
        const headY = 0.2485;
        c.y = headY - (0.5 * 9.8 * t * t * 0.45);

        c.rotX += c.spinX * delta;
        c.rotZ += c.spinZ * delta;

        if (c.y < 0.04 || c.fallTime > 0.40) {
          c.isDischarging = false;
          c.fallTime = 0;
          c.z = this.tailZ + (Math.random() * 0.03);
          const lateralFactor = (Math.random() - 0.5) * 2.0;
          c.x = lateralFactor * 0.023;
          c.heightOffset = (1.0 - Math.pow(Math.abs(lateralFactor), 1.6)) * 0.005 + (Math.random() * 0.002);
          const prof = this.getBeltProfile(c.z);
          c.y = prof.y + 0.002 + c.heightOffset;
        }
      }

      this._dummy.position.set(c.x, c.y, c.z);
      this._dummy.rotation.set(c.rotX, c.rotY, c.rotZ);
      this._dummy.scale.set(c.scaleX, c.scaleY, c.scaleZ);
      this._dummy.updateMatrix();
      this.meshFines.setMatrixAt(i, this._dummy.matrix);
    }
    this.meshFines.instanceMatrix.needsUpdate = true;
  }

  toggle(visible) {
    this.isActive = visible !== undefined ? visible : !this.isActive;
    this.group.visible = this.isActive;
  }

  dispose() {
    this.scene.remove(this.group);
    if (this.meshLumps) this.meshLumps.geometry.dispose();
    if (this.meshFines) this.meshFines.geometry.dispose();
    if (this.coalLumpMaterial) this.coalLumpMaterial.dispose();
    if (this.coalFineMaterial) this.coalFineMaterial.dispose();
  }
}
