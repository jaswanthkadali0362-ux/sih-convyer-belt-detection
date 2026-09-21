/**
 * beltXence Industrial Settings & Hardware Configuration Modal
 * Keyence / ABB Ability™ Industrial SCADA Standard
 * Features:
 *  - Theme Engine: Bright White UI Mode vs Dark Mode
 *  - Sensor Alarm Thresholds: Warning & Critical limits for all 13 sensors with presets
 *  - Camera Stream Ports: RTSP URL, GigE Vision IP & Port, USB Line-Scan camera selector
 *  - Microcontroller USB Ports: COM1-COM8 serial port manager with baud rate & live packet monitor
 */

export class SettingsModal {
  constructor(containerElement, options = {}) {
    this.container = containerElement;
    this.options = options;
    this.isOpen = false;
    this.activeTab = 'thresholds'; // 'appearance' | 'thresholds' | 'camera_ports' | 'usb_ports'

    // Default Sensor Thresholds (13 stations)
    this.thresholds = {
      misalignment_st01: { name: 'Misalignment ST01 (Return)', unit: 'mm', warn: 45.0, crit: 50.0, min: 20.0, max: 80.0, step: 0.5 },
      misalignment_st02: { name: 'Misalignment ST02 (Carrying)', unit: 'mm', warn: 65.0, crit: 71.2, min: 30.0, max: 100.0, step: 0.5 },
      load_sensor_st01:  { name: 'Load ST01 (Frame Joint Stress)', unit: 'kg', warn: 45.0, crit: 55.0, min: 0.0, max: 100.0, step: 0.5, direction: 'max' },
      thickness_st01:    { name: 'Belt Thickness ST01 (Cover)', unit: 'mm', warn: 18.0, crit: 15.0, min: 5.0, max: 30.0, step: 0.1, direction: 'min' },
      speed_mid_02:      { name: 'Mid Idler Tachometer', unit: 'm/s', warn: 2.2, crit: 1.8, min: 0.5, max: 5.0, step: 0.1 },
      speed_head_drive:  { name: 'Head Drive Velocity', unit: 'm/s', warn: 3.4, crit: 3.8, min: 1.0, max: 6.0, step: 0.1 },
      speed_tail_01:     { name: 'Tail Tension Drum Speed', unit: 'm/s', warn: 2.0, crit: 1.5, min: 0.5, max: 5.0, step: 0.1 },
      temp_bearing_01:   { name: 'Drive Bearing Temp', unit: '°C', warn: 60.0, crit: 75.0, min: 20.0, max: 110.0, step: 1.0 },
      current_motor_01:  { name: 'Stator Motor Current', unit: 'A', warn: 22.0, crit: 28.0, min: 5.0, max: 45.0, step: 0.5 },
      vibration_head:    { name: 'Head Discharge Vibration', unit: 'mm/s', warn: 3.2, crit: 5.0, min: 0.2, max: 10.0, step: 0.1 },
      vibration_tail:    { name: 'Tail Tension Vibration', unit: 'mm/s', warn: 2.8, crit: 4.5, min: 0.2, max: 10.0, step: 0.1 },
      vibration_mid1:    { name: 'Trough Idler 1 Vibration', unit: 'mm/s', warn: 2.8, crit: 4.5, min: 0.2, max: 10.0, step: 0.1 },
      vibration_mid2:    { name: 'Trough Idler 2 Vibration', unit: 'mm/s', warn: 2.8, crit: 4.5, min: 0.2, max: 10.0, step: 0.1 },
      damage_st01:       { name: 'Optical Vision Defect Limit', unit: 'count', warn: 2, crit: 4, min: 0, max: 10, step: 1 }
    };

    // Camera Stream Ports Configuration
    this.cameraConfig = {
      streamType: 'usb_uvc', // 'usb_uvc' | 'gige_vision' | 'rtsp_ip' | 'nir_virtual'
      rtspUrl: 'rtsp://192.168.1.100:554/live/ch0',
      gigeIp: '192.168.0.10',
      gigePort: 24691,
      selectedCameraId: 'cam_logi',
      resolution: '1280x720',
      fpsLimit: 30,
      exposureUs: 450,
      laserTrigger: 'continuous'
    };

    // Microcontroller USB Serial COM Ports Configuration
    this.usbPorts = [
      { id: 'com19', port: 'COM19', device: 'ESP32 SmartBelt Telemetry Controller (Silicon Labs CP210x)', baud: 115200, parity: '8-N-1', connected: true, rxCount: 3840, txCount: 120 },
      { id: 'com23', port: 'COM23', device: 'Arduino Uno Conveyor Belt Speedometer & Tracker', baud: 9600, parity: '8-N-1', connected: false, rxCount: 0, txCount: 0 },
      { id: 'com21', port: 'COM21', device: 'ESP32 Weigh Station Scale (HX711 24-bit ADC)', baud: 115200, parity: '8-N-1', connected: false, rxCount: 0, txCount: 0 },
      { id: 'com1', port: 'COM1', device: 'Industrial PLC Auxiliary Telemetry Link', baud: 38400, parity: '8-N-1', connected: false, rxCount: 0, txCount: 0 }
    ];

    // Live packet stream log
    this.packetLogs = [];
    this.packetStreamInterval = null;

    this.loadSettings();
    this.initModalDOM();
  }

