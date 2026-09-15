/**
 * Ore Sentinels Application Orchestrator & Telemetry Stream Client
 * Connects Three.js Scene, Curated Spatial HUD, Depth Camera AI Vision,
 * Cinematic Drone Tour, Rupture Simulator, Spatial Cursor Engine, and Live Telemetry.
 */

import { ConveyorScene } from './conveyor_scene.js?v=virtual_cam_v2';
import { SpatialHUD } from './spatial_hud.js?v=virtual_cam_v2';
import { SensorDetailsDrawer } from './sensor_details.js?v=virtual_cam_v2';
import { DepthCameraVision } from './depth_camera_vision.js?v=vision_cockpit_v1';
import { TimelineScrubber } from './timeline_scrubber.js?v=virtual_cam_v2';
import { DailyAnalyticsModal } from './daily_analytics_modal.js?v=virtual_cam_v2';
import { SettingsModal } from './settings_modal.js?v=virtual_cam_v2';
import { SoundFXEngine } from './sound_effects.js?v=virtual_cam_v2';
import { CinematicDroneTour } from './cinematic_tour.js?v=virtual_cam_v2';
import { RuptureSimulator } from './rupture_simulator.js?v=virtual_cam_v2';
import { SpatialCursorEngine } from './spatial_cursor.js?v=motion_v1';

class OreSentinelsApp {
  constructor() {
    this.scene = null;
    this.hud = null;
    this.drawer = null;
    this.depthVision = null;
    this.scrubber = null;
    this.analyticsModal = null;
    this.settingsModal = null;
    this.crewModal = null;
    this.sound = null;
    this.droneTour = null;
    this.simulator = null;

    this.isLiveMode = true;
    this.latestLiveState = null;
    this.currentHistoricalSnapshot = null;
    this.latestState = null;
    this.sseSource = null;
    this.currentTheme = 'dark';
    this.customThresholds = null;

    this.init();
  }

