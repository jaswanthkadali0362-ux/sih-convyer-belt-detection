/**
 * beltXence Precision Industrial Spatial HUD
 * Curates the 6 primary stations in Overview mode (ABB Ability™ Standard)
 * to eliminate clutter while providing deep-dive telemetry on hover/click.
 */

export class SpatialHUD {
  constructor(conveyorScene, hudContainer, svgElement, onSensorClick) {
    this.scene = conveyorScene;
    this.container = hudContainer;
    this.svg = svgElement;
    this.onSensorClick = onSensorClick;

    this.calloutElements = new Map();
    this.lineElements = new Map();
    this.activeFilter = 'overview';

    // The 6 Primary Condition Monitoring Stations (ABB Screenshot Standard)
    this.primaryStations = new Set([
      'misalignment_st01',
      'thickness_st01',
      'load_sensor_st01',
      'speed_mid_02',
      'temp_bearing_01',
      'damage_st01'
    ]);

    // Refined proximity offsets (snug to equipment, zero collision across all viewing modes)
    this.offsets = {
      // Co-located Intake / Chute Sensors
      damage_st01:       { dx: 0,   dy: -55, label: 'Damage ST01' },
      load_sensor_st01:  { dx: 80,  dy: -38, label: 'Load ST01' },
      misalignment_st01: { dx: -78, dy: -42, label: 'Misalignment ST01' },
      thickness_st01:    { dx: 80,  dy: 26,  label: 'Thickness ST01' },

      // Tail Tension Drum Station (Left end of conveyor)
      speed_tail_01:     { dx: -95, dy: -10, label: 'Tail Drum Speed' },
      vibration_tail:    { dx: -95, dy: 26,  label: 'Tail Vibration' },

      // Mid-Conveyor Idler Stations (4-quadrant layout)
      speed_mid_02:      { dx: -65, dy: -24, label: 'Speed 02' },
      temp_bearing_01:   { dx: 65,  dy: -24, label: 'Temperature ST01' },
      vibration_mid1:    { dx: -50, dy: 24,  label: 'Idler 1 Vib' },
      vibration_mid2:    { dx: 50,  dy: 24,  label: 'Idler 2 Vib' },

      // Head Drive Station (Right end - 4-corner layout around motor & pulley)
      speed_head_drive:  { dx: 55,  dy: -28, label: 'Head Drive Speed' },
      vibration_head:    { dx: -48, dy: -28, label: 'Head Vibration' },
      current_motor_01:  { dx: 55,  dy: 24,  label: 'Motor Current' },
      misalignment_st02: { dx: -48, dy: 24,  label: 'Misalignment ST02' }
    };

    this.init();
  }

  init() {
    this.startTrackingLoop();
  }

  isKeyVisible(key) {
    if (this.activeFilter === 'all') return true;
    if (this.activeFilter === 'overview') return this.primaryStations.has(key);
    if (this.activeFilter === 'tracking') return key.includes('misalignment') || key.includes('thickness') || key.includes('load');
    if (this.activeFilter === 'drivetrain') return key.includes('speed') || key.includes('current');
    if (this.activeFilter === 'vibration') return key.includes('vibration') || key.includes('temp');
    if (this.activeFilter === 'vision') return key.includes('damage');
    return false;
  }

  setFilter(filterMode) {
    this.activeFilter = filterMode;
    this.calloutElements.forEach((callout, key) => {
      const line = this.lineElements.get(key);
      const isVisible = this.isKeyVisible(key);

      callout.dataset.filtered = isVisible ? 'true' : 'false';
      if (!isVisible) {
        callout.style.opacity = '0';
        callout.style.pointerEvents = 'none';
        if (line) {
          line.path.style.opacity = '0';
          line.dot.style.opacity = '0';
        }
      }
    });
  }

  createOrUpdateCallout(key, sensorData) {
    let callout = this.calloutElements.get(key);
    let line = this.lineElements.get(key);
    const meta = this.offsets[key] || { dx: 0, dy: -45, label: sensorData.tag || key };

    if (!callout) {
      callout = document.createElement('div');
      callout.className = 'hud-pill-badge';
      callout.dataset.sensorKey = key;
      const isVisible = this.isKeyVisible(key);
      callout.dataset.filtered = isVisible ? 'true' : 'false';
      if (!isVisible) {
        callout.style.opacity = '0';
        callout.style.pointerEvents = 'none';
      }

      callout.innerHTML = `
        <div class="hud-pill-row">
          <span class="status-dot ${sensorData.status || 'normal'}"></span>
          <span class="hud-pill-title">${meta.label}</span>
          <span class="hud-pill-val val-text">${sensorData.val}</span>
          <span class="hud-pill-unit">${sensorData.unit}</span>
        </div>
      `;

      callout.addEventListener('click', () => {
        if (this.onSensorClick) {
          this.onSensorClick(key, sensorData);
        }
      });

      this.container.appendChild(callout);
      this.calloutElements.set(key, callout);

      // SVG Leader Line
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      path.setAttribute('class', 'hud-leader-line');
      if (!isVisible) path.style.opacity = '0';

      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('class', 'hud-anchor-dot');
      dot.setAttribute('r', '2.5');
      if (!isVisible) dot.style.opacity = '0';

      this.svg.appendChild(path);
      this.svg.appendChild(dot);

      line = { path, dot };
      this.lineElements.set(key, line);
    } else {
      const valText = callout.querySelector('.val-text');
      if (valText && valText.textContent !== String(sensorData.val)) {
        valText.textContent = sensorData.val;
      }

      const dot = callout.querySelector('.status-dot');
      if (dot) {
        dot.className = `status-dot ${sensorData.status || 'normal'}`;
      }
    }
  }

  updateAllSensors(sensorsMap) {
    for (const [key, data] of Object.entries(sensorsMap)) {
      this.createOrUpdateCallout(key, data);
    }
  }

  updatePositions() {
    this.calloutElements.forEach((callout, key) => {
      const line = this.lineElements.get(key);

      if (callout.dataset.filtered === 'false') {
        callout.style.opacity = '0';
        callout.style.pointerEvents = 'none';
        if (line) {
          line.path.style.opacity = '0';
          line.dot.style.opacity = '0';
        }
        return;
      }

      const screenPos = this.scene.getSensorScreenPosition(key);

      if (!screenPos || screenPos.isBehind) {
        callout.style.opacity = '0';
        callout.style.pointerEvents = 'none';
        if (line) {
          line.path.style.opacity = '0';
          line.dot.style.opacity = '0';
        }
        return;
      }

      const offset = this.offsets[key] || { dx: 0, dy: -45 };
      const cardX = screenPos.x + offset.dx;
      const cardY = screenPos.y + offset.dy;

      // Position badge
      callout.style.left = `${cardX}px`;
      callout.style.top = `${cardY}px`;
      callout.style.opacity = '1';
      callout.style.pointerEvents = 'auto';

      // Update Leader Line
      if (line) {
        line.path.setAttribute('x1', screenPos.x);
        line.path.setAttribute('y1', screenPos.y);
        line.path.setAttribute('x2', cardX);
        line.path.setAttribute('y2', cardY);
        line.path.style.opacity = '0.75';

        line.dot.setAttribute('cx', screenPos.x);
        line.dot.setAttribute('cy', screenPos.y);
        line.dot.style.opacity = '1';
      }
    });
  }

  startTrackingLoop() {
    const track = () => {
      this.updatePositions();
      requestAnimationFrame(track);
    };
    requestAnimationFrame(track);
  }
}