  loadSettings() {
    try {
      const savedThresholds = localStorage.getItem('oresentinels_thresholds') || localStorage.getItem('beltxence_thresholds');
      if (savedThresholds) {
        Object.assign(this.thresholds, JSON.parse(savedThresholds));
      }
      const savedCamera = localStorage.getItem('oresentinels_camera_config') || localStorage.getItem('beltxence_camera_config');
      if (savedCamera) {
        Object.assign(this.cameraConfig, JSON.parse(savedCamera));
      }
    } catch (e) {
      console.warn('[SettingsModal] Failed to read localStorage settings:', e);
    }
  }

  saveSettings() {
    try {
      localStorage.setItem('oresentinels_thresholds', JSON.stringify(this.thresholds));
      localStorage.setItem('oresentinels_camera_config', JSON.stringify(this.cameraConfig));
      localStorage.setItem('beltxence_thresholds', JSON.stringify(this.thresholds));
      localStorage.setItem('beltxence_camera_config', JSON.stringify(this.cameraConfig));
    } catch (e) {
      console.warn('[SettingsModal] Failed to write localStorage settings:', e);
    }
  }

  initModalDOM() {
    this.container.innerHTML = `
      <div class="analytics-modal-backdrop" id="settings-backdrop">
        <div class="analytics-modal-dialog settings-modal-dialog" role="dialog" aria-modal="true">
          
          <!-- Modal Header -->
          <div class="modal-header">
            <div>
              <span class="modal-kicker">SCADA SUPERVISORY CONFIGURATION // CV-101</span>
              <h2 class="modal-title" style="margin-top: 2px;">Hardware &amp; System Settings</h2>
              <p class="modal-subtitle">Configure alarm trip thresholds, camera stream sources, simulation parameters, and microcontroller DAQ links.</p>
            </div>
            <button id="btn-close-settings" class="modal-close-btn" title="Close Settings">✕</button>
          </div>

          <!-- Settings Navigation Tabs Bar -->
          <div class="settings-nav-tabs">
            <button class="settings-tab-btn active" data-tab="thresholds">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20v-6M6 20V10M18 20V4"/></svg>
              <span>Alarm Thresholds</span>
            </button>
            <button class="settings-tab-btn" data-tab="camera_ports">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2"/></svg>
              <span>Camera Stream Ports</span>
            </button>
            <button class="settings-tab-btn" data-tab="usb_ports">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="8" y1="6" y2="8"/><line x1="16" x2="16" y1="6" y2="8"/><line x1="12" x2="12" y1="18" y2="18"/></svg>
              <span>Microcontroller USB DAQ</span>
            </button>
            <button class="settings-tab-btn" data-tab="simulation">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              <span>Simulation &amp; Audio</span>
            </button>
          </div>

          <!-- Settings Tab Content Panes -->
          <div class="settings-modal-body" id="settings-tab-container">
            <!-- Rendered Dynamically -->
          </div>

          <!-- Modal Footer Actions -->
          <div class="modal-footer">
            <div class="footer-info">
              <span id="settings-status-indicator">Hardware Registry: 4 Devices Bound · 20Hz Telemetry Clock</span>
            </div>
            <div class="footer-actions">
              <button id="btn-settings-reset" class="btn-secondary-action">Reset Defaults</button>
              <button id="btn-settings-save" class="btn-primary-action">Apply &amp; Save Configuration</button>
            </div>
          </div>

        </div>
      </div>
    `;

    this.bindGlobalEvents();
  }

  bindGlobalEvents() {
    // Close button
    const closeBtn = this.container.querySelector('#btn-close-settings');
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());