  init() {
    // 0. Initialize Procedural Sound Engine & Spatial 3D Cursor
    this.sound = new SoundFXEngine();
    this.cursorEngine = new SpatialCursorEngine();

    // 0.1 Initialize Theme (defaults to MotionSites Pure Dark Canvas)
    this.currentTheme = localStorage.getItem('oresentinels_theme') || localStorage.getItem('beltxence_theme') || 'dark';
    this.applyTheme(this.currentTheme);

    // 1. Initialize 3D WebGL Canvas
    const canvas = document.getElementById('webgl-canvas');
    this.scene = new ConveyorScene(canvas);
    if (typeof this.scene.setTheme === 'function') {
      this.scene.setTheme(this.currentTheme);
    }

    // 2. Initialize Sensor Details Drawer
    const drawerEl = document.getElementById('sensor-inspector-drawer');
    this.drawer = new SensorDetailsDrawer(drawerEl, (sensorKey) => {
      this.focusOnSensor(sensorKey);
    });

    // 3. Initialize Curated Spatial HUD
    const hudContainer = document.getElementById('hud-overlay-container');
    const svgOverlay = document.getElementById('svg-hud-lines');
    this.hud = new SpatialHUD(this.scene, hudContainer, svgOverlay, (key, data) => {
      this.drawer.open(key, data);
    });

    // 4. Initialize Gazebo 3D Camera Sensor & AI Depth Profilometry
    const gazeboCanvas = document.getElementById('gazebo-cam-canvas');
    if (gazeboCanvas && this.scene && this.scene.setupGazeboCamera) {
      this.scene.setupGazeboCamera(gazeboCanvas);
    }

    const aiCanvas = document.getElementById('ai-vision-canvas');
    this.depthVision = new DepthCameraVision(aiCanvas, () => {
      this.scene.setCameraPreset('intake_scanner');
    }, this.scene);

    // 4b. Initialize Autonomous Drone Patrol Tour
    this.droneTour = new CinematicDroneTour(this.scene, this.sound);
    this.scene.droneTour = this.droneTour;

    // 4c. Initialize Rupture & Incident Fault Simulator
    this.simulator = new RuptureSimulator(this.scene, this.depthVision, this.sound);

    // 5. Setup Controls & Navigation
    this.setupToolbar();
    this.setupFilterChips();
    this.setupLeftRail();
    this.setupAllSensorsToggle();
    this.setupClock();

    // 6. Initialize Daily Analytics Modal
    const modalRoot = document.getElementById('analytics-modal-root');
    this.analyticsModal = new DailyAnalyticsModal(modalRoot, (dayIdx) => {
      if (this.scrubber) this.scrubber.selectDay(dayIdx);
    });

    // 7. Initialize Industrial Settings & Configuration Modal
    const settingsRoot = document.getElementById('settings-modal-root');
    if (settingsRoot) {
      this.settingsModal = new SettingsModal(settingsRoot, {
        soundEngine: this.sound,
        conveyorScene: this.scene,
        ruptureSimulator: this.simulator,
        onThemeChange: (theme) => {
          this.applyTheme(theme);
        },
        onToggleFea: () => {
          if (this.scene) {
            const active = this.scene.toggleStressHeatmap();
            if (this.sound) this.sound.playClick();
            return active;
          }
          return false;
        },
        onToggleSound: () => {
          if (this.sound) {
            this.sound.toggleMute();
            return !this.sound.isMuted;
          }
          return false;
        },
        onTriggerScenario: (scenario) => {
          if (this.simulator) {
            this.simulator.triggerScenario(scenario);
          }
        },
        onOpenSimulator: () => {
          if (this.simulator) {
            this.simulator.open();
          }
        },
        onThresholdsChange: (thresholds) => {
          this.customThresholds = thresholds;
          if (this.latestLiveState) {
            this.handleTelemetryUpdate(this.latestLiveState);
          }
        },
        onCameraConfigChange: (camConfig) => {
          console.log('[Ore Sentinels] Camera Config updated:', camConfig);
          if (this.depthVision && camConfig.mode === 'usb') {
            this.depthVision.useRealCamera();
          }
        }
      });
    }

    // 8. Header Action Buttons (Drone Tour, Settings, History)
    const btnDrone = document.getElementById('btn-drone-tour');
    if (btnDrone) {
      btnDrone.addEventListener('click', () => {
        const active = this.droneTour.toggle();
        btnDrone.classList.toggle('active-glow', active);
      });
      window.addEventListener('drone-tour-started', () => btnDrone.classList.add('active-glow'));
      window.addEventListener('drone-tour-stopped', () => btnDrone.classList.remove('active-glow'));
    }

    const btnHeaderSettings = document.getElementById('btn-header-settings');
    if (btnHeaderSettings) {
      btnHeaderSettings.addEventListener('click', () => {
        if (this.settingsModal) this.settingsModal.open('thresholds');
        if (this.sound) this.sound.playClick();
      });
    }

    // Header 7-Day History Button
    const headerHistBtn = document.getElementById('btn-header-history');
    if (headerHistBtn) {
      headerHistBtn.addEventListener('click', () => {
        this.openAnalyticsModal();
      });
    }

    // 9. Initialize Timeline Scrubber Bar
    const scrubberEl = document.getElementById('timeline-scrubber-bar');
    this.scrubber = new TimelineScrubber(scrubberEl, {
      onDaySelect: (dayIdx, snapshot, isLive) => {
        this.handleDaySelect(dayIdx, snapshot, isLive);
      },
      onOpenAnalytics: (historyData) => {
        this.openAnalyticsModal();
      }
    });

    // 10. Connect Telemetry Stream
    this.connectTelemetryStream();
  }

  connectTelemetryStream() {
    try {
      this.sseSource = new EventSource('/api/telemetry/stream');

      this.sseSource.onmessage = (event) => {
        try {
          const state = JSON.parse(event.data);
          this.handleTelemetryUpdate(state);
        } catch (e) {
          console.error('[Ore Sentinels] Telemetry parse error:', e);
        }
      };

      this.sseSource.onerror = () => {
        this.sseSource.close();
        this.fallbackPolling();
      };
    } catch (e) {
      this.fallbackPolling();
    }
  }

