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
import { IndustrialTrendChart } from './industrial_chart.js?v=industrial_v1';

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
    this.currentTheme = 'light';
    this.customThresholds = null;

    // Single-screen industrial dashboard telemetry state
    this.trendChart = null;
    this.telemetryHistory = [];
    this.eventsLog = [];
    this.lastTableUpdate = 0;
    this.previousParamStatuses = {};

    this.init();
  }

  init() {
    // 0. Initialize Procedural Sound Engine & Spatial 3D Cursor
    this.sound = new SoundFXEngine();
    this.cursorEngine = new SpatialCursorEngine();

    // 0.1 Initialize Theme (defaults to Clean Industrial White)
    this.currentTheme = localStorage.getItem('oresentinels_theme') || localStorage.getItem('beltxence_theme') || 'light';
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
      window.addEventListener('drone-tour-started', () => {
        btnDrone.classList.add('active-glow');
        const lbl = document.getElementById('drone-tour-btn-label');
        if (lbl) lbl.textContent = 'Exit Tour';
      });
      window.addEventListener('drone-tour-stopped', () => {
        btnDrone.classList.remove('active-glow');
        const lbl = document.getElementById('drone-tour-btn-label');
        if (lbl) lbl.textContent = 'Guided 3D Tour';
      });
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

    // Header Theme Toggle Button
    const themeBtn = document.getElementById('btn-theme-toggle');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        this.toggleTheme();
        if (this.sound) this.sound.playClick();
      });
    }

    // Header ESP32 COM19 Live Badge & Console Action
    const esp32Pill = document.getElementById('header-esp32-badge');
    const esp32ConsoleBtn = document.getElementById('btn-open-serial-monitor');
    if (esp32ConsoleBtn) {
      esp32ConsoleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openEsp32SerialModal();
        if (this.sound) this.sound.playClick();
      });
    }
    if (esp32Pill) {
      esp32Pill.addEventListener('click', () => {
        this.openEsp32SerialModal();
        if (this.sound) this.sound.playClick();
      });
    }

    // 9. Initialize Timeline Scrubber Bar
    const scrubberEl = document.getElementById('timeline-scrubber-bar');
    if (scrubberEl) {
      this.scrubber = new TimelineScrubber(scrubberEl, {
        onDaySelect: (dayIdx, snapshot, isLive) => {
          this.handleDaySelect(dayIdx, snapshot, isLive);
        },
        onOpenAnalytics: (historyData) => {
          this.openAnalyticsModal();
        }
      });
    }

    // 9b. Initialize Single-Screen Industrial Dashboard Components
    this.trendChart = new IndustrialTrendChart('telemetry-trends-canvas');
    this.setupDashboardTabs();
    this.setupCameraFeed();
    this.initEventsLog();
    this.initTelemetryTable();

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
      belt_speed: 0.85,
      num_joints: 2,
      sensors: {
        damage_st01: { tag: 'Damage ST01', val: 0, unit: 'count', status: 'normal', warn_limit: 3, crit_limit: 5, description: 'AI Vision Optical Profilometer' },
        misalignment_st01: { tag: 'Misalignment ST01', val: 2.80, unit: 'mm', status: 'normal', warn_limit: 45.0, crit_limit: 50.0, description: 'Return strand lateral drift' },
        misalignment_st02: { tag: 'Misalignment ST02', val: 4.30, unit: 'mm', status: 'normal', warn_limit: 71.2, crit_limit: 80.0, description: 'Carrying strand lateral drift' },
        load_sensor_st01: { tag: 'Load ST01', val: 0.09, unit: 'kg', status: 'normal', warn_limit: 45.0, crit_limit: 55.0, description: 'HX711 Load Cell - Frame Joint Stress (Nominal 0.09 kg, stress rises only when frame joints loosen)' },
        thickness_st01: { tag: 'Thickness ST01', val: 22.81, unit: 'mm', status: 'normal', warn_limit: 15.0, crit_limit: 10.0, description: 'Belt rubber carcass thickness' },
        speed_mid_02: { tag: 'Speed 02', val: 0.85, unit: 'm/s', status: 'normal', warn_limit: 2.2, crit_limit: 1.5, description: 'Carrying idler tachometer' },
        speed_head_drive: { tag: 'Head Drive Speed', val: 0.88, unit: 'm/s', status: 'normal', warn_limit: 3.5, crit_limit: 4.0, description: 'Head discharge drum speed' },
        speed_tail_01: { tag: 'Tail Drum Speed', val: 0.84, unit: 'm/s', status: 'normal', warn_limit: 2.0, crit_limit: 1.5, description: 'Tail tension drum tachometer' },
        temp_bearing_01: { tag: 'Temperature ST01', val: 26.5, unit: '°C', status: 'normal', warn_limit: 65.0, crit_limit: 80.0, description: 'Drive motor idler bearing' },
        current_motor_01: { tag: 'Motor Current', val: 4.2, unit: 'A', status: 'normal', warn_limit: 25.0, crit_limit: 32.0, description: 'Stator 3-phase current' },
        vibration_head: { tag: 'Head Vibration', val: 0.35, unit: 'mm/s', status: 'normal', warn_limit: 2.8, crit_limit: 4.5, description: 'Discharge frame vibration' },
        vibration_tail: { tag: 'Tail Vibration', val: 0.24, unit: 'mm/s', status: 'normal', warn_limit: 2.8, crit_limit: 4.5, description: 'Tension frame vibration' },
        vibration_mid1: { tag: 'Idler 1 Vibration', val: 0.18, unit: 'mm/s', status: 'normal', warn_limit: 2.8, crit_limit: 4.5, description: 'Mid idler 1 vibration' },
        vibration_mid2: { tag: 'Idler 2 Vibration', val: 0.22, unit: 'mm/s', status: 'normal', warn_limit: 2.8, crit_limit: 4.5, description: 'Mid idler 2 vibration' }
      },
      health: { optimal: 96.0, warning: 3.0, critical: 1.0 },
      alert_banner: 'All conveyor parameters within normal operating envelope.',
      alert_tag: 'Optimal'
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

    // 6. Update Physical ESP32 COM19 Live Badge
    if (state.esp32_com19) {
      this.updateEsp32Pill(state.esp32_com19);
    }

    // 7. Update Single-Screen Industrial Conveyor Monitoring Dashboard
    this.updateIndustrialDashboard(state);
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
      misalignment_st01: { tag: 'Misalignment ST01', val: 2.80, unit: 'mm', status: 'normal', warn_limit: 45.0, crit_limit: 50.0, description: 'Return strand lateral drift' },
      misalignment_st02: { tag: 'Misalignment ST02', val: 4.30, unit: 'mm', status: 'normal', warn_limit: 71.2, crit_limit: 80.0, description: 'Carrying strand lateral drift' },
      load_sensor_st01: { tag: 'Load ST01', val: 0.09, unit: 'kg', status: 'normal', warn_limit: 45.0, crit_limit: 55.0, description: 'HX711 Load Cell - Frame Joint Stress (Nominal 0.09 kg)' },
      thickness_st01: { tag: 'Thickness ST01', val: 22.81, unit: 'mm', status: 'normal', warn_limit: 15.0, crit_limit: 10.0, description: 'Belt rubber carcass thickness' },
      speed_head_drive: { tag: 'Head Drive Speed', val: 0.88, unit: 'm/s', status: 'normal', warn_limit: 3.5, crit_limit: 4.0, description: 'Head discharge drum speed' },
      temp_bearing_01: { tag: 'Temperature ST01', val: 26.5, unit: '°C', status: 'normal', warn_limit: 65.0, crit_limit: 80.0, description: 'Drive motor idler bearing' },
      damage_st01: { tag: 'Damage ST01', val: 0, unit: 'count', status: 'normal', warn_limit: 3, crit_limit: 5, description: 'AI Vision Optical Profilometer' }
    };
    return defaults[key] || { tag: key, val: 0, unit: '', status: 'normal', warn_limit: 50, crit_limit: 75, description: 'Physical Component' };
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
    const headerClockEl = document.getElementById('header-clock');
    const updateTime = () => {
      const now = new Date();
      if (headerClockEl) {
        const yr = now.getFullYear();
        const mo = String(now.getMonth() + 1).padStart(2, '0');
        const da = String(now.getDate()).padStart(2, '0');
        const hr = String(now.getHours()).padStart(2, '0');
        const mi = String(now.getMinutes()).padStart(2, '0');
        const sc = String(now.getSeconds()).padStart(2, '0');
        headerClockEl.textContent = `${yr}-${mo}-${da} ${hr}:${mi}:${sc}`;
      }
      if (timestampEl) {
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
      themeLabel.textContent = theme === 'light' ? 'Dark Mode' : 'Light Mode';
    }
    if (sunIcon && moonIcon) {
      sunIcon.style.display = theme === 'light' ? 'none' : 'inline-block';
      moonIcon.style.display = theme === 'light' ? 'inline-block' : 'none';
    }

    if (this.scene && typeof this.scene.setTheme === 'function') {
      this.scene.setTheme(theme);
    }
  }

  toggleTheme() {
    const nextTheme = this.currentTheme === 'light' ? 'dark' : 'light';
    this.applyTheme(nextTheme);
  }

  updateEsp32Pill(esp) {
    const pill = document.getElementById('header-esp32-badge');
    const led = document.getElementById('esp32-pill-led');
    const status = document.getElementById('esp32-pill-status');
    const rx = document.getElementById('esp32-pill-rx');
    const temp = document.getElementById('esp32-pill-temp');
    const vib = document.getElementById('esp32-pill-vib');

    if (!pill) return;

    if (esp.connected) {
      pill.classList.remove('disconnected');
      if (led) {
        led.className = 'status-dot-solid';
        led.style.background = '#10b981';
      }
      if (status) {
        status.textContent = esp.port ? `PORTS: ${esp.port}` : 'HARDWARE: CONNECTED';
        status.style.color = '#10b981';
      }
      if (rx) rx.textContent = `${esp.rx_count || 0} RX`;
      if (temp) temp.textContent = `${(esp.temperature_c || 0).toFixed(1)}°C`;
      if (vib) vib.textContent = `${(esp.vibration_rms || 0).toFixed(2)}g`;
    } else {
      pill.classList.add('disconnected');
      if (led) {
        led.className = 'status-dot-solid';
        led.style.background = '#f59e0b';
      }
      if (status) {
        status.textContent = 'SCANNING PORTS...';
        status.style.color = '#f59e0b';
      }
      if (rx) rx.textContent = '0 RX';
    }
  }


  openEsp32SerialModal() {
    const root = document.getElementById('com19-modal-root');
    if (!root) return;

    root.innerHTML = `
      <div class="analytics-modal-backdrop" id="com19-backdrop">
        <div class="com19-modal-dialog" role="dialog" aria-modal="true">
          <div class="modal-header" style="padding: 16px 20px; border-bottom: 1px solid rgba(0,0,0,0.08);">
            <div>
              <span class="modal-kicker" style="color: #0284c7;">PHYSICAL DAQ TELEMETRY</span>
              <h2 class="modal-title" style="margin-top: 2px; font-size: 1.15rem;">ESP32 Serial Terminal · COM19</h2>
              <p class="modal-subtitle" style="font-size: 0.74rem;">Live Line-Delimited Telemetry Stream @ 115200 Baud (8-N-1)</p>
            </div>
            <button id="btn-close-com19" class="modal-close-btn" title="Close Terminal">✕</button>
          </div>
          <div style="padding: 16px 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <div style="display: flex; align-items: center; gap: 8px; font-size: 0.75rem; font-weight: 700;">
                <span class="hw-pulse-led led-green"></span>
                <span>Silicon Labs CP210x USB to UART Bridge (COM19)</span>
              </div>
              <div style="display: flex; gap: 8px;">
                <button id="btn-clear-com19-buf" class="btn-subtle-action" style="padding: 3px 10px; font-size: 0.70rem;">Clear</button>
                <button id="btn-ping-esp32" class="btn-subtle-action" style="padding: 3px 10px; font-size: 0.70rem;">Send PING</button>
              </div>
            </div>
            <div class="com19-terminal-window" id="com19-terminal-stream">
              <div style="color: #94a3b8; font-style: italic;">Connecting to COM19 telemetry stream...</div>
            </div>
            <div class="com19-cmd-bar">
              <input type="text" id="com19-cmd-input" class="com19-cmd-input" placeholder='Type command e.g. {"cmd":"PING"} or {"cmd":"SET_BEACON","color":"GREEN"}' />
              <button id="btn-send-com19-cmd" class="pill-action-btn" style="padding: 0 16px;">Send</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const closeBtn = root.querySelector('#btn-close-com19');
    const backdrop = root.querySelector('#com19-backdrop');
    const close = () => {
      if (this.com19PollInterval) {
        clearInterval(this.com19PollInterval);
        this.com19PollInterval = null;
      }
      root.innerHTML = '';
    };

    if (closeBtn) closeBtn.addEventListener('click', close);
    if (backdrop) backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close();
    });

    const clearBtn = root.querySelector('#btn-clear-com19-buf');
    const streamBox = root.querySelector('#com19-terminal-stream');
    if (clearBtn && streamBox) {
      clearBtn.addEventListener('click', () => { streamBox.innerHTML = ''; });
    }

    const input = root.querySelector('#com19-cmd-input');
    const sendBtn = root.querySelector('#btn-send-com19-cmd');
    const sendCmd = async (cmdText) => {
      if (!cmdText) return;
      try {
        await fetch('/api/serial/send', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: cmdText
        });
        if (input) input.value = '';
      } catch (err) {
        console.error('Failed to send serial command:', err);
      }
    };

    if (sendBtn && input) {
      sendBtn.addEventListener('click', () => sendCmd(input.value.trim()));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendCmd(input.value.trim());
      });
    }

    const pingBtn = root.querySelector('#btn-ping-esp32');
    if (pingBtn) {
      pingBtn.addEventListener('click', () => sendCmd('{"cmd":"PING"}'));
    }

    const escapeHtml = (str) => {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    };

    // Start polling logs
    const updateLogs = async () => {
      try {
        const res = await fetch('/api/serial/log');
        if (res.ok) {
          const data = await res.json();
          if (data.logs && streamBox) {
            streamBox.innerHTML = data.logs.map(l => `
              <div class="com19-terminal-line">
                <span class="com19-tag-time">[${l.time}]</span>
                <span class="${l.direction === 'TX' ? 'com19-tag-tx' : 'com19-tag-rx'}">${l.direction || 'RX'}</span>
                <span class="com19-line-text">${escapeHtml(l.text)}</span>
              </div>
            `).join('');
            streamBox.scrollTop = streamBox.scrollHeight;
          }
        }
      } catch (e) {}
    };

    updateLogs();
    this.com19PollInterval = setInterval(updateLogs, 500);
  }

  // ==============================================================================
  // SINGLE-SCREEN INDUSTRIAL DASHBOARD METHODS
  // ==============================================================================

  setupDashboardTabs() {
    const btnChart = document.getElementById('btn-tab-chart');
    const btn3D = document.getElementById('btn-tab-3d');
    const chartWrap = document.getElementById('trend-chart-wrapper');
    const twinWrap = document.getElementById('twin-3d-wrapper');
    const heading = document.getElementById('panel-view-heading');

    if (btnChart && btn3D && chartWrap && twinWrap) {
      btnChart.addEventListener('click', () => {
        btnChart.classList.add('active');
        btn3D.classList.remove('active');
        chartWrap.style.display = 'flex';
        twinWrap.style.display = 'none';
        if (heading) heading.textContent = 'LIVE TELEMETRY TRENDS';
        if (this.trendChart) this.trendChart.resizeAndRender();
        if (this.sound) this.sound.playClick();
      });

      btn3D.addEventListener('click', () => {
        btn3D.classList.add('active');
        btnChart.classList.remove('active');
        chartWrap.style.display = 'none';
        twinWrap.style.display = 'block';
        if (heading) heading.textContent = '3D DIGITAL TWIN VIEW';
        if (this.scene && typeof this.scene.onWindowResize === 'function') {
          setTimeout(() => this.scene.onWindowResize(), 50);
        }
        if (this.sound) this.sound.playClick();
      });
    }

    // Timeframe selector buttons
    const tfBtns = document.querySelectorAll('#chart-tf-controls .tf-btn');
    tfBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tfBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tf = btn.dataset.tf || '1h';
        if (this.trendChart) {
          this.trendChart.setTimeframe(tf);
        }
        if (this.sound) this.sound.playClick();
      });
    });
  }

  setupCameraFeed() {
    const camImg = document.getElementById('live-cam-img');
    const fallback = document.getElementById('cam-fallback-ui');
    const badge = document.getElementById('vision-feed-badge');
    const btnFetch = document.getElementById('btn-fetch-camera');
    const btnAuto = document.getElementById('btn-cam-auto');
    const btnSnapshot = document.getElementById('btn-cam-snapshot');
    const btnDemo = document.getElementById('btn-cam-demo');

    let snapshotInterval = null;

    const setButtonsActive = (activeBtn) => {
      [btnFetch, btnAuto, btnSnapshot, btnDemo].forEach(b => {
        if (b) b.classList.remove('active');
      });
      if (activeBtn) activeBtn.classList.add('active');
    };

    const activateLiveStream = () => {
      if (snapshotInterval) clearInterval(snapshotInterval);
      if (camImg && fallback) {
        camImg.style.display = 'block';
        fallback.style.display = 'none';
        camImg.src = '/api/camera/stream.mjpg?t=' + Date.now();
        if (badge) {
          badge.textContent = 'LIVE FEED (LOGI C270)';
          badge.style.color = '#10b981';
          badge.style.borderColor = 'rgba(16, 185, 129, 0.35)';
        }
      }
    };

    const activateSnapshotMode = () => {
      if (snapshotInterval) clearInterval(snapshotInterval);
      if (camImg && fallback) {
        camImg.style.display = 'block';
        fallback.style.display = 'none';
        const refresh = () => {
          camImg.src = '/api/camera/snapshot.jpg?t=' + Date.now();
        };
        refresh();
        snapshotInterval = setInterval(refresh, 80); // ~12 FPS
        if (badge) {
          badge.textContent = 'SNAPSHOT STREAM (12 FPS)';
          badge.style.color = '#38bdf8';
          badge.style.borderColor = 'rgba(56, 189, 248, 0.35)';
        }
      }
    };

    const fetchAndConnectCamera = async () => {
      if (badge) {
        badge.textContent = 'CONNECTING CAMERA...';
        badge.style.color = '#0284c7';
      }
      try {
        const res = await fetch('/api/camera/status');
        if (res.ok) {
          const data = await res.json();
          if (data.camera && data.camera.connected) {
            setButtonsActive(btnAuto);
            activateLiveStream();
            return;
          }
        }
      } catch (e) {
        console.warn('Camera status check error:', e);
      }

      // Check snapshot fallback
      try {
        const snapRes = await fetch('/api/camera/snapshot.jpg');
        if (snapRes.ok) {
          setButtonsActive(btnAuto);
          activateLiveStream();
          return;
        }
      } catch (e) {}

      // If offline
      if (snapshotInterval) clearInterval(snapshotInterval);
      if (camImg) camImg.style.display = 'none';
      if (fallback) fallback.style.display = 'flex';
      if (badge) {
        badge.textContent = 'CAMERA OFFLINE / DEMO FEED';
        badge.style.color = '#94a3b8';
      }
    };

    // Auto-fetch camera on startup
    fetchAndConnectCamera();

    // Button event listeners
    if (btnFetch) {
      btnFetch.addEventListener('click', () => {
        setButtonsActive(btnFetch);
        fetchAndConnectCamera();
        if (this.sound) this.sound.playClick();
      });
    }

    if (btnAuto) {
      btnAuto.addEventListener('click', () => {
        setButtonsActive(btnAuto);
        activateLiveStream();
        if (this.sound) this.sound.playClick();
      });
    }

    if (btnSnapshot) {
      btnSnapshot.addEventListener('click', () => {
        setButtonsActive(btnSnapshot);
        activateSnapshotMode();
        if (this.sound) this.sound.playClick();
      });
    }

    if (btnDemo) {
      btnDemo.addEventListener('click', () => {
        setButtonsActive(btnDemo);
        if (snapshotInterval) clearInterval(snapshotInterval);
        if (camImg) camImg.style.display = 'none';
        if (fallback) fallback.style.display = 'flex';
        if (badge) {
          badge.textContent = 'OFFLINE / DEMO VIEW';
          badge.style.color = '#f59e0b';
        }
        if (this.sound) this.sound.playClick();
      });
    }

    // Fullscreen Mode Buttons (index.html)
    const btnIndexFs = document.getElementById('btn-index-cam-fullscreen');
    const btnQuickFs = document.getElementById('btn-quick-index-fullscreen');

    const launchFs = () => {
      if (this.depthVision && this.depthVision.openFullscreenTheater) {
        this.depthVision.openFullscreenTheater();
      } else {
        const modal = document.getElementById('camera-fullscreen-modal');
        if (modal) {
          modal.style.display = 'flex';
          const exitBtn = modal.querySelector('#btn-theater-exit');
          if (exitBtn) exitBtn.onclick = () => { modal.style.display = 'none'; };
        }
      }
      if (this.sound) this.sound.playClick();
    };

    if (btnIndexFs) btnIndexFs.addEventListener('click', launchFs);
    if (btnQuickFs) btnQuickFs.addEventListener('click', launchFs);
    if (camImg) {
      camImg.style.cursor = 'pointer';
      camImg.title = 'Click to open Fullscreen Camera (Press F)';
      camImg.addEventListener('click', launchFs);
    }
  }


  initEventsLog() {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];

    this.eventsLog = [
      { time: timeStr, desc: 'All monitored conveyor parameters within normal operating envelope', status: 'normal' },
      { time: timeStr, desc: 'Hardware DAQ telemetry node online on COM19 (115200 baud)', status: 'normal' },
      { time: timeStr, desc: 'Inline optical inspection active (DEMO FEED / INLINE)', status: 'normal' }
    ];
    this.renderEventsLog();
  }

  renderEventsLog() {
    const container = document.getElementById('events-log-container');
    if (!container) return;

    container.innerHTML = this.eventsLog.slice(0, 8).map(ev => `
      <div class="event-entry ${ev.status === 'warning' ? 'event-warn' : (ev.status === 'critical' ? 'event-crit' : '')}">
        <div class="event-time-desc">
          <span class="event-time">${ev.time}</span>
          <span class="event-desc">&bull; ${ev.desc}</span>
        </div>
        <span class="event-tag ${ev.status === 'warning' ? 'status-warning' : (ev.status === 'critical' ? 'status-critical' : 'status-normal')}">${ev.status.toUpperCase()}</span>
      </div>
    `).join('');
  }

  addEventLog(ev) {
    if (!this.eventsLog) this.eventsLog = [];
    this.eventsLog.unshift(ev);
    if (this.eventsLog.length > 12) this.eventsLog.pop();
    this.renderEventsLog();
  }

  initTelemetryTable() {
    const tbody = document.getElementById('telemetry-table-body');
    if (!tbody) return;
    const now = Date.now();
    this.telemetryHistory = [];
    for (let i = 4; i >= 0; i--) {
      const d = new Date(now - i * 3000);
      const timeStr = d.toTimeString().split(' ')[0];
      this.telemetryHistory.push({
        time: timeStr,
        temp: (27.4 + (i * 0.05)).toFixed(1),
        vib: (0.42 - (i * 0.01)).toFixed(2),
        load: (0.48).toFixed(2),
        thick: (22.1).toFixed(1),
        speed: (0.86).toFixed(2),
        current: (2.3).toFixed(1),
        misalign: (3.5 + (i * 0.1)).toFixed(1),
        status: 'normal'
      });
    }
    tbody.innerHTML = this.telemetryHistory.map(row => `
      <tr>
        <td>${row.time}</td>
        <td>${row.temp}</td>
        <td>${row.vib}</td>
        <td>${row.load}</td>
        <td>${row.thick}</td>
        <td>${row.speed}</td>
        <td>${row.current}</td>
        <td>${row.misalign}</td>
        <td><span class="param-status-badge status-normal">NORMAL</span></td>
      </tr>
    `).join('');
  }

  updateTelemetryTable(telemetry, overallStatus) {
    const now = Date.now();
    if (now - this.lastTableUpdate < 2200) return;
    this.lastTableUpdate = now;

    const tbody = document.getElementById('telemetry-table-body');
    if (!tbody) return;

    const timeStr = new Date().toTimeString().split(' ')[0];

    const rowData = {
      time: timeStr,
      temp: telemetry.temperature.toFixed(1),
      vib: telemetry.vibration.toFixed(2),
      load: telemetry.load.toFixed(2),
      thick: telemetry.thickness.toFixed(1),
      speed: telemetry.speed.toFixed(2),
      current: telemetry.current.toFixed(1),
      misalign: telemetry.misalignment.toFixed(1),
      status: overallStatus
    };

    if (!this.telemetryHistory) this.telemetryHistory = [];
    this.telemetryHistory.unshift(rowData);
    if (this.telemetryHistory.length > 7) {
      this.telemetryHistory.pop();
    }

    tbody.innerHTML = this.telemetryHistory.map(row => `
      <tr>
        <td>${row.time}</td>
        <td>${row.temp}</td>
        <td>${row.vib}</td>
        <td>${row.load}</td>
        <td>${row.thick}</td>
        <td>${row.speed}</td>
        <td>${row.current}</td>
        <td>${row.misalign}</td>
        <td><span class="param-status-badge ${row.status === 'critical' ? 'status-critical' : (row.status === 'warning' ? 'status-warning' : 'status-normal')}">${row.status.toUpperCase()}</span></td>
      </tr>
    `).join('');
  }

  updateIndustrialDashboard(state) {
    const proto = state.prototype_telemetry || {};
    const s = state.sensors || {};

    // 1. Single Central Telemetry Object
    const telemetry = {
      temperature: proto.temperature !== undefined ? proto.temperature : (s.temp_bearing_01?.val ?? 27.4),
      vibration: proto.vibration !== undefined ? proto.vibration : (s.vibration_head?.val ?? 0.42),
      load: proto.load !== undefined ? proto.load : (s.load_sensor_st01?.val ?? 0.48),
      thickness: proto.thickness !== undefined ? proto.thickness : (s.thickness_st01?.val ?? 22.1),
      speed: proto.speed !== undefined ? proto.speed : (state.belt_speed ?? 0.86),
      current: proto.current !== undefined ? proto.current : (s.current_motor_01?.val ?? 2.3),
      misalignment: proto.misalignment !== undefined ? proto.misalignment : (s.misalignment_st01?.val ?? 3.5),
      bearing_temperature: proto.bearing_temperature !== undefined ? proto.bearing_temperature : (s.temp_bearing_01?.val ?? 28.7),
      wear_loss: proto.wear_loss !== undefined ? proto.wear_loss : 0.06,
      wear_rate: proto.wear_rate !== undefined ? proto.wear_rate : 0.002
    };

    // 2. Dynamic Rule-Based Status & Health Evaluation for Each Parameter
    // Temperature: 20–40 normal, 40–65 warning, >65 critical
    let tempStatus = 'normal', tempScore = 98;
    if (telemetry.temperature > 65.0) { tempStatus = 'critical'; tempScore = 40; }
    else if (telemetry.temperature > 40.0 || telemetry.temperature < 20.0) { tempStatus = 'warning'; tempScore = 75; }

    // Vibration: 0–2.0 normal, 2.0–3.5 warning, >3.5 critical
    let vibStatus = 'normal', vibScore = 98;
    if (telemetry.vibration > 3.5) { vibStatus = 'critical'; vibScore = 35; }
    else if (telemetry.vibration > 2.0) { vibStatus = 'warning'; vibScore = 70; }

    // Load: 0–5 kg normal, 5–8 warning, >8 critical
    let loadStatus = 'normal', loadScore = 98;
    if (telemetry.load > 8.0) { loadStatus = 'critical'; loadScore = 35; }
    else if (telemetry.load > 5.0) { loadStatus = 'warning'; loadScore = 75; }

    // Thickness: 18–25 mm normal, 15–18 warning, <15 critical
    let thickStatus = 'normal', thickScore = 98;
    if (telemetry.thickness < 15.0) { thickStatus = 'critical'; thickScore = 30; }
    else if (telemetry.thickness < 18.0) { thickStatus = 'warning'; thickScore = 70; }

    // Speed: 0.5–2.0 m/s normal, 0.3–0.5 or 2.0–3.0 warning, outside critical
    let speedStatus = 'normal', speedScore = 98;
    if (telemetry.speed < 0.3 || telemetry.speed > 3.0) { speedStatus = 'critical'; speedScore = 35; }
    else if (telemetry.speed < 0.5 || telemetry.speed > 2.0) { speedStatus = 'warning'; speedScore = 75; }

    // Current: 0–5 A normal, 5–7 warning, >7 critical
    let curStatus = 'normal', curScore = 98;
    if (telemetry.current > 7.0) { curStatus = 'critical'; curScore = 35; }
    else if (telemetry.current > 5.0) { curStatus = 'warning'; curScore = 75; }

    // Misalignment: 0–10 mm normal, 10–20 warning, >20 critical
    let misStatus = 'normal', misScore = 98;
    if (telemetry.misalignment > 20.0) { misStatus = 'critical'; misScore = 35; }
    else if (telemetry.misalignment > 10.0) { misStatus = 'warning'; misScore = 70; }

    // Bearing Temperature: 20–60 normal, 60–75 warning, >75 critical
    let bearStatus = 'normal', bearScore = 98;
    if (telemetry.bearing_temperature > 75.0) { bearStatus = 'critical'; bearScore = 35; }
    else if (telemetry.bearing_temperature > 60.0 || telemetry.bearing_temperature < 20.0) { bearStatus = 'warning'; bearScore = 70; }

    // Wear Loss: 0–0.20 mm normal, 0.20–0.35 warning, >0.35 critical
    let wearLossStatus = 'normal', wearLossScore = 98;
    if (telemetry.wear_loss > 0.35) { wearLossStatus = 'critical'; wearLossScore = 35; }
    else if (telemetry.wear_loss > 0.20) { wearLossStatus = 'warning'; wearLossScore = 70; }

    // Wear Rate: 0–0.01 mm/day normal, 0.01–0.02 warning, >0.02 critical
    let wearRateStatus = 'normal', wearRateScore = 98;
    if (telemetry.wear_rate > 0.02) { wearRateStatus = 'critical'; wearRateScore = 35; }
    else if (telemetry.wear_rate > 0.01) { wearRateStatus = 'warning'; wearRateScore = 70; }

    // 3. Weighted Belt Health Calculation:
    // Temperature = 10%, Vibration = 15%, Load = 10%, Thickness = 15%, Speed = 5%, Current = 10%, Misalignment = 10%, Bearing Temperature = 10%, Wear Loss = 10%, Wear Rate = 5%
    const calculatedHealth = Math.round(
      tempScore * 0.10 +
      vibScore * 0.15 +
      loadScore * 0.10 +
      thickScore * 0.15 +
      speedScore * 0.05 +
      curScore * 0.10 +
      misScore * 0.10 +
      bearScore * 0.10 +
      wearLossScore * 0.10 +
      wearRateScore * 0.05
    );

    // Update Belt Health UI
    const healthValEl = document.getElementById('belt-health-val');
    const healthTagEl = document.getElementById('belt-health-tag');
    const healthMeterEl = document.getElementById('belt-health-meter');

    if (healthValEl) healthValEl.textContent = `${calculatedHealth}%`;
    if (healthMeterEl) {
      healthMeterEl.style.width = `${calculatedHealth}%`;
      healthMeterEl.style.background = calculatedHealth >= 90 ? '#10b981' : (calculatedHealth >= 60 ? '#f59e0b' : '#ef4444');
    }
    if (healthTagEl) {
      let tag = 'HEALTHY';
      let tagCls = 'status-healthy';
      if (calculatedHealth < 60) {
        tag = 'CRITICAL';
        tagCls = 'status-critical';
      } else if (calculatedHealth < 90) {
        tag = 'WARNING';
        tagCls = 'status-warning';
      }
      healthTagEl.textContent = tag;
      healthTagEl.className = `health-status-tag ${tagCls}`;
    }

    // 4. Update the 10 Main Parameter Cards
    const updateCard = (key, valStr, status) => {
      const valEl = document.getElementById(`val-${key}`);
      const statusEl = document.getElementById(`status-${key}`);
      if (valEl) valEl.textContent = valStr;
      if (statusEl) {
        const label = status === 'critical' ? '● CRITICAL' : (status === 'warning' ? '● WARNING' : '● NORMAL');
        const cls = status === 'critical' ? 'status-critical' : (status === 'warning' ? 'status-warning' : 'status-normal');
        statusEl.textContent = label;
        statusEl.className = `param-status-badge ${cls}`;
      }

      // Check for alert state transition
      const prev = this.previousParamStatuses[key];
      if (prev && prev !== status && status !== 'normal') {
        const timeStr = new Date().toTimeString().split(' ')[0];
        this.addEventLog({
          time: timeStr,
          desc: `${key.toUpperCase()} threshold excursion: ${valStr} (${status.toUpperCase()})`,
          status: status
        });
      }
      this.previousParamStatuses[key] = status;
    };

    updateCard('temperature', telemetry.temperature.toFixed(1), tempStatus);
    updateCard('vibration', telemetry.vibration.toFixed(2), vibStatus);
    updateCard('load', telemetry.load.toFixed(2), loadStatus);
    updateCard('thickness', telemetry.thickness.toFixed(1), thickStatus);
    updateCard('speed', telemetry.speed.toFixed(2), speedStatus);
    updateCard('current', telemetry.current.toFixed(1), curStatus);
    updateCard('misalignment', telemetry.misalignment.toFixed(1), misStatus);
    updateCard('bearing-temp', telemetry.bearing_temperature.toFixed(1), bearStatus);
    updateCard('wear-loss', telemetry.wear_loss.toFixed(2), wearLossStatus);
    updateCard('wear-rate', telemetry.wear_rate.toFixed(3), wearRateStatus);

    // 5. Update Telemetry Trend Chart
    if (this.trendChart) {
      this.trendChart.addPoint(telemetry);
    }

    // 6. Update Recent Telemetry Table
    const overallStatus = calculatedHealth >= 90 ? 'normal' : (calculatedHealth >= 60 ? 'warning' : 'critical');
    this.updateTelemetryTable(telemetry, overallStatus);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.app = new OreSentinelsApp();
  window.BeltXenceApp = OreSentinelsApp;
});
