/**
 * beltXence Cinematic Drone Inspection Tour
 * Smooth automated 3D drone patrol flight visiting key conveyor stations
 * with cinematic letterbox telemetry and voice/acoustics.
 */

export class CinematicDroneTour {
  constructor(conveyorScene, soundEngine = null) {
    this.scene = conveyorScene;
    this.soundEngine = soundEngine;
    this.isActive = false;
    this.waypoints = [];
    this.currentWaypointIndex = 0;
    this.transitionProgress = 0;
    this.waypointHoldTimer = 0;
    this.holdDuration = 4.2; // seconds to pause at each inspection station
    this.transitionDuration = 3.5; // seconds to fly smoothly between stations
    this.osdElement = null;
    this.savedCameraState = null;

    this.initWaypoints();
    this.createOSD();
  }

  initWaypoints() {
    this.waypoints = [
      {
        id: 'drive_motor',
        title: 'STATION 01 // DRIVE MOTOR & HIGH-TORQUE STATOR',
        stationTag: 'HEAD DRIVE GANTRY',
        desc: 'Inspecting stator coil core thermals (45.7°C) & roller bearing vibration harmonics.',
        pos: { x: -0.68, y: 0.38, z: -0.62 },
        lookAt: { x: -0.12, y: 0.18, z: -0.52 },
        altitude: '1.24 m',
        bearing: '048°',
        zoom: '2.1x'
      },
      {
        id: 'laser_vision',
        title: 'STATION 02 // KEYENCE OPTICAL LASER PROFILOMETER',
        stationTag: 'MACHINE VISION GANTRY',
        desc: 'Dual-beam laser triangulation profiling vulcanized rubber cover thickness across 80 spatial points.',
        pos: { x: -0.22, y: 0.32, z: -0.42 },
        lookAt: { x: 0.002, y: 0.16, z: -0.52 },
        altitude: '1.05 m',
        bearing: '092°',
        zoom: '2.8x'
      },
      {
        id: 'bulk_coal',
        title: 'STATION 03 // VOLUMETRIC BULK COAL STREAM',
        stationTag: 'CARRY-STRAND TROUGH',
        desc: 'Kinematic coal rock bed moving smoothly with belt carcass. Zero spillage drift detected.',
        pos: { x: -0.48, y: 0.40, z: 0.08 },
        lookAt: { x: 0.00, y: 0.20, z: 0.15 },
        altitude: '1.32 m',
        bearing: '135°',
        zoom: '1.8x'
      },
      {
        id: 'crew_catwalk',
        title: 'STATION 04 // RELIABILITY PATROL CREW CATWALK',
        stationTag: 'SAFETY & MAINTENANCE WALKWAY',
        desc: 'Active reliability crew inspecting idler bearings, pull-cords, and tracking sensors.',
        pos: { x: -0.38, y: 0.26, z: -0.14 },
        lookAt: { x: -0.14, y: 0.14, z: -0.14 },
        altitude: '0.88 m',
        bearing: '180°',
        zoom: '1.5x'
      },
      {
        id: 'tail_takeup',
        title: 'STATION 05 // GRAVITY TAKE-UP TENSIONER & TAIL DRUM',
        stationTag: 'TAIL RETURN SECTION',
        desc: 'Hydraulic tensioner counterweight maintaining optimal 24.5 kN carcass tension and return strand alignment.',
        pos: { x: 0.52, y: 0.35, z: 0.62 },
        lookAt: { x: 0.00, y: 0.16, z: 0.50 },
        altitude: '1.15 m',
        bearing: '284°',
        zoom: '1.9x'
      }
    ];
  }

  createOSD() {
    this.osdElement = document.getElementById('drone-tour-osd');
    if (!this.osdElement) {
      this.osdElement = document.createElement('div');
      this.osdElement.id = 'drone-tour-osd';
      this.osdElement.className = 'drone-tour-osd';
      this.osdElement.style.display = 'none';
      document.body.appendChild(this.osdElement);
    }
  }