  fallbackPolling() {
    const poll = async () => {
      try {
        const res = await fetch('/api/telemetry');
        if (res.ok) {
          const state = await res.json();
          this.handleTelemetryUpdate(state);
        }
      } catch (err) {
        this.runLocalSimulation();
      }
      setTimeout(poll, 100);
    };
    poll();
  }

  runLocalSimulation() {
    const state = {
      timestamp: Date.now(),
      belt_speed: 2.96,
      sensors: {
        damage_st01: { tag: 'Damage ST01', val: 1, unit: 'count', status: 'normal', warn_limit: 3, crit_limit: 5, description: 'AI Vision Optical Profilometer' },
        misalignment_st01: { tag: 'Misalignment ST01', val: 32.40, unit: 'mm', status: 'normal', warn_limit: 45.0, crit_limit: 50.0, description: 'Return strand lateral drift' },
        misalignment_st02: { tag: 'Misalignment ST02', val: 72.33, unit: 'mm', status: 'warning', warn_limit: 71.2, crit_limit: 80.0, description: 'Carrying strand lateral drift' },
        load_sensor_st01: { tag: 'Load Sensor ST01', val: 0.0, unit: 'kg', status: 'normal', warn_limit: 45.0, crit_limit: 55.0, description: 'HX711 Load Cell - Frame Joint Stress (Nominal 0.0 kg, stress rises only when frame joints loosen)' },
        thickness_st01: { tag: 'Thickness ST01', val: 22.81, unit: 'mm', status: 'normal', warn_limit: 15.0, crit_limit: 10.0, description: 'Belt rubber carcass thickness' },
        speed_mid_02: { tag: 'Speed Sensor 02', val: 2.96, unit: 'm/s', status: 'normal', warn_limit: 2.2, crit_limit: 1.5, description: 'Carrying idler tachometer' },
        speed_head_drive: { tag: 'Head Drive Speed', val: 3.08, unit: 'm/s', status: 'normal', warn_limit: 3.5, crit_limit: 4.0, description: 'Head discharge drum speed' },
        speed_tail_01: { tag: 'Tail Drum Speed', val: 2.94, unit: 'm/s', status: 'normal', warn_limit: 2.0, crit_limit: 1.5, description: 'Tail tension drum tachometer' },
        temp_bearing_01: { tag: 'Temperature ST01', val: 45.5, unit: '°C', status: 'normal', warn_limit: 65.0, crit_limit: 80.0, description: 'Drive motor idler bearing' },
        current_motor_01: { tag: 'Motor Current', val: 18.4, unit: 'A', status: 'normal', warn_limit: 25.0, crit_limit: 32.0, description: 'Stator 3-phase current' },
        vibration_head: { tag: 'Head Vibration', val: 1.45, unit: 'mm/s', status: 'normal', warn_limit: 2.8, crit_limit: 4.5, description: 'Discharge frame vibration' },
        vibration_tail: { tag: 'Tail Vibration', val: 1.12, unit: 'mm/s', status: 'normal', warn_limit: 2.8, crit_limit: 4.5, description: 'Tension frame vibration' },
        vibration_mid1: { tag: 'Idler 1 Vibration', val: 0.95, unit: 'mm/s', status: 'normal', warn_limit: 2.8, crit_limit: 4.5, description: 'Mid idler 1 vibration' },
        vibration_mid2: { tag: 'Idler 2 Vibration', val: 1.05, unit: 'mm/s', status: 'normal', warn_limit: 2.8, crit_limit: 4.5, description: 'Mid idler 2 vibration' }
      },
      health: { optimal: 70.0, warning: 10.0, critical: 20.0 },
      alert_banner: 'Misalignment ST02 above the alert limit (> 71.199997 mm)',
      alert_tag: 'MisST02Attention'
    };
    this.handleTelemetryUpdate(state);
  }

  handleTelemetryUpdate(state) {
    this.latestLiveState = state;
    this.evaluateThresholds(state);
    if (!this.isLiveMode) {
      // User is currently scrubbing historical day archive; preserve historical view
      return;
    }
    this.renderStateToScene(state);
  }

