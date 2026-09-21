/**
 * Ore Sentinels Conveyor 3D Scene & Kinematics Engine
 * Professional Industrial CAD Presentation (ABB Ability™ Standard)
 * Features PBR materials, precision optical laser profilometer sheet,
 * and cinematic camera director with full-gantry isometric framing.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { CoalStream } from './coal_stream.js';
import { createCinematicPBRTextures, AtmosphericDust, CinematicPostProcessor } from './cinematic_graphics.js';

export class ConveyorScene {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.container = canvasElement.parentElement;

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.clock = new THREE.Clock();

    // Assemblies & Mesh references
    this.rootGroup = new THREE.Group();
    this.conveyorAssembly = new THREE.Group();
    this.cadParts = new THREE.Group();
    this.rollerJoints = [];
    this.sensorMeshes = new Map();

    // Precision Industrial Laser Profilometer (Keyence / Cognex style)
    this.laserGroup = new THREE.Group();
    this.laserSheet = null;
    this.laserLine = null;
    this.laserScanOffset = 0;

    // Kinematics state
    this.beltSpeed = 0.85; // m/s
    this.isSpinning = true;
    this.industrialCrew = null;
    this.coalStream = null;

    // High-Performance Web 3D Graphics Pipeline
    this.postProcessor = null;
    this.atmosphericDust = null;
    this.cinematicTextures = null;
    this.isCinematicActive = true;

    // Gazebo 3D Robot Camera Sensor (ROS Camera Plugin Viewport)
    this.gazeboCanvas = null;
    this.gazeboRenderer = null;
    this.gazeboCamera = null;

    // Reusable Scratchpad (Zero GC allocations in render loop)
    this._tempVec = new THREE.Vector3();
    this._tempVec2 = new THREE.Vector3();
    this.droneTour = null;
    this.isStressHeatmapActive = false;
    this.gougeMesh = null;

    this.init();
    this.setupLighting();
    this.loadAssembly();
    this.setupEvents();
    this.animate();
  }

  init() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const bgColor = isDark ? 0x000000 : 0xf1f5f9;

    // 1. Scene: High-contrast cyber-industrial digital twin CAD stage
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(bgColor);
    this.scene.fog = null; // No fog: crystal-clear CAD visibility across all angles

    // 2. Camera: Wide-angle 38 deg FOV for balanced engineering perspective
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(38, aspect, 0.05, 50.0);
    this.camera.position.set(-1.8, 0.95, 1.35);

    // 3. Renderer (Crisp, sharp, anti-aliased CAD presentation)
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(dpr);
    this.renderer.shadowMap.enabled = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.38;

    // 4. OrbitControls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0.0, 0.18, 0.0);
    this.controls.maxPolarAngle = Math.PI / 2 + 0.02; // Prevent going under floor
    this.controls.minDistance = 0.3;
    this.controls.maxDistance = 6.0;

    this.scene.add(this.rootGroup);
    this.rootGroup.add(this.conveyorAssembly);
    this.conveyorAssembly.add(this.cadParts);
    this.scene.add(this.laserGroup);

    // 5. Procedural PBR Textures
    this.cinematicTextures = createCinematicPBRTextures();
    this.postProcessor = null;
    this.isCinematicActive = false;

    // 6. Zero Floating Dust Motes (Clean, sharp, speckle-free presentation)
    this.atmosphericDust = null;

    // 7. Bulk Material Flow (Volumetric Coal Stream)
    this.coalStream = new CoalStream(this.scene, this.conveyorAssembly);
  }

  setupLighting() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    // 1. Ambient Light (Universal high-clarity fill to ensure no face or shadow is pitch black)
    this.ambientLight = new THREE.AmbientLight(0xffffff, isDark ? 0.65 : 0.75);
    this.scene.add(this.ambientLight);

    // 2. Hemisphere Light (Soft ambient sky/ground fill)
    this.hemiLight = new THREE.HemisphereLight(
      isDark ? 0xa5c9ff : 0xffffff,
      isDark ? 0x3b4252 : 0x94a3b8,
      isDark ? 0.95 : 1.20
    );
    this.hemiLight.position.set(0, 8, 0);
    this.scene.add(this.hemiLight);

    // 3. High-Precision Key Light (Direct crisp illumination)
    this.dirLight = new THREE.DirectionalLight(0xffffff, isDark ? 1.45 : 1.35);
    this.dirLight.position.set(3.2, 5.5, 2.2);
    this.dirLight.castShadow = false;
    this.scene.add(this.dirLight);

    // 4. Cool Rim / Edge Accent Light (Low-angle back light)
    this.rimLight = new THREE.DirectionalLight(0x38bdf8, isDark ? 0.95 : 0.70);
    this.rimLight.position.set(-3.2, 2.0, -3.0);
    this.scene.add(this.rimLight);

    // 5. Broad High-Intensity Cavity Fill Light (Illuminates shadowed cavities)
    this.fillLight = new THREE.DirectionalLight(0xffffff, isDark ? 1.05 : 0.95);
    this.fillLight.position.set(-3.5, 4.0, -2.5);
    this.scene.add(this.fillLight);

    // 6. Secondary Opposite Side Fill Light
    this.fillLight2 = new THREE.DirectionalLight(0xdbeafe, isDark ? 0.85 : 0.75);
    this.fillLight2.position.set(2.8, 2.5, -2.5);
    this.scene.add(this.fillLight2);

    // 7. Overhead Machine Vision Spotlight (Soft accent on intake & laser scan station)
    this.laserStationSpot = new THREE.SpotLight(0xffffff, isDark ? 0.40 : 0.25, 4.0, Math.PI / 4, 0.85, 1.2);
    this.laserStationSpot.position.set(0.0, 1.4, -0.42);
    this.laserStationSpot.target.position.set(0.0, 0.12, -0.42);
    this.scene.add(this.laserStationSpot);
    this.scene.add(this.laserStationSpot.target);

    // 8. Sleek Polished Industrial Showroom Stage Floor
    const floorGeo = new THREE.PlaneGeometry(6.0, 6.0);
    const floorMat = new THREE.MeshStandardMaterial({
      map: isDark ? this.cinematicTextures.floorTextureDark : this.cinematicTextures.floorTextureLight,
      roughness: 0.38,
      metalness: 0.20
    });
    this.showroomFloor = new THREE.Mesh(floorGeo, floorMat);
    this.showroomFloor.rotation.x = -Math.PI / 2;
    this.showroomFloor.position.y = -0.001;
    this.showroomFloor.receiveShadow = true;
    this.scene.add(this.showroomFloor);

    // 9. Subtle Contact Shadow Plane for Grounding
    const shadowPlaneGeo = new THREE.PlaneGeometry(4.5, 4.5);
    const shadowPlaneMat = new THREE.ShadowMaterial({ opacity: isDark ? 0.25 : 0.28 });
    this.shadowPlane = new THREE.Mesh(shadowPlaneGeo, shadowPlaneMat);
    this.shadowPlane.rotation.x = -Math.PI / 2;
    this.shadowPlane.position.y = 0.0005;
    this.shadowPlane.receiveShadow = true;
    this.scene.add(this.shadowPlane);

    // 10. Engineering Metric Grid (Layered gracefully above floor)
    this.grid = new THREE.GridHelper(5.0, 24, isDark ? 0x00f0ff : 0x94a3b8, isDark ? 0x00f0ff : 0x94a3b8);
    this.grid.position.y = 0.001;
    this.grid.material.opacity = isDark ? 0.14 : 0.25;
    this.grid.material.transparent = true;
    this.scene.add(this.grid);
  }

  setTheme(theme) {
    const isDark = (theme === 'dark');
    const bgColor = isDark ? 0x000000 : 0xf1f5f9;

    if (this.scene) {
      this.scene.background.set(bgColor);
      this.scene.fog = null;
    }

    if (this.ambientLight) {
      this.ambientLight.intensity = isDark ? 0.65 : 0.75;
    }

    if (this.hemiLight) {
      this.hemiLight.color.set(isDark ? 0xa5c9ff : 0xffffff);
      this.hemiLight.groundColor.set(isDark ? 0x3b4252 : 0xd4dde8);
      this.hemiLight.intensity = isDark ? 0.95 : 1.20;
    }

    if (this.dirLight) {
      this.dirLight.color.set(0xffffff);
      this.dirLight.intensity = isDark ? 1.45 : 1.35;
    }

    if (this.rimLight) {
      this.rimLight.color.set(isDark ? 0x38bdf8 : 0x93c5fd);
      this.rimLight.intensity = isDark ? 0.95 : 0.70;
    }

    if (this.fillLight) {
      this.fillLight.intensity = isDark ? 1.05 : 0.95;
    }

    if (this.fillLight2) {
      this.fillLight2.intensity = isDark ? 0.85 : 0.75;
    }

    if (this.laserStationSpot) {
      this.laserStationSpot.intensity = isDark ? 0.40 : 0.25;
    }

    if (this.shadowPlane) {
      this.shadowPlane.material.opacity = isDark ? 0.25 : 0.28;
    }

    if (this.showroomFloor && this.cinematicTextures) {
      this.showroomFloor.material.map = isDark ? this.cinematicTextures.floorTextureDark : this.cinematicTextures.floorTextureLight;
      this.showroomFloor.material.color.set(0xffffff);
      this.showroomFloor.material.needsUpdate = true;
    }

    if (this.grid) {
      this.grid.material.color.set(isDark ? 0x00f0ff : 0x94a3b8);
      this.grid.material.opacity = isDark ? 0.14 : 0.35;
    }
  }

  loadAssembly() {
    const manager = new THREE.LoadingManager();
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');

    manager.onProgress = (url, loaded, total) => {
      if (loadingText) {
        const fname = url.split('/').pop();
        loadingText.textContent = `Loading CAD Assembly (${loaded}/${total}): ${fname}`;
      }
    };

    manager.onLoad = () => {
      console.log('[Ore Sentinels] All 22 STL meshes loaded successfully!');
      this.isAssemblyLoaded = true;
      if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
      }
      this.centerAndFrameModel();
      this.setupPrecisionLaserScanner();
    };

    manager.onError = (url) => {
      console.error('[Ore Sentinels] Failed to load mesh:', url);
    };

    const loader = new STLLoader(manager);

    // Industrial Machinery PBR Materials - Lightened, highly visible & crisp for CPU execution
    const chassisMaterial = new THREE.MeshStandardMaterial({
      color: 0x5a6678, // Crisp machinery slate-grey (brightened to remove pitch-black shadows)
      metalness: 0.30,
      roughness: 0.42,
      normalMap: this.cinematicTextures.chassisNormalMap,
      normalScale: new THREE.Vector2(0.5, 0.5)
    });

    const rubberBeltMaterial = new THREE.MeshStandardMaterial({
      color: 0x3d4554, // Medium dark vulcanized rubber (belt ribs & texture clearly visible)
      map: this.cinematicTextures.beltAlbedoMap,
      normalMap: this.cinematicTextures.beltNormalMap,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughnessMap: this.cinematicTextures.beltRoughnessMap,
      roughness: 0.52,
      metalness: 0.10
    });

    const rollerMaterial = new THREE.MeshStandardMaterial({
      color: 0xf8fafc, // High-clarity machined stainless steel roller
      metalness: 0.85,
      roughness: 0.20,
      normalMap: this.cinematicTextures.rollerNormalMap,
      normalScale: new THREE.Vector2(0.65, 0.65)
    });

    // High-visibility illuminated industrial sensor materials
    const sensorMaterials = {
      optical: new THREE.MeshStandardMaterial({ color: 0x00b4d8, roughness: 0.20, metalness: 0.50, emissive: 0x0077b6, emissiveIntensity: 0.40 }),
      thermal: new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.22, metalness: 0.40, emissive: 0xc2410c, emissiveIntensity: 0.40 }),
      alignment: new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.20, metalness: 0.45, emissive: 0xa16207, emissiveIntensity: 0.40 }),
      vibration: new THREE.MeshStandardMaterial({ color: 0xc084fc, roughness: 0.22, metalness: 0.50, emissive: 0x7e22ce, emissiveIntensity: 0.40 }),
      speed: new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.22, metalness: 0.50, emissive: 0x047857, emissiveIntensity: 0.40 }),
      electrical: new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.22, metalness: 0.50, emissive: 0x0369a1, emissiveIntensity: 0.40 })
    };

    // 1. Base Link
    loader.load('/meshes/base_link.stl', (geo) => {
      geo.scale(0.001, 0.001, 0.001);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, chassisMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = 'BaseFrame';
      this.cadParts.add(mesh);
    });

    // 2. Rubber Belt with animated industrial PBR texture
    loader.load('/meshes/belt_1.stl', (geo) => {
      geo.scale(0.001, 0.001, 0.001);
      geo.computeVertexNormals();

      // Planar UV generation along conveyor length (STL Y-axis) and width (STL X-axis)
      const pos = geo.attributes.position;
      const uvs = new Float32Array(pos.count * 2);
      for (let i = 0; i < pos.count; i++) {
        uvs[i * 2] = pos.getX(i) * 16.0;
        uvs[i * 2 + 1] = pos.getY(i) * 16.0;
      }
      geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

      this.rubberBeltMaterial = rubberBeltMaterial;

      const mesh = new THREE.Mesh(geo, rubberBeltMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = 'RubberBelt';
      this.cadParts.add(mesh);
    });

    // 3. 7 Kinematic Rollers
    const rollerDefinitions = [
      { name: 'Roller 6', file: 'roller__6__1.stl', origin: [-0.03, 0.102509, 0.087687], axis: [-1, 0, 0] },
      { name: 'Roller 1', file: 'roller_1.stl', origin: [-0.03, -0.032509, 0.087687], axis: [1, 0, 0] },
      { name: 'Roller 2', file: 'roller__1__1.stl', origin: [-0.032, -0.291761, 0.156029], axis: [1, 0, 0] },
      { name: 'Roller 3', file: 'roller__2__1.stl', origin: [-0.032, -0.354237, 0.155066], axis: [1, 0, 0] },
      { name: 'Roller 4', file: 'roller__3__1.stl', origin: [-0.032, -0.323246, 0.103268], axis: [-1, 0, 0] },
      { name: 'Roller 5', file: 'roller__4__1.stl', origin: [-0.032, -0.894931, 0.212484], axis: [1, 0, 0] },
      { name: 'Roller 7', file: 'roller__5__1.stl', origin: [-0.032, -0.96236, 0.227475], axis: [1, 0, 0] }
    ];

    rollerDefinitions.forEach((rd) => {
      loader.load(`/meshes/${rd.file}`, (geo) => {
        geo.scale(0.001, 0.001, 0.001);
        geo.computeVertexNormals();

        const pivot = new THREE.Group();
        pivot.position.set(rd.origin[0], rd.origin[1], rd.origin[2]);

        const mesh = new THREE.Mesh(geo, rollerMaterial);
        mesh.position.set(-rd.origin[0], -rd.origin[1], -rd.origin[2]);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        pivot.add(mesh);
        this.cadParts.add(pivot);

        this.rollerJoints.push({
          pivot: pivot,
          axis: new THREE.Vector3(rd.axis[0], rd.axis[1], rd.axis[2]).normalize(),
          name: rd.name
        });
      });
    });

    // 4. 13 Sensor Components
    const sensorDefs = [
      { key: 'damage_st01', file: 'DEPTH_CAMERA_1.stl', mat: sensorMaterials.optical },
      { key: 'misalignment_st01', file: 'TIME_OF_FLIGHT_1.stl', mat: sensorMaterials.alignment },
      { key: 'thickness_st01', file: 'TIME_OF_FLIGHT__1__1.stl', mat: sensorMaterials.alignment },
      { key: 'load_sensor_st01', file: 'LOAD_CELL_1.stl', mat: sensorMaterials.alignment },
      { key: 'speed_mid_02', file: 'SPEED_1.stl', mat: sensorMaterials.speed },
      { key: 'speed_head_drive', file: 'SPEED__1__1.stl', mat: sensorMaterials.speed },
      { key: 'speed_tail_01', file: 'SPEED__1.stl', mat: sensorMaterials.speed },
      { key: 'temp_bearing_01', file: 'TEMPERATURE_1.stl', mat: sensorMaterials.thermal },
      { key: 'current_motor_01', file: 'CURRENT_SENSOR_1.stl', mat: sensorMaterials.electrical },
      { key: 'vibration_head', file: 'VIBRATION_1.stl', mat: sensorMaterials.vibration },
      { key: 'vibration_tail', file: 'VIBRATION_SENSOR_1.stl', mat: sensorMaterials.vibration },
      { key: 'vibration_mid1', file: 'VIBRATION__1__1.stl', mat: sensorMaterials.vibration },
      { key: 'vibration_mid2', file: 'VIBRATION__2__1.stl', mat: sensorMaterials.vibration }
    ];

    sensorDefs.forEach((sd) => {
      loader.load(`/meshes/${sd.file}`, (geo) => {
        geo.scale(0.001, 0.001, 0.001);
        geo.computeVertexNormals();
        geo.computeBoundingBox();

        const mesh = new THREE.Mesh(geo, sd.mat);
        mesh.castShadow = true;
        mesh.name = sd.key;
        this.cadParts.add(mesh);
        this.sensorMeshes.set(sd.key, mesh);
      });
    });

    // Orient CAD model from Z-up to Three.js Y-up (Conveyor stands upright on its feet)
    this.conveyorAssembly.rotation.x = -Math.PI / 2;
  }

  centerAndFrameModel() {
    this.conveyorAssembly.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(this.conveyorAssembly);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    // Center horizontally
    this.conveyorAssembly.position.x -= center.x;
    this.conveyorAssembly.position.z -= center.z;

    // Rest on floor grid
    this.conveyorAssembly.updateMatrixWorld(true);
    const updatedBox = new THREE.Box3().setFromObject(this.conveyorAssembly);
    this.conveyorAssembly.position.y -= updatedBox.min.y;

    const finalBox = new THREE.Box3().setFromObject(this.conveyorAssembly);
    const finalCenter = finalBox.getCenter(new THREE.Vector3());

    this.controls.target.copy(finalCenter);

    // Balanced 3/4 Isometric Framing showing the entire upright conveyor
    const maxDim = Math.max(size.x, size.y, size.z, 1.0);
    this.camera.position.set(finalCenter.x - maxDim * 1.15, finalCenter.y + maxDim * 0.75, finalCenter.z + maxDim * 1.05);
    this.controls.update();
  }

  setupPrecisionLaserScanner() {
    // Locate the physical DEPTH_CAMERA_1 mesh
    const cameraMesh = this.sensorMeshes.get('damage_st01');
    if (!cameraMesh || !cameraMesh.geometry) return;

    if (!cameraMesh.geometry.boundingBox) {
      cameraMesh.geometry.computeBoundingBox();
    }

    cameraMesh.geometry.boundingBox.getCenter(this._tempVec);
    this._tempVec.applyMatrix4(cameraMesh.matrixWorld);
    const camPos = this._tempVec.clone();

    // The belt surface directly beneath the depth camera is approx 42mm below the lens
    const beltSurfaceY = camPos.y - 0.042;
    const halfWidth = 0.034; // 68mm belt width
    const apexY = camPos.y - 0.003;

    // 1. Triangular Volumetric Laser Fan (Keyence Optical Profilometer)
    // Vertices: Apex at lens, Left base on belt, Right base on belt
    const fanVertices = new Float32Array([
      // Front face
      camPos.x, apexY, camPos.z,
      camPos.x - halfWidth, beltSurfaceY, camPos.z,
      camPos.x + halfWidth, beltSurfaceY, camPos.z,
      // Back face
      camPos.x, apexY, camPos.z,
      camPos.x + halfWidth, beltSurfaceY, camPos.z,
      camPos.x - halfWidth, beltSurfaceY, camPos.z,
    ]);

    const fanGeo = new THREE.BufferGeometry();
    fanGeo.setAttribute('position', new THREE.BufferAttribute(fanVertices, 3));
    fanGeo.computeVertexNormals();

    const fanMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff, // Electric cyan laser light
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.laserSheet = new THREE.Mesh(fanGeo, fanMat);
    this.laserGroup.add(this.laserSheet);

    // 2. High-intensity Central Laser Core Beam
    const coreVertices = new Float32Array([
      camPos.x, apexY, camPos.z,
      camPos.x - halfWidth * 0.45, beltSurfaceY, camPos.z,
      camPos.x + halfWidth * 0.45, beltSurfaceY, camPos.z,
      camPos.x, apexY, camPos.z,
      camPos.x + halfWidth * 0.45, beltSurfaceY, camPos.z,
      camPos.x - halfWidth * 0.45, beltSurfaceY, camPos.z,
    ]);
    const coreGeo = new THREE.BufferGeometry();
    coreGeo.setAttribute('position', new THREE.BufferAttribute(coreVertices, 3));
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x99ffff,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const laserCore = new THREE.Mesh(coreGeo, coreMat);
    this.laserGroup.add(laserCore);

    // 3. Razor-Sharp Crimson Red Laser Scan Stripe on Belt Surface
    const stripePoints = [];
    const stripeSegments = 32;
    for (let i = 0; i <= stripeSegments; i++) {
      const frac = i / stripeSegments;
      const x = camPos.x - halfWidth + frac * (halfWidth * 2);
      // Subtle trough dip in center
      const dip = Math.pow((frac - 0.5) * 2, 2) * 0.0012;
      stripePoints.push(new THREE.Vector3(x, beltSurfaceY + 0.0006 - dip, camPos.z));
    }
    const stripeGeo = new THREE.BufferGeometry().setFromPoints(stripePoints);
    const stripeMat = new THREE.LineBasicMaterial({
      color: 0xff1744, // Glowing crimson optical laser line
      linewidth: 3
    });
    this.laserLine = new THREE.Line(stripeGeo, stripeMat);
    this.laserGroup.add(this.laserLine);

    // 4. Optical Lens Emitter Ring
    const lensRing = new THREE.Mesh(
      new THREE.RingGeometry(0.002, 0.005, 16),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff, side: THREE.DoubleSide })
    );
    lensRing.position.set(camPos.x, apexY, camPos.z);
    lensRing.rotation.x = Math.PI / 2;
    this.laserGroup.add(lensRing);

    // 5. 3D AI Defect Target Bracket (Appears on belt when anomaly detected)
    const targetGroup = new THREE.Group();
    targetGroup.position.set(camPos.x + 0.008, beltSurfaceY + 0.001, camPos.z);

    const boxGeo = new THREE.BoxGeometry(0.014, 0.002, 0.016);
    const boxEdges = new THREE.EdgesGeometry(boxGeo);
    const boxLine = new THREE.LineSegments(boxEdges, new THREE.LineBasicMaterial({ color: 0xffb700, linewidth: 2 }));
    targetGroup.add(boxLine);

    const ringPulse = new THREE.Mesh(
      new THREE.RingGeometry(0.006, 0.009, 16),
      new THREE.MeshBasicMaterial({ color: 0xff1744, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
    );
    ringPulse.rotation.x = -Math.PI / 2;
    targetGroup.add(ringPulse);

    this.laserTargetGroup = targetGroup;
    this.laserGroup.add(targetGroup);

    // 6. Synchronize Gazebo 3D Camera Sensor Pose
    this.updateGazeboCameraPose();
  }

  setupGazeboCamera(canvasElement) {
    if (!canvasElement) return;
    this.gazeboCanvas = canvasElement;

    try {
      this.gazeboRenderer = new THREE.WebGLRenderer({
        canvas: canvasElement,
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance'
      });
      this.gazeboRenderer.setSize(320, 175);
      this.gazeboRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.gazeboRenderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.gazeboRenderer.toneMappingExposure = 1.35;

      // Gazebo Optical Camera sensor (FOV 62°, near 0.005m, far 8.0m)
      this.gazeboCamera = new THREE.PerspectiveCamera(62, 320 / 175, 0.005, 8.0);
      this.gazeboCamera.name = 'GazeboCameraSensor';

      // Subtle Camera Optical Illumination Fill (low intensity to avoid scene blowout)
      this.gazeboLight = new THREE.SpotLight(0xffffff, 0.05, 1.5, Math.PI / 4, 0.85, 1.0);
      this.gazeboLight.position.set(0, 0, 0);
      this.gazeboCamera.add(this.gazeboLight);
      const lightTarget = new THREE.Object3D();
      lightTarget.position.set(0, 0, -1);
      this.gazeboCamera.add(lightTarget);
      this.gazeboLight.target = lightTarget;

      this.scene.add(this.gazeboCamera);
      this.currentGazeboPreset = 'overhead';
      this.updateGazeboCameraPose('overhead');
    } catch (e) {
      console.warn('[Ore Sentinels] Gazebo camera WebGL init error:', e);
    }
  }

  setGazeboCameraPreset(preset) {
    this.currentGazeboPreset = preset;
    this.updateGazeboCameraPose(preset);
  }

  updateGazeboCameraPose(preset = null) {
    if (!this.gazeboCamera) return;
    if (preset) this.currentGazeboPreset = preset;
    const mode = this.currentGazeboPreset || 'overhead';

    let camPos = new THREE.Vector3(0.0025, 0.1415, -0.5265);
    const cameraMesh = this.sensorMeshes?.get('damage_st01');
    if (cameraMesh && cameraMesh.geometry) {
      if (!cameraMesh.geometry.boundingBox) {
        cameraMesh.geometry.computeBoundingBox();
      }
      cameraMesh.geometry.boundingBox.getCenter(this._tempVec);
      this._tempVec.applyMatrix4(cameraMesh.matrixWorld);
      camPos.copy(this._tempVec);
    }

    if (mode === 'nadir') {
      // Direct Top-Down Profilometer Nadir View (looking straight down at laser line & belt carcass)
      this.gazeboCamera.position.set(camPos.x, camPos.y + 0.055, camPos.z);
      this.gazeboCamera.lookAt(camPos.x, camPos.y - 0.042, camPos.z);
    } else if (mode === 'discharge') {
      // Head Discharge Drum Gantry View (looking at coal tumbling off drive drum)
      this.gazeboCamera.position.set(-0.16, 0.32, 0.40);
      this.gazeboCamera.lookAt(0.0, 0.22, 0.535);
    } else if (mode === 'side') {
      // Catwalk Lateral Inspection View (looking across belt trough)
      this.gazeboCamera.position.set(-0.18, camPos.y + 0.02, camPos.z + 0.06);
      this.gazeboCamera.lookAt(camPos.x, camPos.y - 0.025, camPos.z);
    } else {
      // Overhead Conveyor Carry-Run View (Gazebo Camera mounted at DEPTH_CAMERA_1 bracket looking down the trough)
      this.gazeboCamera.position.set(camPos.x, camPos.y + 0.042, camPos.z - 0.035);
      this.gazeboCamera.lookAt(camPos.x, camPos.y - 0.036, camPos.z + 0.30);
    }
  }

  getSensorScreenPosition(sensorKey) {
    let mesh = this.sensorMeshes.get(sensorKey);
    if (!mesh && sensorKey === 'load_sensor_st01') mesh = this.sensorMeshes.get('thickness_st01');
    if (!mesh && sensorKey === 'thickness_st01') mesh = this.sensorMeshes.get('load_sensor_st01');
    if (!mesh || !mesh.geometry) return null;

    // True vertex bounding-box center in world space
    if (!mesh.geometry.boundingBox) {
      mesh.geometry.computeBoundingBox();
    }
    mesh.geometry.boundingBox.getCenter(this._tempVec);
    this._tempVec.applyMatrix4(mesh.matrixWorld);

    // Project to screen space
    this._tempVec.project(this.camera);

    const isBehind = this._tempVec.z > 1.0;
    const x = (this._tempVec.x * 0.5 + 0.5) * this.container.clientWidth;
    const y = (-(this._tempVec.y * 0.5) + 0.5) * this.container.clientHeight;

    return { x, y, isBehind };
  }

  setCameraPreset(preset) {
    if (!this.controls) return;
    const center = this.controls.target.clone();
    let targetPos = new THREE.Vector3();
    let targetLookAt = center.clone();

    switch (preset) {
      case 'drive_head':
        // Smooth view focused on Head Drive drum and motor
        targetPos.set(center.x - 0.65, center.y + 0.35, center.z - 0.55);
        targetLookAt.set(center.x, center.y + 0.1, center.z - 0.35);
        break;
      case 'tail_tension':
        // Gravity take-up / tension station in the middle
        targetPos.set(center.x - 0.65, center.y + 0.35, center.z + 0.55);
        targetLookAt.set(center.x, center.y + 0.1, center.z + 0.35);
        break;
      case 'intake_scanner':
        // Close-up cinematic view framing the Depth Camera & Laser Triangulation sheet
        const camMesh = this.sensorMeshes.get('damage_st01');
        if (camMesh) {
          const p = new THREE.Vector3();
          camMesh.geometry.boundingBox.getCenter(p);
          p.applyMatrix4(camMesh.matrixWorld);
          targetPos.set(p.x - 0.24, p.y + 0.12, p.z + 0.26);
          targetLookAt.set(p.x, p.y - 0.02, p.z);
        } else {
          targetPos.set(center.x - 0.45, center.y + 0.38, center.z + 0.65);
          targetLookAt.set(center.x, center.y + 0.15, center.z + 0.48);
        }
        break;
      case 'elevation':
        // Orthographic-feel side profile
        targetPos.set(center.x - 1.8, center.y + 0.15, center.z);
        targetLookAt.set(center.x, center.y + 0.15, center.z);
        break;
      case 'top':
        // Top-Down plan view
        targetPos.set(center.x, center.y + 1.9, center.z);
        targetLookAt.set(center.x, center.y + 0.1, center.z);
        break;
      case 'iso':
      default:
        // Full-gantry balanced isometric view
        targetPos.set(center.x - 1.7, center.y + 0.9, center.z + 1.3);
        targetLookAt.set(center.x, center.y + 0.15, center.z);
        break;
    }

    this.animateCameraTransition(targetPos, targetLookAt, 0.85);
  }

  animateCameraTransition(targetPos, targetLookAt, durationSec) {
    const startPos = this.camera.position.clone();
    const startLookAt = this.controls.target.clone();
    const startTime = performance.now();

    const updateFrame = () => {
      const elapsed = (performance.now() - startTime) / 1000;
      const progress = Math.min(elapsed / durationSec, 1.0);
      // Smooth cubic ease out
      const t = 1 - Math.pow(1 - progress, 3);

      this.camera.position.lerpVectors(startPos, targetPos, t);
      this.controls.target.lerpVectors(startLookAt, targetLookAt, t);

      if (progress < 1.0) {
        requestAnimationFrame(updateFrame);
      }
    };
    requestAnimationFrame(updateFrame);
  }

  focusOnWorker(workerId) {}

  startFollowCam(workerId) {}

  stopFollowCam() {}

  toggleSpin() {
    this.isSpinning = !this.isSpinning;
    return this.isSpinning;
  }

  setBeltSpeed(speedMps) {
    this.beltSpeed = speedMps;
  }

  setupEvents() {
    window.addEventListener('resize', () => {
      if (!this.container) return;
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    });
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const delta = Math.min(this.clock.getDelta(), 0.1);

    // 1. Kinematic Roller Rotation & Conveyor Belt Motion
    if (this.isSpinning) {
      if (this.rollerJoints.length > 0) {
        const rollerRadius = 0.03;
        const angularSpeed = (this.beltSpeed / rollerRadius) * delta;

        this.rollerJoints.forEach((rj) => {
          rj.pivot.rotateOnAxis(rj.axis, angularSpeed);
        });
      }

      // Synchronize procedural PBR textures along belt carcass
      if (this.cinematicTextures) {
        const uvSpeed = (this.beltSpeed / 1.06) * 0.12 * delta;
        this.cinematicTextures.beltAlbedoMap.offset.y -= uvSpeed;
        this.cinematicTextures.beltNormalMap.offset.y -= uvSpeed;
        this.cinematicTextures.beltRoughnessMap.offset.y -= uvSpeed;
      }
    }

    // 2. Precision Laser Profilometer Dynamics & Optical Speckle
    if (this.laserSheet && this.laserLine) {
      this.laserScanOffset += delta * 6.0;
      const pulse = 0.85 + 0.15 * Math.sin(this.laserScanOffset * 4.0);
      if (this.laserSheet.material) this.laserSheet.material.opacity = 0.38 * pulse;

      // Pulse the 3D AI target ring if present
      if (this.laserTargetGroup && this.laserTargetGroup.children.length > 1) {
        const ring = this.laserTargetGroup.children[1];
        const s = 1.0 + 0.3 * Math.sin(this.laserScanOffset * 3.0);
        ring.scale.set(s, s, s);
        ring.material.opacity = 0.5 + 0.4 * Math.cos(this.laserScanOffset * 3.0);
      }
    }

    // 3. Volumetric Bulk Coal Stream Transport
    if (this.coalStream && this.isSpinning) {
      this.coalStream.update(delta, this.beltSpeed);
    }

    // 5. Cinematic Autonomous Drone Patrol Tour Update
    if (this.droneTour && this.droneTour.isActive) {
      this.droneTour.update(delta);
    } else {
      this.controls.update();
    }

    // 6. Direct WebGL rendering (CPU-optimized, zero GPU post-processing passes)
    this.renderer.render(this.scene, this.camera);

    // 8. Render Gazebo 3D Camera Sensor Viewport (/conveyor/camera/image_raw)
    if (this.gazeboRenderer && this.gazeboCamera && this.gazeboCanvas && this.gazeboCanvas.style.display !== 'none') {
      this.gazeboRenderer.render(this.scene, this.gazeboCamera);
    }
  }

  toggleCrew(visible = null) {
    return false;
  }

  setCinematicMode(enabled) {
    this.isCinematicActive = !!enabled;
    if (this.postProcessor) {
      this.postProcessor.enabled = this.isCinematicActive;
    }
    return this.isCinematicActive;
  }

  setBloomEnabled(enabled, strength = 0.36) {
    if (this.postProcessor) {
      this.postProcessor.setBloom(enabled, strength);
    }
  }

  setVignetteEnabled(enabled) {
    if (this.postProcessor) {
      this.postProcessor.setVignette(enabled);
    }
  }

  setIBLEnabled(enabled) {
    if (this.postProcessor) {
      this.postProcessor.setIBLEnabled(enabled);
    }
  }

  setAtmosphereEnabled(enabled) {
    if (this.atmosphericDust) {
      this.atmosphericDust.setVisible(enabled);
    }
  }

  toggleStressHeatmap(enable = null) {
    if (enable === null) {
      this.isStressHeatmapActive = !this.isStressHeatmapActive;
    } else {
      this.isStressHeatmapActive = !!enable;
    }

    if (!this.model) return this.isStressHeatmapActive;

    this.model.traverse((child) => {
      if (child.isMesh && child.material) {
        if (!child.userData.originalMaterial) {
          child.userData.originalMaterial = child.material;
        }

        if (this.isStressHeatmapActive) {
          const posZ = child.position.z || 0;
          const stressVal = Math.abs(Math.sin(posZ * 5.0 + 1.2));
          let stressColor;
          if (stressVal > 0.72) {
            stressColor = 0xff1744; // High tension/friction stress
          } else if (stressVal > 0.40) {
            stressColor = 0xf59e0b; // Moderate dynamic load
          } else {
            stressColor = 0x00f0ff; // Nominal structural strain
          }
          child.material = new THREE.MeshStandardMaterial({
            color: stressColor,
            roughness: 0.35,
            metalness: 0.65,
            emissive: stressColor,
            emissiveIntensity: 0.28
          });
        } else {
          child.material = child.userData.originalMaterial;
        }
      }
    });

    return this.isStressHeatmapActive;
  }

  triggerSimulatedGouge(active) {
    if (this.laserTargetGroup) {
      this.laserTargetGroup.visible = !!active;
    }
    if (active) {
      if (!this.gougeMesh) {
        const gougeGeo = new THREE.BoxGeometry(0.016, 0.003, 0.038);
        const gougeMat = new THREE.MeshStandardMaterial({
          color: 0x110204,
          roughness: 0.9,
          emissive: 0xff1744,
          emissiveIntensity: 0.5
        });
        this.gougeMesh = new THREE.Mesh(gougeGeo, gougeMat);
        this.gougeMesh.position.set(0.008, 0.108, -0.526);
        this.scene.add(this.gougeMesh);
      }
      this.gougeMesh.visible = true;
    } else {
      if (this.gougeMesh) {
        this.gougeMesh.visible = false;
      }
    }
  }
}