  start() {
    if (this.isActive || !this.scene || !this.scene.camera) return;
    this.isActive = true;

    // Save previous camera and controls position
    this.savedCameraState = {
      pos: this.scene.camera.position.clone(),
      target: this.scene.controls ? this.scene.controls.target.clone() : null
    };

    // Disable manual orbit controls temporarily
    if (this.scene.controls) {
      this.scene.controls.enabled = false;
    }

    this.currentWaypointIndex = 0;
    this.transitionProgress = 0;
    this.waypointHoldTimer = 0;

    if (this.soundEngine) {
      this.soundEngine.playClick();
    }

    this.renderOSD();
    this.osdElement.style.display = 'block';

    // Keyboard ESC listener to exit tour
    this._escHandler = (e) => {
      if (e.key === 'Escape') this.stop();
    };
    window.addEventListener('keydown', this._escHandler);

    window.dispatchEvent(new CustomEvent('drone-tour-started'));
  }

  stop() {
    if (!this.isActive) return;
    this.isActive = false;

    if (this.osdElement) {
      this.osdElement.style.display = 'none';
    }

    // Re-enable manual orbit controls
    if (this.scene.controls) {
      this.scene.controls.enabled = true;
      if (this.savedCameraState && this.savedCameraState.target) {
        this.scene.controls.target.copy(this.savedCameraState.target);
      }
    }

    if (this.savedCameraState && this.savedCameraState.pos) {
      this.scene.camera.position.copy(this.savedCameraState.pos);
    }

    if (this._escHandler) {
      window.removeEventListener('keydown', this._escHandler);
      this._escHandler = null;
    }

    if (this.soundEngine) {
      this.soundEngine.playClick();
    }

    window.dispatchEvent(new CustomEvent('drone-tour-stopped'));
  }

  toggle() {
    if (this.isActive) {
      this.stop();
      return false;
    } else {
      this.start();
      return true;
    }
  }

  update(dt) {
    if (!this.isActive || !this.scene || !this.scene.camera) return;

    const currentWp = this.waypoints[this.currentWaypointIndex];
    const nextIndex = (this.currentWaypointIndex + 1) % this.waypoints.length;
    const nextWp = this.waypoints[nextIndex];

    if (this.transitionProgress < 1.0) {
      // In flight between waypoints
      this.transitionProgress += dt / this.transitionDuration;
      const t = Math.min(this.transitionProgress, 1.0);
      // Smooth cubic smoothstep
      const easeT = t * t * (3 - 2 * t);

      // Lerp position
      const fromPos = this.currentWaypointIndex === 0 && this.waypointHoldTimer === 0
        ? this.savedCameraState.pos
        : this.waypoints[(this.currentWaypointIndex - 1 + this.waypoints.length) % this.waypoints.length].pos;

      const toPos = currentWp.pos;

      this.scene.camera.position.x = fromPos.x + (toPos.x - fromPos.x) * easeT;
      this.scene.camera.position.y = fromPos.y + (toPos.y - fromPos.y) * easeT + Math.sin(t * Math.PI) * 0.04;
      this.scene.camera.position.z = fromPos.z + (toPos.z - fromPos.z) * easeT;

      // Lerp target
      const fromTarget = this.currentWaypointIndex === 0 && this.waypointHoldTimer === 0
        ? (this.savedCameraState.target || { x: 0, y: 0.16, z: 0 })
        : this.waypoints[(this.currentWaypointIndex - 1 + this.waypoints.length) % this.waypoints.length].lookAt;

      const toTarget = currentWp.lookAt;

      const tx = fromTarget.x + (toTarget.x - fromTarget.x) * easeT;
      const ty = fromTarget.y + (toTarget.y - fromTarget.y) * easeT;
      const tz = fromTarget.z + (toTarget.z - fromTarget.z) * easeT;

      this.scene.camera.lookAt(tx, ty, tz);
      if (this.scene.controls) this.scene.controls.target.set(tx, ty, tz);

      if (this.transitionProgress >= 1.0) {
        this.waypointHoldTimer = 0;
        this.updateOSDStation(currentWp);
        if (this.soundEngine) this.soundEngine.playLaserPing();
      }
    } else {
      // Hovering & inspecting at current waypoint with subtle drone drift
      this.waypointHoldTimer += dt;
      const hoverTime = performance.now() * 0.0015;

      const driftX = Math.sin(hoverTime * 1.4) * 0.012;
      const driftY = Math.cos(hoverTime * 1.8) * 0.008;
      const driftZ = Math.sin(hoverTime * 1.1) * 0.012;

      this.scene.camera.position.set(
        currentWp.pos.x + driftX,
        currentWp.pos.y + driftY,
        currentWp.pos.z + driftZ
      );

      this.scene.camera.lookAt(currentWp.lookAt.x, currentWp.lookAt.y, currentWp.lookAt.z);
      if (this.scene.controls) {
        this.scene.controls.target.set(currentWp.lookAt.x, currentWp.lookAt.y, currentWp.lookAt.z);
      }

      if (this.waypointHoldTimer >= this.holdDuration) {
        // Move to next waypoint
        this.currentWaypointIndex = nextIndex;
        this.transitionProgress = 0;
        this.updateOSDStation(this.waypoints[this.currentWaypointIndex]);
      }
    }
  }