  renderStateToScene(state) {
    this.latestState = state;

    // 1. Update Belt Speed in 3D Scene
    if (state.belt_speed !== undefined) {
      this.scene.setBeltSpeed(state.belt_speed);
    }

    // 2. Update 3D Spatial HUD Badges
    if (state.sensors) {
      this.hud.updateAllSensors(state.sensors);

      if (this.drawer.currentSensorKey && state.sensors[this.drawer.currentSensorKey]) {
        this.drawer.updateDetails(state.sensors[this.drawer.currentSensorKey]);
      }

      // 3. Update AI Depth Camera with Complete Live Virtual Conveyor Telemetry
      if (this.depthVision) {
        this.depthVision.setLiveConveyorData(state);
      }
    }

    // 4. Update Health Donut Gauge
    if (state.health) {
      this.updateHealthDonut(state.health);
    }

    // 5. Update Bottom Alert Marquee
    if (state.alert_banner) {
      const bannerEl = document.getElementById('ticker-banner-text');
      if (bannerEl) bannerEl.textContent = state.alert_banner;
    }
    if (state.alert_tag) {
      const tagEl = document.getElementById('ticker-tag-text');
      if (tagEl) tagEl.textContent = state.alert_tag;
    }
  }

  handleDaySelect(dayIdx, snapshot, isLive) {
    this.isLiveMode = isLive;
    this.currentHistoricalSnapshot = snapshot;

    const pill = document.getElementById('header-status-pill');
    const label = document.getElementById('header-status-label');

    if (!isLive) {
      if (pill) {
        pill.classList.remove('live-mode');
        pill.classList.add('archive-mode');
      }
      if (label) {
        label.textContent = `ARCHIVE: ${snapshot.day_info?.relative_label || 'DAY ' + dayIdx}`;
      }
      this.renderStateToScene(snapshot);

      const tickerTime = document.getElementById('ticker-timestamp');
      if (tickerTime && snapshot.day_info?.date_str) {
        tickerTime.textContent = `${snapshot.day_info.date_str} (HISTORICAL ARCHIVE)`;
      }
    } else {
      if (pill) {
        pill.classList.remove('archive-mode');
        pill.classList.add('live-mode');
      }
      if (label) {
        label.textContent = 'LIVE TELEMETRY (20Hz)';
      }
      if (this.latestLiveState) {
        this.renderStateToScene(this.latestLiveState);
      }
    }
  }

  updateHealthDonut(health) {
    const circ = 2 * Math.PI * 44; // r = 44px -> ~276.46

    const optPct = health.optimal || 70.0;
    const warnPct = health.warning || 10.0;
    const critPct = health.critical || 20.0;

    const optLen = (optPct / 100) * circ;
    const warnLen = (warnPct / 100) * circ;
    const critLen = (critPct / 100) * circ;

    const segOpt = document.getElementById('donut-seg-optimal');
    const segWarn = document.getElementById('donut-seg-warning');
    const segCrit = document.getElementById('donut-seg-critical');

    if (segOpt && segWarn && segCrit) {
      segOpt.setAttribute('stroke-dasharray', `${optLen} ${circ}`);
      segOpt.setAttribute('stroke-dashoffset', '0');

      segWarn.setAttribute('stroke-dasharray', `${warnLen} ${circ}`);
      segWarn.setAttribute('stroke-dashoffset', `${-optLen}`);

      segCrit.setAttribute('stroke-dasharray', `${critLen} ${circ}`);
      segCrit.setAttribute('stroke-dashoffset', `${-(optLen + warnLen)}`);
    }

    const lOpt = document.getElementById('legend-val-opt');
    const lWarn = document.getElementById('legend-val-warn');
    const lCrit = document.getElementById('legend-val-crit');

    if (lOpt) lOpt.textContent = `${optPct.toFixed(1)}%`;
    if (lWarn) lWarn.textContent = `${warnPct.toFixed(1)}%`;
    if (lCrit) lCrit.textContent = `${critPct.toFixed(1)}%`;
  }