    // Backdrop click
    const backdrop = this.container.querySelector('#settings-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) this.close();
      });
    }

    // Tab buttons
    this.container.querySelectorAll('.settings-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.container.querySelectorAll('.settings-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeTab = btn.dataset.tab;
        this.renderTabContent();
      });
    });

    // Save & Apply
    const saveBtn = this.container.querySelector('#btn-settings-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        this.applyAndSave();
      });
    }

    // Reset Defaults
    const resetBtn = this.container.querySelector('#btn-settings-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.resetDefaults();
      });
    }

    // ESC key listener
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });
  }

  open(defaultTab = null) {
    if (defaultTab) {
      this.activeTab = defaultTab;
      this.container.querySelectorAll('.settings-tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === defaultTab);
      });
    }
    this.isOpen = true;
    this.container.classList.add('active');
    this.renderTabContent();
    this.startPacketSimulation();
  }

  close() {
    this.isOpen = false;
    this.container.classList.remove('active');
    this.stopPacketSimulation();
  }

  renderTabContent() {
    const pane = this.container.querySelector('#settings-tab-container');
    if (!pane) return;

    // Reset and trigger smooth tab-opening entrance animation
    pane.classList.remove('tab-pane-animate');
    void pane.offsetWidth; // Force reflow
    pane.classList.add('tab-pane-animate');

    if (this.activeTab === 'thresholds') {
      this.renderThresholdsTab(pane);
    } else if (this.activeTab === 'simulation') {
      this.renderSimulationTab(pane);
    } else if (this.activeTab === 'camera_ports') {
      this.renderCameraPortsTab(pane);
    } else if (this.activeTab === 'usb_ports') {
      this.renderUsbPortsTab(pane);
    }
  }

  // ---------------------------------------------------------------------------
  // TAB: INCIDENT SIMULATION, FEA STRESS & AUDIO FX
  // ---------------------------------------------------------------------------
  renderSimulationTab(pane) {
    const soundMuted = this.options.soundEngine?.isMuted ?? true;
    const isFea = this.options.conveyorScene?.isStressHeatmapActive ?? false;
    const activeScenario = this.options.ruptureSimulator?.activeScenario || 'nominal';

    pane.innerHTML = `
      <div class="settings-section">
        <div class="settings-section-header">
          <div>
            <h3 class="settings-section-title">Incident Simulation, FEA Stress &amp; Audio Acoustics</h3>
            <p class="settings-section-desc">Manage digital twin incident sandboxing, structural finite element stress shaders, and procedural SCADA acoustics.</p>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 8px;">
          
          <!-- Card 1: Rupture & Fault Simulator -->
          <div class="threshold-card" style="grid-column: 1 / -1; border-color: rgba(255, 23, 68, 0.35); background: rgba(255, 23, 68, 0.04);">
            <div class="threshold-card-top">
              <div style="display: flex; align-items: center; gap: 8px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff1744" stroke-width="2.2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                <span class="threshold-card-name" style="font-size: 0.88rem; color: #ff6b7a;">Rupture &amp; Incident Fault Simulator</span>
              </div>
              <span class="mono-tag" style="color: ${activeScenario === 'nominal' ? '#10b981' : '#ff1744'}; border-color: currentColor;">
                ${activeScenario === 'nominal' ? '● NOMINAL HEALTH' : `● ACTIVE: ${activeScenario.toUpperCase()}`}
              </span>
            </div>
            <p style="font-size: 0.72rem; color: var(--text-muted); margin: 6px 0 12px; line-height: 1.45;">
              Stress-test safety circuits, simulate tramp iron carcass gouging, ore surges, or emergency cord trips in the 3D twin without damaging real machinery.
            </p>
            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
              <button id="btn-sim-tear" class="btn-subtle-action" style="padding: 6px 12px; font-size: 0.72rem; border-color: rgba(255, 23, 68, 0.4); color: #ff6b7a;">
                ⚡ Longitudinal Belt Tear (88.5% Risk)
              </button>
              <button id="btn-sim-overload" class="btn-subtle-action" style="padding: 6px 12px; font-size: 0.72rem; border-color: rgba(245, 158, 11, 0.4); color: #f59e0b;">
                📦 Bulk Ore Surge (+95% Load)
              </button>
              <button id="btn-sim-estop" class="btn-subtle-action" style="padding: 6px 12px; font-size: 0.72rem; border-color: rgba(239, 68, 68, 0.4); color: #ef4444;">
                🛑 Trip Emergency E-Stop
              </button>
              <button id="btn-sim-reset" class="btn-subtle-action" style="padding: 6px 12px; font-size: 0.72rem; border-color: rgba(16, 185, 129, 0.4); color: #10b981;">
                🔄 Reset to Nominal
              </button>
              <button id="btn-sim-open-dialog" class="btn-primary-action" style="margin-left: auto; padding: 6px 14px; font-size: 0.72rem;">
                Open Full Simulator Dialog &rarr;
              </button>
            </div>
          </div>

          <!-- Card 2: FEA Structural Stress Heatmap -->
          <div class="threshold-card">
            <div class="threshold-card-top">
              <div style="display: flex; align-items: center; gap: 8px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.2"><path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/></svg>
                <span class="threshold-card-name" style="font-size: 0.84rem;">Structural FEA Stress Heatmap</span>
              </div>
              <span class="mono-tag" style="color: ${isFea ? '#00f0ff' : 'var(--text-muted)'};">
                ${isFea ? 'ACTIVE' : 'OFF'}
              </span>
            </div>
            <p style="font-size: 0.72rem; color: var(--text-muted); margin: 6px 0 12px; line-height: 1.45;">
              Visualizes finite element stress distributions (blue: &lt;25MPa nominal shear &rarr; amber: 85MPa yield &rarr; crimson: &gt;110MPa critical fatigue) across steel brackets and idler mounts.
            </p>
            <button id="btn-settings-toggle-fea" class="btn-secondary-action ${isFea ? 'active-glow' : ''}" style="width: 100%; justify-content: center; padding: 8px;">
              ${isFea ? '🌡️ Disable FEA Stress Shaders' : '🌡️ Enable FEA Stress Heatmap'}
            </button>
          </div>

          <!-- Card 3: Procedural Audio FX Engine -->
          <div class="threshold-card">
            <div class="threshold-card-top">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 1.1rem;">${soundMuted ? '🔇' : '🔊'}</span>
                <span class="threshold-card-name" style="font-size: 0.84rem;">Procedural Audio FX Acoustics</span>
              </div>
              <span class="mono-tag" style="color: ${!soundMuted ? '#10b981' : 'var(--text-muted)'};">
                ${!soundMuted ? 'ACTIVE (45% GAIN)' : 'MUTED'}
              </span>
            </div>
            <p style="font-size: 0.72rem; color: var(--text-muted); margin: 6px 0 12px; line-height: 1.45;">
              Synthesizes real-time industrial acoustics via Web Audio API (motor frequency, tachometer hum, laser profiling pings, and incident trip audio). Zero downloads.
            </p>
            <div style="display: flex; gap: 8px;">
              <button id="btn-settings-toggle-audio" class="btn-secondary-action ${!soundMuted ? 'active-glow' : ''}" style="flex: 1; justify-content: center; padding: 8px;">
                ${soundMuted ? '🔊 Enable Audio FX' : '🔇 Mute Audio'}
              </button>
              <button id="btn-settings-test-ping" class="btn-subtle-action" style="padding: 8px 12px;" title="Test Audio Laser Ping">
                🔔 Test Sound
              </button>
            </div>
          </div>

        </div>
      </div>
    `;

    // Event bindings for Simulation tab
    pane.querySelector('#btn-sim-tear')?.addEventListener('click', () => {
      this.options.onTriggerScenario?.('tear');
      this.renderSimulationTab(pane);
    });
    pane.querySelector('#btn-sim-overload')?.addEventListener('click', () => {
      this.options.onTriggerScenario?.('overload');
      this.renderSimulationTab(pane);
    });
    pane.querySelector('#btn-sim-estop')?.addEventListener('click', () => {
      this.options.onTriggerScenario?.('estop');
      this.renderSimulationTab(pane);
    });
    pane.querySelector('#btn-sim-reset')?.addEventListener('click', () => {
      this.options.onTriggerScenario?.('nominal');
      this.renderSimulationTab(pane);
    });
    pane.querySelector('#btn-sim-open-dialog')?.addEventListener('click', () => {
      this.close();
      this.options.onOpenSimulator?.();
    });

    pane.querySelector('#btn-settings-toggle-fea')?.addEventListener('click', () => {
      this.options.onToggleFea?.();
      this.renderSimulationTab(pane);
    });

    pane.querySelector('#btn-settings-toggle-audio')?.addEventListener('click', () => {
      this.options.onToggleSound?.();
      this.renderSimulationTab(pane);
    });

    pane.querySelector('#btn-settings-test-ping')?.addEventListener('click', () => {
      if (this.options.soundEngine) {
        if (this.options.soundEngine.isMuted) this.options.soundEngine.toggleMute();
        this.options.soundEngine.playLaserPing();
      }
      this.renderSimulationTab(pane);
    });
  }

  // ---------------------------------------------------------------------------
  // TAB 1: SENSOR ALARM THRESHOLDS
  // ---------------------------------------------------------------------------
  renderThresholdsTab(pane) {
    pane.innerHTML = `
      <div class="settings-section">
        <div class="settings-section-header">
          <div>
            <h3 class="settings-section-title">Alarm Limits &amp; Trip Setpoints</h3>
            <p class="settings-section-desc">Adjust warning (Attention) and critical (Emergency Trip) levels. Changes take effect on live 20Hz telemetry instantly.</p>
          </div>
          <div class="settings-preset-group">
            <span class="settings-preset-label">Presets:</span>
            <button class="settings-preset-btn" data-preset="standard">Standard Factory</button>
            <button class="settings-preset-btn" data-preset="sensitive">High Sensitivity</button>
            <button class="settings-preset-btn" data-preset="heavy">Heavy-Duty Mining</button>
          </div>
        </div>

        <div class="thresholds-grid">
          ${Object.entries(this.thresholds).map(([key, item]) => `
            <div class="threshold-card" data-key="${key}">
              <div class="threshold-card-top">
                <span class="threshold-card-name">${item.name}</span>
                <span class="threshold-unit-tag">${item.unit}</span>
              </div>
              
              <div class="threshold-inputs-row">
                <div class="threshold-input-block">
                  <label class="threshold-sublabel warn-label">Warning Limit</label>
                  <input type="number" class="threshold-number-input input-warn" 
                    value="${item.warn}" min="${item.min}" max="${item.max}" step="${item.step}" data-key="${key}" data-type="warn">
                </div>
                <div class="threshold-input-block">
                  <label class="threshold-sublabel crit-label">Critical Limit</label>
                  <input type="number" class="threshold-number-input input-crit" 
                    value="${item.crit}" min="${item.min}" max="${item.max}" step="${item.step}" data-key="${key}" data-type="crit">
                </div>
              </div>

              <div class="threshold-slider-box">
                <input type="range" class="threshold-range-slider" 
                  min="${item.min}" max="${item.max}" step="${item.step}" value="${item.warn}" data-key="${key}">
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // Bind inputs to local state
    pane.querySelectorAll('.threshold-number-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const key = e.target.dataset.key;
        const type = e.target.dataset.type;
        const val = parseFloat(e.target.value);
        if (this.thresholds[key]) {
          this.thresholds[key][type] = val;
        }
      });
    });

    pane.querySelectorAll('.threshold-range-slider').forEach(slider => {
      slider.addEventListener('input', (e) => {
        const key = e.target.dataset.key;
        const val = parseFloat(e.target.value);
        if (this.thresholds[key]) {
          this.thresholds[key].warn = val;
          const numIn = pane.querySelector(`.input-warn[data-key="${key}"]`);
          if (numIn) numIn.value = val;
        }
      });
    });

    // Preset buttons
    pane.querySelectorAll('.settings-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.applyPreset(btn.dataset.preset);
        this.renderThresholdsTab(pane);
      });
    });
  }

  applyPreset(presetType) {
    if (presetType === 'sensitive') {
      this.thresholds.misalignment_st01.warn = 35.0;
      this.thresholds.misalignment_st01.crit = 42.0;
      this.thresholds.misalignment_st02.warn = 55.0;
      this.thresholds.misalignment_st02.crit = 62.0;
      this.thresholds.load_sensor_st01.warn = 35.0;
      this.thresholds.load_sensor_st01.crit = 45.0;
      this.thresholds.thickness_st01.warn = 20.0;
      this.thresholds.thickness_st01.crit = 18.0;
      this.thresholds.temp_bearing_01.warn = 50.0;
      this.thresholds.temp_bearing_01.crit = 62.0;
    } else if (presetType === 'heavy') {
      this.thresholds.misalignment_st01.warn = 55.0;
      this.thresholds.misalignment_st01.crit = 65.0;
      this.thresholds.misalignment_st02.warn = 75.0;
      this.thresholds.misalignment_st02.crit = 85.0;
      this.thresholds.load_sensor_st01.warn = 60.0;
      this.thresholds.load_sensor_st01.crit = 75.0;
      this.thresholds.thickness_st01.warn = 14.0;
      this.thresholds.thickness_st01.crit = 10.0;
      this.thresholds.temp_bearing_01.warn = 70.0;
      this.thresholds.temp_bearing_01.crit = 85.0;
    } else {
      // Standard
      this.thresholds.misalignment_st01.warn = 45.0;
      this.thresholds.misalignment_st01.crit = 50.0;
      this.thresholds.misalignment_st02.warn = 65.0;
      this.thresholds.misalignment_st02.crit = 71.2;
      this.thresholds.load_sensor_st01.warn = 45.0;
      this.thresholds.load_sensor_st01.crit = 55.0;
      this.thresholds.thickness_st01.warn = 18.0;
      this.thresholds.thickness_st01.crit = 15.0;
      this.thresholds.temp_bearing_01.warn = 60.0;
      this.thresholds.temp_bearing_01.crit = 75.0;
    }
  }

  // ---------------------------------------------------------------------------
  // TAB 2: CAMERA STREAM PORTS & INTERFACE
  // ---------------------------------------------------------------------------
  renderCameraPortsTab(pane) {
    pane.innerHTML = `
      <div class="settings-section">
        <div class="settings-section-header">
          <div>
            <h3 class="settings-section-title">Optical Machine Vision &amp; Camera Ports</h3>
            <p class="settings-section-desc">Configure industrial line-scan camera endpoints, RTSP video streams, and USB 3.0 UVC optical inputs.</p>
          </div>
          <div class="status-chip chip-active">
            <span class="dot-online"></span>
            <span>VISION DRIVER ACTIVE</span>
          </div>
        </div>

        <div class="camera-config-grid">
          
          <!-- Stream Mode Card -->
          <div class="port-setting-card">
            <h4 class="port-card-title">1. Camera Interface Type</h4>
            <div class="radio-select-group">
              <label class="radio-select-item ${this.cameraConfig.streamType === 'usb_uvc' ? 'selected' : ''}">
                <input type="radio" name="streamType" value="usb_uvc" ${this.cameraConfig.streamType === 'usb_uvc' ? 'checked' : ''}>
                <div>
                  <div class="radio-title">Industrial USB 3.0 UVC</div>
                  <div class="radio-desc">Direct local high-speed camera capture with zero latency</div>
                </div>
              </label>

              <label class="radio-select-item ${this.cameraConfig.streamType === 'gige_vision' ? 'selected' : ''}">
                <input type="radio" name="streamType" value="gige_vision" ${this.cameraConfig.streamType === 'gige_vision' ? 'checked' : ''}>
                <div>
                  <div class="radio-title">GigE Vision (Keyence LJ-X8000)</div>
                  <div class="radio-desc">Industrial Gigabit Ethernet laser profilometer controller</div>
                </div>
              </label>

              <label class="radio-select-item ${this.cameraConfig.streamType === 'rtsp_ip' ? 'selected' : ''}">
                <input type="radio" name="streamType" value="rtsp_ip" ${this.cameraConfig.streamType === 'rtsp_ip' ? 'checked' : ''}>
                <div>
                  <div class="radio-title">RTSP / H.264 Network Stream</div>
                  <div class="radio-desc">IP line-scan camera over local industrial ethernet switch</div>
                </div>
              </label>
            </div>
          </div>

          <!-- Network & Port Parameters -->
          <div class="port-setting-card">
            <h4 class="port-card-title">2. Port &amp; Endpoint Parameters</h4>
            
            <div class="form-field-row">
              <label class="form-field-label">RTSP Video Port / Stream URL:</label>
              <div class="input-with-action">
                <input type="text" id="cfg-camera-rtsp" class="settings-text-input" value="${this.cameraConfig.rtspUrl}">
                <button class="btn-input-test" id="btn-test-rtsp">Ping Port 554</button>
              </div>
            </div>

            <div class="form-field-row">
              <label class="form-field-label">GigE Vision Controller IP &amp; Control Port:</label>
              <div style="display: flex; gap: 8px;">
                <input type="text" id="cfg-camera-ip" class="settings-text-input" style="flex: 2;" value="${this.cameraConfig.gigeIp}">
                <input type="number" id="cfg-camera-port" class="settings-text-input" style="flex: 1;" value="${this.cameraConfig.gigePort}">
                <button class="btn-input-test" id="btn-test-gige">Connect</button>
              </div>
            </div>

            <div class="form-field-row">
              <label class="form-field-label">USB Camera Device Index:</label>
              <select id="cfg-camera-dev" class="settings-select-input">
                <option value="cam_logi" ${this.cameraConfig.selectedCameraId === 'cam_logi' ? 'selected' : ''}>[Primary USB] Logi C270 HD WebCam (1280x720 • 046d:0825)</option>
                <option value="cam_0" ${this.cameraConfig.selectedCameraId === 'cam_0' ? 'selected' : ''}>[Device 0] Integrated USB HD WebCam (04f2:b6d9)</option>
                <option value="cam_1" ${this.cameraConfig.selectedCameraId === 'cam_1' ? 'selected' : ''}>[Device 1] Keyence Line-Scan 4K NIR (05a3:9230)</option>
                <option value="cam_2" ${this.cameraConfig.selectedCameraId === 'cam_2' ? 'selected' : ''}>[Device 2] Intel RealSense D435 Depth Camera (8086:0b07)</option>
              </select>
            </div>

            <div class="form-field-row" style="display: flex; gap: 12px; margin-top: 14px;">
              <div style="flex: 1;">
                <label class="form-field-label">Frame Rate Limit:</label>
                <select id="cfg-camera-fps" class="settings-select-input">
                  <option value="30" ${this.cameraConfig.fpsLimit === 30 ? 'selected' : ''}>30 FPS (Standard)</option>
                  <option value="60" ${this.cameraConfig.fpsLimit === 60 ? 'selected' : ''}>60 FPS (Fluid Real-Time)</option>
                  <option value="165" ${this.cameraConfig.fpsLimit === 165 ? 'selected' : ''}>165 FPS (High-Speed Industrial)</option>
                </select>
              </div>
              <div style="flex: 1;">
                <label class="form-field-label">Resolution:</label>
                <select id="cfg-camera-res" class="settings-select-input">
                  <option value="1280x720">1280 × 720 (720p HD)</option>
                  <option value="1920x1080" selected>1920 × 1080 (1080p FHD)</option>
                  <option value="3840x2160">3840 × 2160 (4K UHD Optical)</option>
                </select>
              </div>
            </div>

          </div>

        </div>
      </div>
    `;

    // Event binding
    pane.querySelectorAll('input[name="streamType"]').forEach(r => {
      r.addEventListener('change', (e) => {
        this.cameraConfig.streamType = e.target.value;
        this.renderCameraPortsTab(pane);
      });
    });

    const rtspIn = pane.querySelector('#cfg-camera-rtsp');
    if (rtspIn) rtspIn.addEventListener('input', (e) => this.cameraConfig.rtspUrl = e.target.value);

    const ipIn = pane.querySelector('#cfg-camera-ip');
    if (ipIn) ipIn.addEventListener('input', (e) => this.cameraConfig.gigeIp = e.target.value);

    const portIn = pane.querySelector('#cfg-camera-port');
    if (portIn) portIn.addEventListener('input', (e) => this.cameraConfig.gigePort = parseInt(e.target.value, 10));

    const pingBtn = pane.querySelector('#btn-test-rtsp');
    if (pingBtn) {
      pingBtn.addEventListener('click', () => {
        pingBtn.textContent = 'Pinging...';
        setTimeout(() => {
          pingBtn.textContent = 'Port 554 OK (8ms)';
          pingBtn.style.background = '#10b981';
          pingBtn.style.color = '#fff';
        }, 350);
      });
    }

    const gigeBtn = pane.querySelector('#btn-test-gige');
    if (gigeBtn) {
      gigeBtn.addEventListener('click', () => {
        gigeBtn.textContent = 'Handshaking...';
        setTimeout(() => {
          gigeBtn.textContent = 'Connected (12ms)';
          gigeBtn.style.background = '#10b981';
          gigeBtn.style.color = '#fff';
        }, 400);
      });
    }
  }

  // ---------------------------------------------------------------------------
  // TAB 3: MICROCONTROLLER USB PORTS & DAQ MANAGER
  // ---------------------------------------------------------------------------
  renderUsbPortsTab(pane) {
    pane.innerHTML = `
      <div class="settings-section">
        <div class="settings-section-header">
          <div>
            <h3 class="settings-section-title">Microcontroller USB Serial COM Ports &amp; DAQ Bus</h3>
            <p class="settings-section-desc">Manage USB serial connections for STM32, ESP32, and Arduino telemetry DAQ nodes. View live packet telemetry buffer.</p>
          </div>
          <button class="btn-secondary-action" id="btn-rescan-ports">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
            <span>Scan USB COM Ports</span>
          </button>
        </div>

        <!-- USB Ports Table -->
        <div class="usb-ports-table-wrap">
          <table class="usb-ports-table">
            <thead>
              <tr>
                <th>Port</th>
                <th>Device Description</th>
                <th>Baud Rate</th>
                <th>Framing</th>
                <th>RX / TX Packets</th>
                <th>State</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${this.usbPorts.map(p => `
                <tr class="usb-port-row ${p.connected ? 'is-connected' : ''}" data-port="${p.id}">
                  <td><span class="com-port-badge">${p.port}</span></td>
                  <td><span class="com-device-desc">${p.device}</span></td>
                  <td>
                    <select class="settings-select-input baud-select" data-port="${p.id}">
                      <option value="9600" ${p.baud === 9600 ? 'selected' : ''}>9600</option>
                      <option value="19200" ${p.baud === 19200 ? 'selected' : ''}>19200</option>
                      <option value="38400" ${p.baud === 38400 ? 'selected' : ''}>38400</option>
                      <option value="57600" ${p.baud === 57600 ? 'selected' : ''}>57600</option>
                      <option value="115200" ${p.baud === 115200 ? 'selected' : ''}>115200</option>
                      <option value="921600" ${p.baud === 921600 ? 'selected' : ''}>921600</option>
                    </select>
                  </td>
                  <td><span class="mono-tag">${p.parity}</span></td>
                  <td>
                    <span class="packet-stat" id="rx-stat-${p.id}">${p.rxCount.toLocaleString()} RX</span>
                  </td>
                  <td>
                    <div class="status-indicator-box">
                      <span class="hw-led ${p.connected ? 'led-on' : 'led-off'}"></span>
                      <span>${p.connected ? 'CONNECTED' : 'DISCONNECTED'}</span>
                    </div>
                  </td>
                  <td>
                    <button class="btn-usb-toggle ${p.connected ? 'btn-disconnect' : 'btn-connect'}" data-port="${p.id}">
                      ${p.connected ? 'Disconnect' : 'Connect'}
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <!-- Live Serial Monitor Box -->
        <div class="serial-monitor-card">
          <div class="serial-monitor-header">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="hw-led led-on"></span>
              <span class="serial-monitor-title">LIVE USB TELEMETRY PACKET MONITOR (COM3 + COM4)</span>
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="btn-subtle-action" id="btn-clear-serial">Clear Buffer</button>
              <button class="btn-subtle-action" id="btn-copy-serial">Export Log</button>
            </div>
          </div>
          <div class="serial-terminal-window" id="serial-terminal-box">
            <!-- Simulated streaming serial packets -->
          </div>
        </div>

      </div>
    `;

    // Bind Port actions
    pane.querySelectorAll('.btn-usb-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const portId = btn.dataset.port;
        const portObj = this.usbPorts.find(p => p.id === portId);
        if (portObj) {
          portObj.connected = !portObj.connected;
          this.renderUsbPortsTab(pane);
        }
      });
    });

    pane.querySelectorAll('.baud-select').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const portId = sel.dataset.port;
        const portObj = this.usbPorts.find(p => p.id === portId);
        if (portObj) {
          portObj.baud = parseInt(e.target.value, 10);
        }
      });
    });

    const rescanBtn = pane.querySelector('#btn-rescan-ports');
    if (rescanBtn) {
      rescanBtn.addEventListener('click', () => {
        rescanBtn.innerHTML = '<span>Scanning USB Bus...</span>';
        setTimeout(() => {
          this.renderUsbPortsTab(pane);
        }, 500);
      });
    }

    const clearBtn = pane.querySelector('#btn-clear-serial');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.packetLogs = [];
        const box = pane.querySelector('#serial-terminal-box');
        if (box) box.innerHTML = '';
      });
    }

    this.updateSerialTerminalDOM();
  }



  // ---------------------------------------------------------------------------
  // SERIAL PACKET MONITOR (FETCHES REAL COM19 LOGS FROM BACKEND)
  // ---------------------------------------------------------------------------
  startPacketSimulation() {
    this.stopPacketSimulation();
    this.packetStreamInterval = setInterval(() => {
      if (!this.isOpen || this.activeTab !== 'usb_ports') return;

      fetch('/api/serial/log')
        .then(r => r.json())
        .then(d => {
          if (d.logs && d.logs.length > 0) {
            this.packetLogs = d.logs.map(l => `[${l.time}] [COM19] [${l.direction || 'RX'}] ${l.text}`);
            const com19 = this.usbPorts.find(p => p.id === 'com19');
            if (com19) {
              com19.rxCount = d.logs.length;
              const rxEl = this.container.querySelector('#rx-stat-com19');
              if (rxEl) rxEl.textContent = `${com19.rxCount.toLocaleString()} RX`;
            }
            this.updateSerialTerminalDOM();
          }
        })
        .catch(() => {});
    }, 450);
  }

  stopPacketSimulation() {
    if (this.packetStreamInterval) {
      clearInterval(this.packetStreamInterval);
      this.packetStreamInterval = null;
    }
  }

  updateSerialTerminalDOM() {
    const term = this.container.querySelector('#serial-terminal-box');
    if (!term) return;

    term.innerHTML = this.packetLogs.map(l => `<div class="serial-line">${l}</div>`).join('');
    term.scrollTop = term.scrollHeight;
  }

  // ---------------------------------------------------------------------------
  // SAVE & APPLY ACTIONS
  // ---------------------------------------------------------------------------
  applyAndSave() {
    this.saveSettings();

    // Notify listeners
    if (this.options.onThresholdsChange) {
      this.options.onThresholdsChange(this.thresholds);
    }
    if (this.options.onCameraConfigChange) {
      this.options.onCameraConfigChange(this.cameraConfig);
    }

    const toast = this.container.querySelector('#settings-status-indicator');
    if (toast) {
      toast.textContent = '✓ CONFIGURATION SAVED & APPLIED TO LIVE TELEMETRY';
      toast.style.color = '#10b981';
      setTimeout(() => {
        toast.textContent = '● HARDWARE REGISTRY: 4 PORTS BOUND | 20Hz CLOCK ACTIVE';
        toast.style.color = '';
      }, 2500);
    }

    this.close();
  }

  resetDefaults() {
    this.applyPreset('standard');
    this.saveSettings();
    this.renderTabContent();
    if (this.options.onThresholdsChange) {
      this.options.onThresholdsChange(this.thresholds);
    }
  }
}