  renderOSD() {
    if (!this.osdElement) return;
    const wp = this.waypoints[this.currentWaypointIndex];

    this.osdElement.innerHTML = `
      <!-- Top Letterbox Bar -->
      <div class="drone-letterbox top">
        <div class="drone-telemetry-left">
          <span class="drone-rec-pulse"></span>
          <span class="drone-tag">DRONE AUTONOMOUS RECONNAISSANCE // SURVEILLANCE PATROL</span>
          <span class="drone-station-badge" id="drone-station-badge">${wp.stationTag}</span>
        </div>
        <div class="drone-telemetry-right">
          <span class="drone-metric">ALT: <strong id="drone-alt-val">${wp.altitude}</strong></span>
          <span class="drone-metric">BRG: <strong id="drone-brg-val">${wp.bearing}</strong></span>
          <span class="drone-metric">ZOOM: <strong id="drone-zoom-val">${wp.zoom}</strong></span>
          <button id="btn-drone-exit" class="drone-exit-btn" title="Exit Drone Tour (ESC)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            EXIT PATROL
          </button>
        </div>
      </div>

      <!-- Center Optical Crosshair Reticle -->
      <div class="drone-center-reticle">
        <div class="reticle-corner tl"></div>
        <div class="reticle-corner tr"></div>
        <div class="reticle-corner bl"></div>
        <div class="reticle-corner br"></div>
        <div class="reticle-crosshair"></div>
      </div>

      <!-- Bottom Letterbox Bar -->
      <div class="drone-letterbox bottom">
        <div class="drone-station-info">
          <div class="drone-station-step" id="drone-station-step">WAYPOINT ${this.currentWaypointIndex + 1} OF ${this.waypoints.length}</div>
          <div class="drone-station-title" id="drone-station-title">${wp.title}</div>
          <div class="drone-station-desc" id="drone-station-desc">${wp.desc}</div>
        </div>
        <div class="drone-controls-hint">
          <span>Press <strong>ESC</strong> or click <strong>EXIT</strong> to return to manual 3D view</span>
        </div>
      </div>
    `;

    const exitBtn = this.osdElement.querySelector('#btn-drone-exit');
    if (exitBtn) {
      exitBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.stop();
      });
    }
  }

  updateOSDStation(wp) {
    if (!this.osdElement || !this.isActive) return;

    const badge = this.osdElement.querySelector('#drone-station-badge');
    const step = this.osdElement.querySelector('#drone-station-step');
    const title = this.osdElement.querySelector('#drone-station-title');
    const desc = this.osdElement.querySelector('#drone-station-desc');
    const alt = this.osdElement.querySelector('#drone-alt-val');
    const brg = this.osdElement.querySelector('#drone-brg-val');
    const zoom = this.osdElement.querySelector('#drone-zoom-val');

    if (badge) badge.textContent = wp.stationTag;
    if (step) step.textContent = `WAYPOINT ${this.currentWaypointIndex + 1} OF ${this.waypoints.length}`;
    if (title) title.textContent = wp.title;
    if (desc) desc.textContent = wp.desc;
    if (alt) alt.textContent = wp.altitude;
    if (brg) brg.textContent = wp.bearing;
    if (zoom) zoom.textContent = wp.zoom;
  }
}