  setupFilterChips() {
    const chips = document.querySelectorAll('.filter-chip');
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        chips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const filter = chip.dataset.filter || 'overview';
        this.hud.setFilter(filter);
      });
    });
  }

  setupToolbar() {
    const btnIso = document.getElementById('btn-view-iso');
    const btnHead = document.getElementById('btn-view-head');
    const btnTail = document.getElementById('btn-view-tail');
    const btnScan = document.getElementById('btn-view-scan');
    const btnSide = document.getElementById('btn-view-side');
    const btnTop = document.getElementById('btn-view-top');
    const btnSpin = document.getElementById('btn-toggle-spin');

    const clearActive = () => {
      document.querySelectorAll('.camera-toolbar .tool-btn').forEach(b => b.classList.remove('active'));
    };

    if (btnIso) btnIso.addEventListener('click', () => { clearActive(); btnIso.classList.add('active'); this.scene.setCameraPreset('iso'); });
    if (btnHead) btnHead.addEventListener('click', () => { clearActive(); btnHead.classList.add('active'); this.scene.setCameraPreset('drive_head'); });
    if (btnTail) btnTail.addEventListener('click', () => { clearActive(); btnTail.classList.add('active'); this.scene.setCameraPreset('tail_tension'); });
    if (btnScan) btnScan.addEventListener('click', () => { clearActive(); btnScan.classList.add('active'); this.scene.setCameraPreset('intake_scanner'); });
    if (btnSide) btnSide.addEventListener('click', () => { clearActive(); btnSide.classList.add('active'); this.scene.setCameraPreset('elevation'); });
    if (btnTop) btnTop.addEventListener('click', () => { clearActive(); btnTop.classList.add('active'); this.scene.setCameraPreset('top'); });

    if (btnSpin) {
      btnSpin.addEventListener('click', () => {
        const running = this.scene.toggleSpin();
        btnSpin.textContent = running ? 'Pause' : 'Spin';
      });
    }
  }

  setupLeftRail() {
    const railItems = document.querySelectorAll('.rail-item');
    railItems.forEach((item) => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        railItems.forEach(i => i.classList.remove('active', 'tab-pulse'));
        item.classList.add('active', 'tab-pulse');
        setTimeout(() => item.classList.remove('tab-pulse'), 400);

        if (this.sound) this.sound.playClick();

        const nav = item.dataset.nav;
        this.handleNavSelection(nav);
      });
    });
  }

  setupAllSensorsToggle() {
    const btnHeader = document.getElementById('btn-toggle-all-sensors');
    const label = document.getElementById('all-sensors-btn-label');
    const railItem = document.getElementById('rail-all-sensors');

    this.allSensorsActive = false;

    this.setAllSensorsState = (active) => {
      this.allSensorsActive = active;
      if (this.allSensorsActive) {
        this.hud.setFilter('all');
        if (label) label.textContent = 'Showing All 13 Sensors';
        if (btnHeader) btnHeader.classList.add('active');
        if (railItem) railItem.classList.add('active');
      } else {
        this.hud.setFilter('overview');
        if (label) label.textContent = 'Display All Sensors';
        if (btnHeader) btnHeader.classList.remove('active');
        if (railItem) railItem.classList.remove('active');
      }
    };

    if (btnHeader) {
      btnHeader.addEventListener('click', () => {
        this.setAllSensorsState(!this.allSensorsActive);
      });
    }
  }

  handleNavSelection(nav) {
    switch (nav) {
      case 'home':
        if (this.setAllSensorsState) this.setAllSensorsState(false);
        this.scene.setCameraPreset('iso');
        this.hud.setFilter('overview');
        this.drawer.close();
        break;
      case 'all_sensors':
        if (this.setAllSensorsState) this.setAllSensorsState(true);
        this.scene.setCameraPreset('iso');
        this.drawer.close();
        break;
      case 'analytics':
        if (this.sound) this.sound.playClick();
        if (this.drawer) this.drawer.close();
        this.openAnalyticsModal();
        break;
      case 'misalignment':
        if (this.sound) this.sound.playClick();
        this.scene.setCameraPreset('tail_tension');
        this.hud.setFilter('tracking');
        this.focusOnSensor('misalignment_st01');
        {
          const s = this.latestState?.sensors?.misalignment_st01 || this.getDefaultSensor('misalignment_st01');
          this.drawer.open('misalignment_st01', s);
        }
        break;
      case 'load_sensor':
        if (this.sound) this.sound.playClick();
        this.scene.setCameraPreset('tail_tension');
        this.hud.setFilter('tracking');
        this.focusOnSensor('load_sensor_st01');
        {
          const s = this.latestState?.sensors?.load_sensor_st01 || this.getDefaultSensor('load_sensor_st01');
          this.drawer.open('load_sensor_st01', s);
        }
        break;
      case 'thickness':
        if (this.sound) this.sound.playClick();
        this.scene.setCameraPreset('tail_tension');
        this.hud.setFilter('tracking');
        this.focusOnSensor('thickness_st01');
        {
          const s = this.latestState?.sensors?.thickness_st01 || this.getDefaultSensor('thickness_st01');
          this.drawer.open('thickness_st01', s);
        }
        break;
      case 'speed':
        if (this.sound) this.sound.playClick();
        this.scene.setCameraPreset('drive_head');
        this.hud.setFilter('drivetrain');
        this.focusOnSensor('speed_head_drive');
        {
          const s = this.latestState?.sensors?.speed_head_drive || this.getDefaultSensor('speed_head_drive');
          this.drawer.open('speed_head_drive', s);
        }
        break;
      case 'vision':
        if (this.sound) this.sound.playClick();
        if (this.drawer) this.drawer.close();
        this.scene.setCameraPreset('intake_scanner');
        this.hud.setFilter('vision');
        this.focusOnSensor('damage_st01');
        if (this.depthVision) {
          this.depthVision.openConsoleModal();
        }
        break;
      case 'temperature':
        if (this.sound) this.sound.playClick();
        this.scene.setCameraPreset('drive_head');
        this.hud.setFilter('vibration');
        this.focusOnSensor('temp_bearing_01');
        {
          const s = this.latestState?.sensors?.temp_bearing_01 || this.getDefaultSensor('temp_bearing_01');
          this.drawer.open('temp_bearing_01', s);
        }
        break;
      case 'alarms':
        if (this.sound) this.sound.playClick();
        this.hud.setFilter('overview');
        this.focusOnSensor('misalignment_st01');
        {
          const s = this.latestState?.sensors?.misalignment_st01 || this.getDefaultSensor('misalignment_st01');
          this.drawer.open('misalignment_st01', s);
        }
        break;
      case 'settings':
        if (this.sound) this.sound.playClick();
        if (this.drawer) this.drawer.close();
        if (this.settingsModal) {
          this.settingsModal.open('thresholds');
        }
        break;
      default:
        break;
    }
  }

  getDefaultSensor(key) {
    const defaults = {
      misalignment_st01: { tag: 'Misalignment ST01', val: 32.40, unit: 'mm', status: 'normal', warn_limit: 45.0, crit_limit: 50.0, description: 'Return strand lateral drift' },
      misalignment_st02: { tag: 'Misalignment ST02', val: 72.33, unit: 'mm', status: 'warning', warn_limit: 71.2, crit_limit: 80.0, description: 'Carrying strand lateral drift' },
      load_sensor_st01: { tag: 'Load Sensor ST01', val: 0.0, unit: 'kg', status: 'normal', warn_limit: 45.0, crit_limit: 55.0, description: 'HX711 Load Cell - Frame Joint Stress (Nominal 0.0 kg)' },
      thickness_st01: { tag: 'Thickness ST01', val: 22.81, unit: 'mm', status: 'normal', warn_limit: 15.0, crit_limit: 10.0, description: 'Belt rubber carcass thickness' },
      speed_head_drive: { tag: 'Head Drive Speed', val: 3.08, unit: 'm/s', status: 'normal', warn_limit: 3.5, crit_limit: 4.0, description: 'Head discharge drum speed' },
      temp_bearing_01: { tag: 'Temperature ST01', val: 45.5, unit: '°C', status: 'normal', warn_limit: 65.0, crit_limit: 80.0, description: 'Drive motor idler bearing' },
      damage_st01: { tag: 'Damage ST01', val: 1, unit: 'count', status: 'normal', warn_limit: 3, crit_limit: 5, description: 'AI Vision Optical Profilometer' }
    };
    return defaults[key] || { tag: key, val: 0, unit: '', status: 'normal', warn_limit: 50, crit_limit: 75, description: 'Physical Sensor' };
  }

  focusOnSensor(key) {
    if (key.includes('head') || key.includes('current')) {
      this.scene.setCameraPreset('drive_head');
    } else if (key.includes('tail') || key.includes('thickness') || key.includes('load')) {
      this.scene.setCameraPreset('tail_tension');
    } else if (key.includes('damage')) {
      this.scene.setCameraPreset('intake_scanner');
    } else {
      this.scene.setCameraPreset('iso');
    }
  }

  setupClock() {
    const timestampEl = document.getElementById('ticker-timestamp');
    const updateTime = () => {
      const now = new Date();
      const options = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      };
      if (timestampEl) {
        timestampEl.textContent = now.toLocaleDateString('en-US', options);
      }
    };
    updateTime();
    setInterval(updateTime, 1000);
  }

  evaluateThresholds(state) {
    if (!this.customThresholds || !state.sensors) return;

    let normalCount = 0;
    let warnCount = 0;
    let critCount = 0;
    const total = Object.keys(state.sensors).length;

    for (const [key, sensor] of Object.entries(state.sensors)) {
      const th = this.customThresholds[key];
      if (th) {
        sensor.warn_limit = th.warn;
        sensor.crit_limit = th.crit;
        if (sensor.direction === 'min') {
          if (sensor.val <= th.crit) {
            sensor.status = 'critical';
            critCount++;
          } else if (sensor.val <= th.warn) {
            sensor.status = 'warning';
            warnCount++;
          } else {
            sensor.status = 'normal';
            normalCount++;
          }
        } else {
          if (sensor.val >= th.crit) {
            sensor.status = 'critical';
            critCount++;
          } else if (sensor.val >= th.warn) {
            sensor.status = 'warning';
            warnCount++;
          } else {
            sensor.status = 'normal';
            normalCount++;
          }
        }
      } else {
        if (sensor.status === 'critical') critCount++;
        else if (sensor.status === 'warning') warnCount++;
        else normalCount++;
      }
    }

    if (total > 0) {
      state.health = {
        optimal: Math.round((normalCount / total) * 1000) / 10,
        warning: Math.round((warnCount / total) * 1000) / 10,
        critical: Math.round((critCount / total) * 1000) / 10
      };
    }
  }

  async openAnalyticsModal() {
    if (this.sound) this.sound.playClick();
    let data = this.scrubber?.historyData;
    if (!data || !Array.isArray(data.days) || data.days.length === 0) {
      try {
        const res = await fetch('/api/telemetry/history');
        if (res.ok) {
          data = await res.json();
          if (this.scrubber) this.scrubber.historyData = data;
        }
      } catch (e) {
        console.warn('[Ore Sentinels] Failed to fetch history API, using fallback data:', e);
      }
    }
    if (!data && this.scrubber && typeof this.scrubber.getFallbackHistory === 'function') {
      data = this.scrubber.getFallbackHistory();
    }
    if (this.analyticsModal) {
      this.analyticsModal.open(data);
    }
  }

  applyTheme(theme) {
    this.currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('oresentinels_theme', theme);
    localStorage.setItem('beltxence_theme', theme);

    const themeLabel = document.getElementById('theme-toggle-label');
    const sunIcon = document.getElementById('theme-icon-sun');
    const moonIcon = document.getElementById('theme-icon-moon');

    if (themeLabel) {
      themeLabel.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
    }
    if (sunIcon && moonIcon) {
      sunIcon.style.display = theme === 'dark' ? 'inline-block' : 'none';
      moonIcon.style.display = theme === 'dark' ? 'none' : 'inline-block';
    }

    if (this.scene && typeof this.scene.setTheme === 'function') {
      this.scene.setTheme(theme);
    }
  }

  toggleTheme() {
    const nextTheme = this.currentTheme === 'light' ? 'dark' : 'light';
    this.applyTheme(nextTheme);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.app = new OreSentinelsApp();
  window.BeltXenceApp = OreSentinelsApp;
});
