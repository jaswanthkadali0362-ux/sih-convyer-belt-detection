/**
 * Multi-Sensor Telemetry Hub Controller
 * Node 1: ESP32 (Conveyor Frame MPU-6050 6-Axis IMU & Vibration - COM19) @ 115200 Baud
 * Node 2: Arduino Uno (Conveyor Belt Tracker & Speedometer on Pin 2 - COM23) @ 9600 Baud
 * Node 3: ESP32 (HX711 Digital Load Cell Scale & MPU-6050 - COM21) @ 115200 Baud
 */

document.addEventListener('DOMContentLoaded', () => {
  const state = {
    b1: {
      port: null,
      reader: null,
      readableStreamClosed: null,
      isConnected: false,
      packetCount: 0,
      lastSecPackets: 0,
      rateHz: 0,
      visualizer: null,
      chartAccel: null,
      chartGyro: null,
      lastGTotal: 1.0,
      consoleLines: []
    },
    b2: {
      port: null,
      reader: null,
      readableStreamClosed: null,
      isConnected: false,
      packetCount: 0,
      lastSecPackets: 0,
      rateHz: 0,
      chartSpeed: null,
      currentLocation: 1,
      currentSpeed: 0.0,
      lastDt: 0,
      markerDistance: 8.0,
      lastSimTrigger: 0,
      lineDetectionFlashTimer: null,
      consoleLines: []
    },
    b3: {
      port: null,
      reader: null,
      readableStreamClosed: null,
      isConnected: false,
      packetCount: 0,
      lastSecPackets: 0,
      rateHz: 0,
      weightOffset: 0.0,
      peakWeight: 0.0,
      lastGTotal: 1.0,
      visualizer: null,
      chartWeight: null,
      chartAccel: null,
      chartGyro: null,
      consoleLines: []
    },
    thresholds: {
      weightLimit: 50.0,
      shockG: 1.45,
      gyroSpike: 90.0,
      soundEnabled: true
    },
    alarms: {
      weightActive: false,
      shockB1Active: false,
      shockB3Active: false,
      shockB1Timer: null,
      shockB3Timer: null,
      lastSoundTime: 0
    },
    simActive: false,
    simTimer: null,
    totalPackets: 0,
    recordedData: []
  };

  // Check Web Serial API support
  const hasWebSerial = 'serial' in navigator;
  const webSerialBadge = document.getElementById('webserial-indicator');
  const webSerialText = document.getElementById('webserial-support-text');
  if (!hasWebSerial) {
    webSerialBadge.classList.remove('green');
    webSerialBadge.classList.add('red');
    webSerialText.innerText = 'Web Serial API unsupported (Use Chrome, Edge, or Brave)';
  }

  // -------------------------------------------------------------------------
  // Initialize Node 1 Components (ESP32 - Conveyor Frame MPU-6050)
  // -------------------------------------------------------------------------
  state.b1.visualizer = new BoardVisualizer3D('b1-canvas-3d', { themeColor: '#00f0ff', boardName: 'Conveyor Frame IMU' });

  state.b1.chartAccel = new TelemetryStreamChart('b1-chart-accel', {
    minY: -2.0, maxY: 2.0,
    channels: [
      { name: 'Ax', color: '#f43f5e' },
      { name: 'Ay', color: '#10b981' },
      { name: 'Az', color: '#38bdf8' }
    ]
  });

  state.b1.chartGyro = new TelemetryStreamChart('b1-chart-gyro', {
    minY: -100, maxY: 100,
    channels: [
      { name: 'Gx', color: '#fb923c' },
      { name: 'Gy', color: '#facc15' },
      { name: 'Gz', color: '#a855f7' }
    ]
  });

  // -------------------------------------------------------------------------
  // Initialize Node 2 Components (Arduino Uno - Conveyor Tracker & Speedometer)
  // -------------------------------------------------------------------------
  state.b2.chartSpeed = new TelemetryStreamChart('b2-chart-speed', {
    minY: 0, maxY: 60, autoScale: true,
    channels: [{ name: 'Conveyor Speed', color: '#b026ff' }]
  });

  // -------------------------------------------------------------------------
  // Initialize Node 3 Components (ESP32 - Load Cell Scale & MPU-6050 - COM21)
  // -------------------------------------------------------------------------
  state.b3.visualizer = new BoardVisualizer3D('b3-canvas-3d', { themeColor: '#f59e0b', boardName: 'Scale & IMU' });

  state.b3.chartWeight = new TelemetryStreamChart('b3-chart-weight', {
    minY: 0, maxY: 500, autoScale: true,
    channels: [{ name: 'Weight (g)', color: '#f59e0b' }]
  });

  state.b3.chartAccel = new TelemetryStreamChart('b3-chart-accel', {
    minY: -2.0, maxY: 2.0,
    channels: [
      { name: 'Ax', color: '#f43f5e' },
      { name: 'Ay', color: '#10b981' },
      { name: 'Az', color: '#38bdf8' }
    ]
  });

  state.b3.chartGyro = new TelemetryStreamChart('b3-chart-gyro', {
    minY: -100, maxY: 100,
    channels: [
      { name: 'Gx', color: '#fb923c' },
      { name: 'Gy', color: '#facc15' },
      { name: 'Gz', color: '#a855f7' }
    ]
  });

  // Calculate packet rates every second
  setInterval(() => {
    state.b1.rateHz = state.b1.packetCount - state.b1.lastSecPackets;
    state.b1.lastSecPackets = state.b1.packetCount;
    const b1Rate = document.getElementById('b1-rate');
    if (b1Rate) b1Rate.innerText = `${state.b1.rateHz} Hz`;

    state.b2.rateHz = state.b2.packetCount - state.b2.lastSecPackets;
    state.b2.lastSecPackets = state.b2.packetCount;
    const b2Rate = document.getElementById('b2-rate');
    if (b2Rate) b2Rate.innerText = `${state.b2.rateHz} Hz`;

    state.b3.rateHz = state.b3.packetCount - state.b3.lastSecPackets;
    state.b3.lastSecPackets = state.b3.packetCount;
    const b3Rate = document.getElementById('b3-rate');
    if (b3Rate) b3Rate.innerText = `${state.b3.rateHz} Hz`;
  }, 1000);

  // -------------------------------------------------------------------------
  // On-Screen Serial Console Logger
  // -------------------------------------------------------------------------
  function logToConsole(prefix, text, type = 'rx') {
    const el = document.getElementById(`${prefix}-console`);
    if (!el) return;
    const now = new Date().toTimeString().split(' ')[0];
    const lineClass = type === 'err' ? 'serial-line-err' : (type === 'ok' ? 'serial-line-ok' : 'serial-line-rx');
    const newLine = `<div class="${lineClass}">[${now}] ${escapeHtml(text)}</div>`;
    
    const bState = state[prefix];
    if (bState && bState.consoleLines) {
      bState.consoleLines.push(newLine);
      if (bState.consoleLines.length > 50) bState.consoleLines.shift();
      el.innerHTML = bState.consoleLines.join('');
      el.scrollTop = el.scrollHeight;
    }
  }

  function escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  document.getElementById('b1-btn-clear-console').addEventListener('click', () => {
    state.b1.consoleLines = [];
    document.getElementById('b1-console').innerHTML = '<div class="serial-line-rx">Console cleared.</div>';
  });

  document.getElementById('b2-btn-clear-console').addEventListener('click', () => {
    state.b2.consoleLines = [];
    document.getElementById('b2-console').innerHTML = '<div class="serial-line-rx">Console cleared.</div>';
  });

  const b3ClearBtn = document.getElementById('b3-btn-clear-console');
  if (b3ClearBtn) {
    b3ClearBtn.addEventListener('click', () => {
      state.b3.consoleLines = [];
      document.getElementById('b3-console').innerHTML = '<div class="serial-line-rx">Console cleared.</div>';
    });
  }



  // Conveyor Line Spacing Calibration Input (Node 2)
  const spacingInput = document.getElementById('b2-spacing-input');
  if (spacingInput) {
    spacingInput.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      if (!isNaN(val) && val > 0) {
        state.b2.markerDistance = val;
        logToConsole('b2', `Marker line spacing calibrated to ${val.toFixed(1)} cm`, 'ok');
      }
    });
  }

  function showAlert(prefix, message, isError = true) {
    const banner = document.getElementById(`${prefix}-alert-banner`);
    if (!banner) return;
    banner.className = `sensor-alert-banner ${isError ? 'error' : 'success'}`;
    banner.innerHTML = `<span>${isError ? '&#9888;' : '&#10004;'}</span> <span>${message}</span>`;
    banner.classList.remove('hidden');
  }

  function hideAlert(prefix) {
    const banner = document.getElementById(`${prefix}-alert-banner`);
    if (banner) banner.classList.add('hidden');
  }

  // -------------------------------------------------------------------------
  // Alert & Warning Subsystem (>50g Load & Sudden MPU-6050 Disturbances)
  // -------------------------------------------------------------------------
  let audioCtx = null;

  function initAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
  }

  // Synthesize crisp alert audio using Web Audio API (Zero external audio file dependency)
  function playAlarmSound(type = 'overload') {
    if (!state.thresholds.soundEnabled) return;
    const now = Date.now();
    // Rate limit: play at most once every 1.3s
    if (now - state.alarms.lastSoundTime < 1300) return;
    state.alarms.lastSoundTime = now;

    try {
      initAudioContext();
      if (!audioCtx) return;

      const ct = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      if (type === 'overload') {
        // High-pitched double-pulse warning siren (880Hz -> 660Hz)
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, ct);
        osc.frequency.exponentialRampToValueAtTime(660, ct + 0.16);
        osc.frequency.setValueAtTime(880, ct + 0.20);
        osc.frequency.exponentialRampToValueAtTime(660, ct + 0.38);

        gain.gain.setValueAtTime(0.001, ct);
        gain.gain.exponentialRampToValueAtTime(0.18, ct + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, ct + 0.42);

        osc.start(ct);
        osc.stop(ct + 0.45);
      } else {
        // Sharp disturbance chirp (480Hz -> 1050Hz fast ping)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(480, ct);
        osc.frequency.exponentialRampToValueAtTime(1050, ct + 0.10);
        osc.frequency.setValueAtTime(680, ct + 0.14);
        osc.frequency.exponentialRampToValueAtTime(1150, ct + 0.25);

        gain.gain.setValueAtTime(0.001, ct);
        gain.gain.exponentialRampToValueAtTime(0.20, ct + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, ct + 0.28);

        osc.start(ct);
        osc.stop(ct + 0.30);
      }
    } catch (err) {
      console.warn('Audio playback error:', err);
    }
  }

  // Display or update the global warning alert banner
  function showGlobalAlert(type, title, message) {
    const strip = document.getElementById('global-alert-strip');
    const titleEl = document.getElementById('global-alert-title');
    const msgEl = document.getElementById('global-alert-msg');
    const timeEl = document.getElementById('global-alert-time');
    const iconEl = document.getElementById('global-alert-icon');

    if (!strip || !titleEl || !msgEl) return;

    titleEl.innerText = title;
    msgEl.innerText = message;
    if (timeEl) {
      const now = new Date().toTimeString().split(' ')[0];
      timeEl.innerText = now;
    }

    if (type === 'shock') {
      strip.classList.add('shock-type');
      if (iconEl) iconEl.innerText = '💥';
    } else {
      strip.classList.remove('shock-type');
      if (iconEl) iconEl.innerText = '⚠️';
    }

    strip.style.display = 'flex';
    strip.classList.remove('hidden');
    playAlarmSound(type);
  }

  function hideGlobalAlertIfClear() {
    if (!state.alarms.weightActive && !state.alarms.shockB1Active && !state.alarms.shockB3Active) {
      const strip = document.getElementById('global-alert-strip');
      if (strip) {
        strip.style.display = 'none';
        strip.classList.add('hidden');
      }
    }
  }

  // Force reset and hide all alarms and visual warning highlights
  function resetAllAlarms() {
    state.alarms.weightActive = false;
    state.alarms.shockB1Active = false;
    state.alarms.shockB3Active = false;
    if (state.alarms.shockB1Timer) {
      clearTimeout(state.alarms.shockB1Timer);
      state.alarms.shockB1Timer = null;
    }
    if (state.alarms.shockB3Timer) {
      clearTimeout(state.alarms.shockB3Timer);
      state.alarms.shockB3Timer = null;
    }

    const strip = document.getElementById('global-alert-strip');
    if (strip) {
      strip.style.display = 'none';
      strip.classList.add('hidden');
    }

    const b1Badge = document.getElementById('b1-shock-alarm-badge');
    if (b1Badge) {
      b1Badge.style.display = 'none';
      b1Badge.classList.add('hidden');
    }

    const b3WeightBadge = document.getElementById('b3-weight-alarm-badge');
    if (b3WeightBadge) {
      b3WeightBadge.style.display = 'none';
      b3WeightBadge.classList.add('hidden');
    }

    const b3ShockBadge = document.getElementById('b3-shock-alarm-badge');
    if (b3ShockBadge) {
      b3ShockBadge.style.display = 'none';
      b3ShockBadge.classList.add('hidden');
    }

    const cardVis1 = document.getElementById('b1-card-visualizer');
    const cardVib1 = document.getElementById('b1-card-vibration');
    if (cardVis1) cardVis1.classList.remove('card-alarm-shock');
    if (cardVib1) cardVib1.classList.remove('card-alarm-shock');

    const cardWeight3 = document.getElementById('b3-card-weight');
    const cardVis3 = document.getElementById('b3-card-visualizer');
    const valWeight3 = document.getElementById('b3-val-weight');
    if (cardWeight3) cardWeight3.classList.remove('card-alarm-weight');
    if (cardVis3) cardVis3.classList.remove('card-alarm-shock');
    if (valWeight3) valWeight3.classList.remove('text-alarm');
  }

  // Ensure all alarms start cleanly hidden on page load
  resetAllAlarms();

  // -------------------------------------------------------------------------
  // Update Conveyor Belt Tracker & Speedometer Display (Node 2)
  // -------------------------------------------------------------------------
  function updateConveyorState(location, speed_cm_s, dt_ms = null, isIdle = false, statusText = null) {
    const locNum = parseInt(location) || 1;
    state.b2.currentLocation = locNum;

    // Parse speed: keep existing non-zero speed if idle or holding, unless explicitly 0 and stopped
    const parsedSpeed = parseFloat(speed_cm_s);
    if (!isNaN(parsedSpeed) && parsedSpeed > 0) {
      state.b2.currentSpeed = parsedSpeed;
    } else if (statusText && statusText.toLowerCase().includes('stopped')) {
      state.b2.currentSpeed = 0.0;
    }

    // 1. Update Location Pills (Highlight active Location 1..4)
    for (let i = 1; i <= 4; i++) {
      const pill = document.getElementById(`zone-pill-${i}`);
      if (pill) {
        if (i === locNum) {
          pill.classList.add('active');
        } else {
          pill.classList.remove('active');
        }
      }
    }

    const locBadge = document.getElementById('b2-current-loc-badge');
    if (locBadge) {
      locBadge.innerText = `Location ${locNum}`;
    }

    // 2. Update Speed displays with real-time velocity
    const speedEl = document.getElementById('b2-val-speed');
    const speedMsEl = document.getElementById('b2-val-speed-ms');
    const speedBar = document.getElementById('b2-bar-speed');
    const dtEl = document.getElementById('b2-val-dt');
    const statusEl = document.getElementById('b2-belt-status');

    if (speedEl) speedEl.innerText = state.b2.currentSpeed.toFixed(1);
    if (speedMsEl) speedMsEl.innerText = `(${(state.b2.currentSpeed / 100).toFixed(2)} m/s)`;

    // Speed bar percentage (0 to 60 cm/s scale)
    const barPct = Math.min(100, Math.max(0, (state.b2.currentSpeed / 60) * 100));
    if (speedBar) speedBar.style.width = `${barPct}%`;

    if (dt_ms !== null && dt_ms !== undefined && dt_ms > 0) {
      state.b2.lastDt = dt_ms;
      if (dtEl) dtEl.innerText = `${dt_ms} ms`;
    }

    // 3. Motion state & 4-second delay status handling
    const isHolding = statusText && (
      statusText.toLowerCase().includes('holding') ||
      statusText.toLowerCase().includes('delay') ||
      statusText.toLowerCase().includes('post-detection')
    );

    if (statusEl) {
      if (statusText) {
        statusEl.innerText = statusText;
        statusEl.className = isHolding ? 'm-val font-mono highlight-purple' : (state.b2.currentSpeed > 0.5 ? 'm-val font-mono text-ok' : 'm-val font-mono');
      } else if (isHolding) {
        statusEl.innerText = 'Holding (4s Delay)';
        statusEl.className = 'm-val font-mono highlight-purple';
      } else if (state.b2.currentSpeed > 0.5 && !isIdle) {
        statusEl.innerText = 'In Motion';
        statusEl.className = 'm-val font-mono text-ok';
      } else {
        statusEl.innerText = isIdle ? 'Stopped / Idle' : 'Ready / Infeed';
        statusEl.className = 'm-val font-mono';
      }
    }

    // Conveyor belt and roller animation control
    const beltSurface = document.getElementById('conveyor-belt-surface');
    const rollerLeft = document.getElementById('roller-left');
    const rollerRight = document.getElementById('roller-right');

    if (state.b2.currentSpeed > 0.5 && !isHolding && !isIdle) {
      // In active transit: animate belt and roll pulleys
      const beltDuration = Math.max(0.4, Math.min(5.0, 50.0 / state.b2.currentSpeed));
      const rollerDuration = beltDuration / 2;

      if (beltSurface) {
        beltSurface.style.setProperty('--belt-duration', `${beltDuration}s`);
        beltSurface.classList.add('belt-moving');
      }
      if (rollerLeft) {
        rollerLeft.style.setProperty('--roller-duration', `${rollerDuration}s`);
        rollerLeft.classList.add('roller-spinning');
      }
      if (rollerRight) {
        rollerRight.style.setProperty('--roller-duration', `${rollerDuration}s`);
        rollerRight.classList.add('roller-spinning');
      }
    } else {
      // Paused at station during 4s delay or stopped
      if (beltSurface) beltSurface.classList.remove('belt-moving');
      if (rollerLeft) rollerLeft.classList.remove('roller-spinning');
      if (rollerRight) rollerRight.classList.remove('roller-spinning');
    }

    // 4. Optical Sensor probe visual feedback
    const probe = document.getElementById('sensor-probe');
    if (probe) {
      if (isHolding || (!isIdle && state.b2.currentSpeed > 0.5)) {
        probe.classList.add('detecting');
      } else {
        probe.classList.remove('detecting');
      }
    }

    // 5. Push into Speed Waveform Chart
    if (state.b2.chartSpeed && state.b2.currentSpeed > 0) {
      state.b2.chartSpeed.push([state.b2.currentSpeed]);
    }

    // 6. Packet statistics & telemetry record
    if (state.simActive) {
      state.b2.packetCount++;
      state.totalPackets++;
      document.getElementById('b2-packets').innerText = state.b2.packetCount;
      document.getElementById('total-packet-count').innerText = state.totalPackets;
    }

    state.recordedData.push({
      time: new Date().toISOString(),
      node: 'Arduino_Uno_COM23',
      location: locNum,
      speed_cm_s: state.b2.currentSpeed,
      speed_m_s: state.b2.currentSpeed / 100,
      dt_ms: state.b2.lastDt,
      status: isHolding ? 'HOLDING_4S' : (state.b2.currentSpeed > 0.5 ? 'IN_MOTION' : 'IDLE')
    });

    if (state.recordedData.length > 15000) state.recordedData.shift();
  }

  // -------------------------------------------------------------------------
  // Process ESP32 Telemetry (Node 1 - Conveyor Frame MPU-6050)
  // -------------------------------------------------------------------------
  function processESP32Packet(data) {
    const bState = state.b1;
    const prefix = 'b1';

    // 1. Process MPU-6050 Orientation & Motion
    const pitch = parseFloat(data.pitch || 0);
    const roll  = parseFloat(data.roll || 0);
    const yaw   = parseFloat(data.yaw || 0);

    const ax = parseFloat(data.ax || 0);
    const ay = parseFloat(data.ay || 0);
    const az = parseFloat(data.az || 0);

    const gx = parseFloat(data.gx || 0);
    const gy = parseFloat(data.gy || 0);
    const gz = parseFloat(data.gz || 0);

    const mpuTemp = data.temp !== undefined ? parseFloat(data.temp) : null;
    const gTotal = Math.sqrt(ax * ax + ay * ay + az * az);

    // Update 3D visualizer
    if (bState.visualizer) {
      bState.visualizer.updateOrientation(pitch, roll, yaw);
    }

    // Update Attitude Horizon Indicator
    const horizonLine = document.getElementById(`${prefix}-horizon-line`);
    const pitchLadder = document.getElementById(`${prefix}-pitch-ladder`);
    if (horizonLine && pitchLadder) {
      horizonLine.style.transform = `rotate(${-roll}deg) translateY(${pitch * 1.2}px)`;
      pitchLadder.style.transform = `rotate(${-roll}deg) translateY(${pitch * 1.2}px)`;
    }

    // Update Angle Values
    const pitchEl = document.getElementById(`${prefix}-val-pitch`);
    const rollEl  = document.getElementById(`${prefix}-val-roll`);
    const yawEl   = document.getElementById(`${prefix}-val-yaw`);
    const tempEl  = document.getElementById(`${prefix}-val-temp`);

    if (pitchEl) pitchEl.innerText = `${pitch.toFixed(1)}°`;
    if (rollEl)  rollEl.innerText  = `${roll.toFixed(1)}°`;
    if (yawEl)   yawEl.innerText   = `${yaw.toFixed(1)}°`;
    if (tempEl && mpuTemp !== null) tempEl.innerText = `${mpuTemp.toFixed(1)} °C`;

    // Update Linear Acceleration Readouts & Bars
    const axEl = document.getElementById(`${prefix}-val-ax`);
    const ayEl = document.getElementById(`${prefix}-val-ay`);
    const azEl = document.getElementById(`${prefix}-val-az`);
    if (axEl) axEl.innerText = (ax >= 0 ? '+' : '') + ax.toFixed(3);
    if (ayEl) ayEl.innerText = (ay >= 0 ? '+' : '') + ay.toFixed(3);
    if (azEl) azEl.innerText = (az >= 0 ? '+' : '') + az.toFixed(3);

    const normBar = (v) => Math.min(100, Math.max(0, ((v + 2.0) / 4.0) * 100));
    const barAx = document.getElementById(`${prefix}-bar-ax`);
    const barAy = document.getElementById(`${prefix}-bar-ay`);
    const barAz = document.getElementById(`${prefix}-bar-az`);
    if (barAx) barAx.style.width = `${normBar(ax)}%`;
    if (barAy) barAy.style.width = `${normBar(ay)}%`;
    if (barAz) barAz.style.width = `${normBar(az)}%`;

    // Conveyor Frame Vibration Index Badge
    const vibEl = document.getElementById(`${prefix}-gtotal`);
    if (vibEl) {
      let statusStr = 'Smooth';
      let statusClass = 'badge-tag text-ok';
      if (gTotal > 1.45) {
        statusStr = 'High Vibration';
        statusClass = 'badge-tag text-err';
      } else if (gTotal > 1.18 || gTotal < 0.82) {
        statusStr = 'Moderate';
        statusClass = 'badge-tag text-warn';
      }
      vibEl.innerText = `Vib: ${gTotal.toFixed(2)}g (${statusStr})`;
      vibEl.className = statusClass;
    }

    // Disturbance Detection (Shock, Sudden Jerk, Impact, High Gyro Spike)
    const shockGThreshold = state.thresholds.shockG;
    const gyroThreshold = state.thresholds.gyroSpike;
    const maxGyro = Math.max(Math.abs(gx), Math.abs(gy), Math.abs(gz));

    // Instantaneous acceleration shock delta
    const lastG = bState.lastGTotal !== undefined ? bState.lastGTotal : 1.0;
    const deltaG = Math.abs(gTotal - lastG);
    bState.lastGTotal = gTotal;

    const isDisturbance = (gTotal > shockGThreshold) || (deltaG > 0.40) || (maxGyro > gyroThreshold);

    if (isDisturbance) {
      state.alarms.shockB1Active = true;

      // Visual cards alarm pulsing
      const cardVis = document.getElementById('b1-card-visualizer');
      const cardVib = document.getElementById('b1-card-vibration');
      if (cardVis) cardVis.classList.add('card-alarm-shock');
      if (cardVib) cardVib.classList.add('card-alarm-shock');

      // Alarm pill badge
      const badge = document.getElementById('b1-shock-alarm-badge');
      if (badge) {
        badge.innerText = `💥 SHOCK: ${gTotal.toFixed(2)}g / ${maxGyro.toFixed(0)}°/s`;
        badge.style.display = 'inline-block';
        badge.classList.remove('hidden');
      }

      showGlobalAlert(
        'shock',
        '💥 SUDDEN MPU-6050 DISTURBANCE DETECTED!',
        `Conveyor Frame IMU (COM19) detected sudden shock/impact! Peak G: ${gTotal.toFixed(2)}g (ΔG: ${deltaG.toFixed(2)}g), Angular Jerk: ${maxGyro.toFixed(0)}°/s`
      );

      // Auto-clear after 2.5s calm period
      if (state.alarms.shockB1Timer) clearTimeout(state.alarms.shockB1Timer);
      state.alarms.shockB1Timer = setTimeout(() => {
        state.alarms.shockB1Active = false;
        if (cardVis) cardVis.classList.remove('card-alarm-shock');
        if (cardVib) cardVib.classList.remove('card-alarm-shock');
        if (badge) {
          badge.style.display = 'none';
          badge.classList.add('hidden');
        }
        hideGlobalAlertIfClear();
      }, 2500);
    }

    // Push into Waveform Charts
    if (bState.chartAccel) bState.chartAccel.push([ax, ay, az]);
    if (bState.chartGyro)  bState.chartGyro.push([gx, gy, gz]);

    if (state.simActive) {
      bState.packetCount++;
      state.totalPackets++;
      document.getElementById(`${prefix}-packets`).innerText = bState.packetCount;
      document.getElementById('total-packet-count').innerText = state.totalPackets;
    }

    // Record for CSV export
    state.recordedData.push({
      time: new Date().toISOString(),
      node: 'ESP32_COM19',
      pitch, roll, yaw,
      ax, ay, az,
      gx, gy, gz,
      gTotal,
      temp: mpuTemp || 0
    });

    if (state.recordedData.length > 15000) state.recordedData.shift();
  }

  // -------------------------------------------------------------------------
  // Process ESP32 Scale & IMU Telemetry (Node 3 - COM21)
  // -------------------------------------------------------------------------
  function processScaleIMUPacket(data) {
    const bState = state.b3;
    const prefix = 'b3';

    // 1. Process Weight (HX711)
    if (data.weight !== undefined) {
      let rawWeight = parseFloat(data.weight) || 0;
      let netWeight = rawWeight - bState.weightOffset;
      if (Math.abs(netWeight) < 0.2) netWeight = 0.0;

      const valWeight = document.getElementById(`${prefix}-val-weight`);
      const valWeightKg = document.getElementById(`${prefix}-val-weight-kg`);
      const barWeight = document.getElementById(`${prefix}-bar-weight`);
      const peakWeightEl = document.getElementById(`${prefix}-val-peak`);
      const statusEl = document.getElementById(`${prefix}-scale-status`);

      if (valWeight) valWeight.innerText = netWeight.toFixed(1);
      if (valWeightKg) valWeightKg.innerText = `(${(netWeight / 1000).toFixed(3)} kg)`;

      if (netWeight > bState.peakWeight) {
        bState.peakWeight = netWeight;
        if (peakWeightEl) peakWeightEl.innerText = `${bState.peakWeight.toFixed(1)} g`;
      }

      const barPct = Math.min(100, Math.max(0, (netWeight / 1000) * 100));
      if (barWeight) barWeight.style.width = `${barPct}%`;

      if (statusEl) {
        if (netWeight > 1.0) {
          statusEl.innerText = 'Load Applied';
          statusEl.className = 'm-val font-mono highlight-amber';
        } else {
          statusEl.innerText = 'Zero / Ready';
          statusEl.className = 'm-val font-mono';
        }
      }

      // Weight Alarm Check (> 50g load threshold)
      const weightLimit = state.thresholds.weightLimit;
      const cardWeight = document.getElementById('b3-card-weight');
      const badgeWeight = document.getElementById('b3-weight-alarm-badge');

      if (netWeight > weightLimit) {
        state.alarms.weightActive = true;
        if (cardWeight) cardWeight.classList.add('card-alarm-weight');
        if (valWeight) valWeight.classList.add('text-alarm');
        if (badgeWeight) {
          badgeWeight.innerText = `⚠️ OVERLOAD: ${netWeight.toFixed(1)}g (> ${weightLimit.toFixed(0)}g)`;
          badgeWeight.style.display = 'inline-block';
          badgeWeight.classList.remove('hidden');
        }

        showGlobalAlert(
          'overload',
          `⚠️ LOAD CELL OVERLOAD WARNING (> ${weightLimit.toFixed(0)}g)!`,
          `Weigh Station (COM21) detected payload of ${netWeight.toFixed(1)}g exceeding safety limit of ${weightLimit.toFixed(0)}g!`
        );
      } else {
        if (state.alarms.weightActive) {
          state.alarms.weightActive = false;
          if (cardWeight) cardWeight.classList.remove('card-alarm-weight');
          if (valWeight) valWeight.classList.remove('text-alarm');
          if (badgeWeight) {
            badgeWeight.style.display = 'none';
            badgeWeight.classList.add('hidden');
          }
          hideGlobalAlertIfClear();
        }
      }

      if (bState.chartWeight) bState.chartWeight.push([netWeight]);
    }

    // 2. Process MPU-6050 Orientation & Motion
    const pitch = parseFloat(data.pitch || 0);
    const roll  = parseFloat(data.roll || 0);
    const yaw   = parseFloat(data.yaw || 0);

    const ax = parseFloat(data.ax || 0);
    const ay = parseFloat(data.ay || 0);
    const az = parseFloat(data.az || 0);

    const gx = parseFloat(data.gx || 0);
    const gy = parseFloat(data.gy || 0);
    const gz = parseFloat(data.gz || 0);

    const mpuTemp = data.temp !== undefined ? parseFloat(data.temp) : null;

    // Node 3 MPU-6050 Disturbance Detection
    const gTotal3 = Math.sqrt(ax * ax + ay * ay + az * az);
    const lastG3 = bState.lastGTotal !== undefined ? bState.lastGTotal : 1.0;
    const deltaG3 = Math.abs(gTotal3 - lastG3);
    bState.lastGTotal = gTotal3;
    const maxGyro3 = Math.max(Math.abs(gx), Math.abs(gy), Math.abs(gz));

    const isDisturbance3 = (gTotal3 > state.thresholds.shockG) || (deltaG3 > 0.40) || (maxGyro3 > state.thresholds.gyroSpike);

    if (isDisturbance3) {
      state.alarms.shockB3Active = true;
      const cardVis3 = document.getElementById('b3-card-visualizer');
      const badgeShock3 = document.getElementById('b3-shock-alarm-badge');

      if (cardVis3) cardVis3.classList.add('card-alarm-shock');
      if (badgeShock3) {
        badgeShock3.innerText = `💥 SHOCK: ${gTotal3.toFixed(2)}g / ${maxGyro3.toFixed(0)}°/s`;
        badgeShock3.style.display = 'inline-block';
        badgeShock3.classList.remove('hidden');
      }

      showGlobalAlert(
        'shock',
        '💥 SCALE STATION MPU-6050 DISTURBANCE DETECTED!',
        `Weigh Station IMU (COM21) detected sudden vibration/shock! G: ${gTotal3.toFixed(2)}g (ΔG: ${deltaG3.toFixed(2)}g), Angular Jerk: ${maxGyro3.toFixed(0)}°/s`
      );

      if (state.alarms.shockB3Timer) clearTimeout(state.alarms.shockB3Timer);
      state.alarms.shockB3Timer = setTimeout(() => {
        state.alarms.shockB3Active = false;
        if (cardVis3) cardVis3.classList.remove('card-alarm-shock');
        if (badgeShock3) {
          badgeShock3.style.display = 'none';
          badgeShock3.classList.add('hidden');
        }
        hideGlobalAlertIfClear();
      }, 2500);
    }

    if (bState.visualizer) {
      bState.visualizer.updateOrientation(pitch, roll, yaw);
    }

    const horizonLine = document.getElementById(`${prefix}-horizon-line`);
    const pitchLadder = document.getElementById(`${prefix}-pitch-ladder`);
    if (horizonLine && pitchLadder) {
      horizonLine.style.transform = `rotate(${-roll}deg) translateY(${pitch * 1.2}px)`;
      pitchLadder.style.transform = `rotate(${-roll}deg) translateY(${pitch * 1.2}px)`;
    }

    const pitchEl = document.getElementById(`${prefix}-val-pitch`);
    const rollEl  = document.getElementById(`${prefix}-val-roll`);
    const yawEl   = document.getElementById(`${prefix}-val-yaw`);
    const tempEl  = document.getElementById(`${prefix}-val-temp`);

    if (pitchEl) pitchEl.innerText = `${pitch.toFixed(1)}°`;
    if (rollEl)  rollEl.innerText  = `${roll.toFixed(1)}°`;
    if (yawEl)   yawEl.innerText   = `${yaw.toFixed(1)}°`;
    if (tempEl && mpuTemp !== null) tempEl.innerText = `${mpuTemp.toFixed(1)} °C`;

    if (bState.chartAccel) bState.chartAccel.push([ax, ay, az]);
    if (bState.chartGyro)  bState.chartGyro.push([gx, gy, gz]);

    if (state.simActive) {
      bState.packetCount++;
      state.totalPackets++;
      const packetsEl = document.getElementById(`${prefix}-packets`);
      if (packetsEl) packetsEl.innerText = bState.packetCount;
      document.getElementById('total-packet-count').innerText = state.totalPackets;
    }

    state.recordedData.push({
      time: new Date().toISOString(),
      node: 'ESP32_COM21',
      weight: data.weight !== undefined ? parseFloat(data.weight) : 0,
      pitch, roll, yaw,
      ax, ay, az,
      gx, gy, gz,
      temp: mpuTemp || 0
    });

    if (state.recordedData.length > 15000) state.recordedData.shift();
  }

  // -------------------------------------------------------------------------
  // Serial Stream Parsing for All Boards
  // -------------------------------------------------------------------------
  function parseIncomingLine(line, boardKey) {
    const trimmed = line.trim();
    if (!trimmed) return;

    // A1. Conveyor Belt Location Tracker & Speedometer:
    // Format: "Belt -> Loc: 1 | Speed: 25.4 cm/s (0.25 m/s) | DT: 787 ms | Marker: White Line 1"
    const beltMatch = trimmed.match(/Belt\s*->\s*Loc:\s*(\d+)\s*\|\s*Speed:\s*([-\d.]+)\s*cm\/s/i);
    if (beltMatch) {
      const loc = parseInt(beltMatch[1]) || 1;
      let speed = parseFloat(beltMatch[2]) || 0;

      const statusMatch = trimmed.match(/State:\s*([^|]+)/i);
      const statusText = statusMatch ? statusMatch[1].trim() : null;

      const isHolding = statusText && (
        statusText.toLowerCase().includes('holding') ||
        statusText.toLowerCase().includes('delay') ||
        statusText.toLowerCase().includes('detected')
      );
      const isIdle = !isHolding && (speed < 0.5 || trimmed.toLowerCase().includes('stopped') || trimmed.toLowerCase().includes('idle'));

      let dt = 0;
      const transitMatch = trimmed.match(/Transit:\s*(\d+)\s*ms/i);
      const dtMatch = trimmed.match(/DT:\s*(\d+)\s*ms/i);
      if (transitMatch) {
        dt = parseInt(transitMatch[1]) || 0;
      } else if (dtMatch) {
        dt = parseInt(dtMatch[1]) || 0;
      }

      if (!isIdle && !isHolding && dt > 0 && Math.abs(state.b2.markerDistance - 8.0) > 0.01) {
        speed = (state.b2.markerDistance * 1000.0) / dt;
      }

      updateConveyorState(loc, speed, dt, isIdle, statusText);

      if (trimmed.toLowerCase().includes('pin2: low') || isHolding) {
        const probe = document.getElementById('sensor-probe');
        if (probe) probe.classList.add('detecting');
      }

      return;
    }

    // A2. Arduino Uno Conveyor Tracker Startup Banner:
    if (trimmed.toLowerCase().includes('conveyor belt tracker') || trimmed.toLowerCase().includes('marker spacing:')) {
      showAlert('b2', 'Conveyor Belt Tracker & Speedometer Ready on Pin 2!', false);
      return;
    }

    // A3. Fallback for E18-D80NK basic IR obstacle detection:
    if (trimmed.toLowerCase().includes('obstacle detected')) {
      const nextLoc = (state.b2.currentLocation % 4) + 1;
      updateConveyorState(nextLoc, 24.0, 830, false);
      const statusEl = document.getElementById('b2-belt-status');
      if (statusEl) {
        statusEl.innerText = 'Object / Marker Detected';
        statusEl.className = 'm-val font-mono text-ok';
      }
      return;
    }
    if (trimmed.toLowerCase() === 'clear' || trimmed.toLowerCase().includes('clear')) {
      const statusEl = document.getElementById('b2-belt-status');
      if (statusEl) {
        statusEl.innerText = 'Beam Clear / Idle';
        statusEl.className = 'm-val font-mono';
      }
      return;
    }
    if (trimmed.toLowerCase().includes('e18-d80nk ir sensor initialized')) {
      showAlert('b2', 'E18-D80NK IR Sensor Initialized on Pin 2!', false);
      return;
    }

    // B1. Check for ESP32 Frame IMU startup status (COM19)
    if (trimmed.toLowerCase().includes('conveyor frame motion') || trimmed.toLowerCase().includes('node":"frame_imu"') || trimmed.toLowerCase().includes('mpu-6050 initialized')) {
      showAlert('b1', 'ESP32: Conveyor Frame MPU-6050 Ready on I2C (SDA:21 SCL:22)!', false);
      return;
    }
    if (trimmed.toLowerCase().includes('calibrating') || trimmed.toLowerCase().includes('gyro zero calibration')) {
      showAlert(boardKey || 'b1', 'MPU-6050: Calibrating gyro offsets... hold frame still.', false);
      return;
    }
    if (trimmed.toLowerCase().includes('mpu-6050 not found')) {
      showAlert(boardKey || 'b1', 'MPU-6050 Error: Sensor not found! Check SDA 21, SCL 22 & 3.3V power.', true);
      return;
    }

    // B2. Check for ESP32 Scale & IMU startup status (COM21)
    if (trimmed.toLowerCase().includes('weigh station & kinematics node') || trimmed.toLowerCase().includes('node":"scale_imu"')) {
      showAlert('b3', 'ESP32: Weigh Station & IMU Ready on COM21!', false);
      return;
    }
    if (trimmed.toLowerCase().includes('taring') || trimmed.toLowerCase().includes('zeroing load cell')) {
      showAlert('b3', 'HX711: Zeroing scale... leave empty.', false);
      return;
    }

    // C1. Check for ESP32 Conveyor Frame MPU-6050 Telemetry Stream (COM19):
    // Format: "Frame_IMU -> Accel: (0.012, -0.034, 0.985) g | Gyro: (0.12, -0.05, 0.01) dps | Pitch: 2.10 | Roll: -0.70 | Yaw: 0.15 | Vib: 0.99g | Temp: 28.5 C"
    const frameMatch = trimmed.match(/Frame_IMU\s*->\s*Accel:\s*\(\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\s*\)\s*g\s*\|\s*Gyro:\s*\(\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\s*\)\s*dps\s*\|\s*Pitch:\s*([-\d.]+)\s*\|\s*Roll:\s*([-\d.]+)\s*\|\s*Yaw:\s*([-\d.]+)\s*\|\s*Vib:\s*([-\d.]+)g\s*\|\s*Temp:\s*([-\d.]+)/i);
    if (frameMatch) {
      const ax = parseFloat(frameMatch[1]) || 0;
      const ay = parseFloat(frameMatch[2]) || 0;
      const az = parseFloat(frameMatch[3]) || 0;
      const gx = parseFloat(frameMatch[4]) || 0;
      const gy = parseFloat(frameMatch[5]) || 0;
      const gz = parseFloat(frameMatch[6]) || 0;
      const pitch = parseFloat(frameMatch[7]) || 0;
      const roll  = parseFloat(frameMatch[8]) || 0;
      const yaw   = parseFloat(frameMatch[9]) || 0;
      const temp  = parseFloat(frameMatch[11]) || 25.0;

      processESP32Packet({ ax, ay, az, gx, gy, gz, pitch, roll, yaw, temp });
      return;
    }

    // C2. Check for ESP32 Scale & IMU Telemetry Stream (COM21):
    // Format: "Scale_IMU -> Weight: 145.2 g | Accel: (0.012, -0.034, 0.985) g | Gyro: (0.12, -0.05, 0.01) dps | Pitch: 2.10 | Roll: -0.70 | Yaw: 0.15 | Temp: 28.5 C"
    const scaleMatch = trimmed.match(/Scale_IMU\s*->\s*Weight:\s*([-\d.]+)\s*g\s*\|\s*Accel:\s*\(\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\s*\)\s*g\s*\|\s*Gyro:\s*\(\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\s*\)\s*dps\s*\|\s*Pitch:\s*([-\d.]+)\s*\|\s*Roll:\s*([-\d.]+)\s*\|\s*Yaw:\s*([-\d.]+)\s*\|\s*Temp:\s*([-\d.]+)/i);
    if (scaleMatch) {
      const weight = parseFloat(scaleMatch[1]) || 0;
      const ax = parseFloat(scaleMatch[2]) || 0;
      const ay = parseFloat(scaleMatch[3]) || 0;
      const az = parseFloat(scaleMatch[4]) || 0;
      const gx = parseFloat(scaleMatch[5]) || 0;
      const gy = parseFloat(scaleMatch[6]) || 0;
      const gz = parseFloat(scaleMatch[7]) || 0;
      const pitch = parseFloat(scaleMatch[8]) || 0;
      const roll  = parseFloat(scaleMatch[9]) || 0;
      const yaw   = parseFloat(scaleMatch[10]) || 0;
      const temp  = parseFloat(scaleMatch[11]) || 25.0;

      processScaleIMUPacket({ weight, ax, ay, az, gx, gy, gz, pitch, roll, yaw, temp });
      return;
    }

    // C3. Generic Weight + Accel + Gyro format:
    const weightMatch = trimmed.match(/Weight:\s*([-\d.]+)\s*g\s*\|\s*Accel:\s*\(\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\s*\)\s*\|\s*Gyro:\s*\(\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\s*\)\s*\|\s*Temp:\s*([-\d.]+)/i);
    if (weightMatch) {
      const weight = parseFloat(weightMatch[1]) || 0;
      const ax = parseFloat(weightMatch[2]) || 0;
      const ay = parseFloat(weightMatch[3]) || 0;
      const az = parseFloat(weightMatch[4]) || 0;
      const gx = parseFloat(weightMatch[5]) || 0;
      const gy = parseFloat(weightMatch[6]) || 0;
      const gz = parseFloat(weightMatch[7]) || 0;
      const temp = parseFloat(weightMatch[8]) || 25.0;

      const pitch = Math.atan2(-ax, Math.sqrt(ay * ay + az * az)) * (180.0 / Math.PI);
      const roll  = Math.atan2(ay, az) * (180.0 / Math.PI);

      processScaleIMUPacket({ weight, ax, ay, az, gx, gy, gz, temp, pitch, roll, yaw: 0 });
      return;
    }

    // C4. Check for legacy Multi-Sensor format (without weight)
    const dualMatch = trimmed.match(/Accel:\s*\(\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\s*\)\s*\|\s*Gyro:\s*\(\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\s*\)\s*\|\s*Temp:\s*([-\d.]+)/i);
    if (dualMatch) {
      const ax = parseFloat(dualMatch[1]) || 0;
      const ay = parseFloat(dualMatch[2]) || 0;
      const az = parseFloat(dualMatch[3]) || 0;
      const gx = parseFloat(dualMatch[4]) || 0;
      const gy = parseFloat(dualMatch[5]) || 0;
      const gz = parseFloat(dualMatch[6]) || 0;
      const temp = parseFloat(dualMatch[7]) || 25.0;

      const pitch = Math.atan2(-ax, Math.sqrt(ay * ay + az * az)) * (180.0 / Math.PI);
      const roll  = Math.atan2(ay, az) * (180.0 / Math.PI);

      if (boardKey === 'b3') {
        processScaleIMUPacket({ ax, ay, az, gx, gy, gz, temp, pitch, roll, yaw: 0 });
      } else {
        processESP32Packet({ ax, ay, az, gx, gy, gz, temp, pitch, roll, yaw: 0 });
      }
      return;
    }

    // D. Check for Raw Accel/Gyro format:
    const accelMatch = trimmed.match(/Accel\s*\[g\]\s*->\s*X:\s*([-\d.]+)\s*\|\s*Y:\s*([-\d.]+)\s*\|\s*Z:\s*([-\d.]+)/i);
    if (accelMatch) {
      const ax = parseFloat(accelMatch[1]) || 0;
      const ay = parseFloat(accelMatch[2]) || 0;
      const az = parseFloat(accelMatch[3]) || 0;

      let gx = 0, gy = 0, gz = 0, temp = 25.0;
      const gyroMatch = trimmed.match(/Gyro\s*\[deg\/s\]\s*->\s*X:\s*([-\d.]+)\s*\|\s*Y:\s*([-\d.]+)\s*\|\s*Z:\s*([-\d.]+)/i);
      if (gyroMatch) {
        gx = parseFloat(gyroMatch[1]) || 0;
        gy = parseFloat(gyroMatch[2]) || 0;
        gz = parseFloat(gyroMatch[3]) || 0;
      }
      const tempMatch = trimmed.match(/Temp:\s*([-\d.]+)/i);
      if (tempMatch) temp = parseFloat(tempMatch[1]) || 25.0;

      const pitch = Math.atan2(-ax, Math.sqrt(ay * ay + az * az)) * (180.0 / Math.PI);
      const roll  = Math.atan2(ay, az) * (180.0 / Math.PI);

      if (boardKey === 'b3') {
        processScaleIMUPacket({ ax, ay, az, gx, gy, gz, temp, pitch, roll, yaw: 0 });
      } else {
        processESP32Packet({ ax, ay, az, gx, gy, gz, temp, pitch, roll, yaw: 0 });
      }
      return;
    }

    // E. JSON format fallback
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (boardKey === 'b3' || parsed.board === 3 || parsed.weight !== undefined) {
          processScaleIMUPacket(parsed);
        } else {
          processESP32Packet(parsed);
        }
      } catch (e) {}
    }
  }

  // -------------------------------------------------------------------------
  // Web Serial Connection Handler
  // -------------------------------------------------------------------------
  async function connectSerial(boardKey, defaultBaud, label) {
    if (!hasWebSerial) {
      alert('Web Serial API is not supported in this browser. Please use Google Chrome, Microsoft Edge, or Brave.');
      return;
    }

    const bState = state[boardKey];
    const prefix = boardKey;
    const btn = document.getElementById(`${prefix}-btn-connect`);
    const statusDot = document.getElementById(`${prefix}-status-dot`);
    const statusText = document.getElementById(`${prefix}-status-text`);
    const baudSelect = document.getElementById(`${prefix}-baud`);
    const baudRate = parseInt(baudSelect.value) || defaultBaud;

    if (bState.isConnected) {
      try {
        if (bState.reader) {
          await bState.reader.cancel();
          await bState.readableStreamClosed.catch(() => {});
          bState.reader = null;
        }
        if (bState.port) {
          await bState.port.close();
          bState.port = null;
        }
      } catch (err) {
        console.error('Error closing port:', err);
      }
      bState.isConnected = false;
      statusDot.classList.remove('connected');
      statusText.innerText = 'Disconnected';
      btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg><span>Connect ${label}</span>`;
      logToConsole(prefix, `Disconnected from port.`, 'rx');
      return;
    }

    try {
      logToConsole(prefix, `Opening serial port at ${baudRate} baud...`, 'rx');
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: baudRate });
      bState.port = port;
      bState.isConnected = true;

      statusDot.classList.add('connected');
      statusText.innerText = `Connected (${baudRate})`;
      btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg><span>Disconnect</span>`;
      logToConsole(prefix, `Port opened! Reading data stream...`, 'ok');

      const textDecoder = new TextDecoderStream();
      bState.readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();
      bState.reader = reader;

      let lineBuffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          lineBuffer += value;
          const lines = lineBuffer.split('\n');
          lineBuffer = lines.pop();

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            bState.packetCount++;
            state.totalPackets++;
            document.getElementById(`${prefix}-packets`).innerText = bState.packetCount;
            document.getElementById('total-packet-count').innerText = state.totalPackets;

            logToConsole(prefix, trimmed, trimmed.includes('error') || trimmed.includes('Obstacle') ? 'err' : 'rx');
            parseIncomingLine(trimmed, boardKey);
          }
        }
      }
    } catch (err) {
      console.warn('Serial connection error or cancelled:', err);
      bState.isConnected = false;
      statusDot.classList.remove('connected');
      statusText.innerText = 'Disconnected';
      btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg><span>Connect ${label}</span>`;
      logToConsole(prefix, `Connection error: ${err.message || err}`, 'err');
    }
  }

  // Bind Connect Buttons
  document.getElementById('b1-btn-connect').addEventListener('click', () => connectSerial('b1', 115200, 'COM19 (ESP32 Frame)'));
  document.getElementById('b2-btn-connect').addEventListener('click', () => connectSerial('b2', 9600, 'COM23 (Arduino Uno)'));
  
  const b3ConnectBtn = document.getElementById('b3-btn-connect');
  if (b3ConnectBtn) {
    b3ConnectBtn.addEventListener('click', () => connectSerial('b3', 115200, 'COM21 (ESP32 Scale)'));
  }

  // Bind Tare & View Buttons (ESP32 Frame - COM19)
  document.getElementById('b1-btn-tare').addEventListener('click', () => state.b1.visualizer.tare());
  document.getElementById('b1-btn-reset-view').addEventListener('click', () => state.b1.visualizer.resetView());

  // Bind Tare & View Buttons (ESP32 Scale & IMU - COM21)
  const b3TareImuBtn = document.getElementById('b3-btn-tare-imu');
  if (b3TareImuBtn) {
    b3TareImuBtn.addEventListener('click', () => state.b3.visualizer.tare());
  }

  const b3ResetViewBtn = document.getElementById('b3-btn-reset-view');
  if (b3ResetViewBtn) {
    b3ResetViewBtn.addEventListener('click', () => state.b3.visualizer.resetView());
  }

  const b3TareWeightBtn = document.getElementById('b3-btn-tare-weight');
  if (b3TareWeightBtn) {
    b3TareWeightBtn.addEventListener('click', async () => {
      const curVal = parseFloat(document.getElementById('b3-val-weight').innerText) || 0;
      state.b3.weightOffset += curVal;
      state.b3.peakWeight = 0.0;
      const peakEl = document.getElementById('b3-val-peak');
      const valEl = document.getElementById('b3-val-weight');
      const valKgEl = document.getElementById('b3-val-weight-kg');
      const barEl = document.getElementById('b3-bar-weight');
      if (peakEl) peakEl.innerText = '0.0 g';
      if (valEl) valEl.innerText = '0.0';
      if (valKgEl) valKgEl.innerText = '(0.000 kg)';
      if (barEl) barEl.style.width = '0%';
      logToConsole('b3', 'Tare offset set. Current weight zeroed.', 'ok');

      if (state.b3.port && state.b3.isConnected) {
        try {
          const encoder = new TextEncoder();
          const writer = state.b3.port.writable.getWriter();
          await writer.write(encoder.encode('TARE\n'));
          writer.releaseLock();
        } catch (e) {
          console.warn('Could not send TARE command to COM21:', e);
        }
      }
    });
  }

  // -------------------------------------------------------------------------
  // Realistic Simulation / Demo Mode
  // -------------------------------------------------------------------------
  const btnDemo = document.getElementById('btn-demo');
  btnDemo.addEventListener('click', () => {
    state.simActive = !state.simActive;

    if (state.simActive) {
      btnDemo.classList.add('btn-sim-active');
      document.getElementById('b1-status-dot').classList.add('connected');
      document.getElementById('b1-status-text').innerText = 'Simulating';
      document.getElementById('b2-status-dot').classList.add('connected');
      document.getElementById('b2-status-text').innerText = 'Simulating';

      const b3Dot = document.getElementById('b3-status-dot');
      const b3Txt = document.getElementById('b3-status-text');
      if (b3Dot) b3Dot.classList.add('connected');
      if (b3Txt) b3Txt.innerText = 'Simulating';

      let t = 0;
      state.simTimer = setInterval(() => {
        t += 0.04;

        // Node 1 (ESP32 COM19): Simulating Conveyor Frame IMU Kinematics
        const p1 = Math.sin(t * 1.4) * 18.0 + Math.cos(t * 0.7) * 4.0;
        const r1 = Math.cos(t * 1.8) * 25.0;
        const y1 = (t * 12) % 360;

        const radP1 = p1 * Math.PI / 180;
        const radR1 = r1 * Math.PI / 180;
        let ax1 = -Math.sin(radP1) + (Math.random() - 0.5) * 0.05;
        let ay1 = Math.sin(radR1) * Math.cos(radP1) + (Math.random() - 0.5) * 0.05;
        let az1 = Math.cos(radR1) * Math.cos(radP1) + (Math.random() - 0.5) * 0.05;

        let gx1 = Math.cos(t * 1.4) * 25 + (Math.random() - 0.5) * 4;
        let gy1 = -Math.sin(t * 1.8) * 35 + (Math.random() - 0.5) * 4;
        let gz1 = 8 + (Math.random() - 0.5) * 2;

        // Periodic sudden disturbance shock impulse on Node 1 (every ~7 seconds)
        const simTick = Math.round(t * 25);
        if (simTick % 180 === 45) {
          ax1 += 1.42;
          ay1 += 0.95;
          gz1 += 118.0;
        }

        processESP32Packet({
          pitch: p1, roll: r1, yaw: y1,
          ax: ax1, ay: ay1, az: az1,
          gx: gx1, gy: gy1, gz: gz1,
          temp: 28.5 + Math.sin(t * 0.1) * 0.5
        });

        // Node 2 (Arduino Uno COM23): Simulating Conveyor Belt with 4-Second Hold Delay
        const nowMs = Date.now();
        if (!state.b2.demoState) {
          state.b2.demoState = { phase: 'moving', phaseStart: nowMs, loc: 1, speed: 24.5 };
        }
        const ds = state.b2.demoState;
        const elapsed = nowMs - ds.phaseStart;

        if (ds.phase === 'moving') {
          if (elapsed > 2200) { // 2.2 seconds of movement between stations
            ds.loc = (ds.loc % 4) + 1;
            ds.speed = 22.0 + (Math.random() * 5.5); // 22 to 27.5 cm/s
            ds.phase = 'holding';
            ds.phaseStart = nowMs;
            const simDt = Math.round((state.b2.markerDistance * 1000) / ds.speed);

            updateConveyorState(ds.loc, ds.speed, simDt, false, `Station ${ds.loc} Holding (4s Delay)`);
            logToConsole('b2', `Belt -> Loc: ${ds.loc} | Speed: ${ds.speed.toFixed(1)} cm/s (${(ds.speed / 100).toFixed(2)} m/s) | Transit: ${simDt} ms | Marker: Location ${ds.loc} -> DETECTED!`, 'rx');
            logToConsole('b2', `Belt -> Loc: ${ds.loc} | Speed: ${ds.speed.toFixed(1)} cm/s | State: Station ${ds.loc} Holding (4s Delay)...`, 'rx');
          } else {
            updateConveyorState(ds.loc, ds.speed, 0, false, `In Transit -> Location ${ds.loc}`);
          }
        } else if (ds.phase === 'holding') {
          const remainingSec = Math.max(1, Math.ceil((4000 - elapsed) / 1000));
          if (elapsed >= 4000) {
            ds.phase = 'moving';
            ds.phaseStart = nowMs;
            const nextLoc = (ds.loc % 4) + 1;
            logToConsole('b2', `Belt -> Loc: ${nextLoc} | Speed: ${ds.speed.toFixed(1)} cm/s | State: 4s Delay Complete -> Heading to Location ${nextLoc}`, 'ok');
            updateConveyorState(nextLoc, ds.speed, 0, false, `4s Delay Complete -> Heading to Loc ${nextLoc}`);
          } else {
            updateConveyorState(ds.loc, ds.speed, 0, false, `Station ${ds.loc} Holding (${remainingSec}s remaining)`);
          }
        }

        // Node 3 (ESP32 COM21): Simulating Load Cell Scale + MPU-6050
        // Weight cycling: cycles from 0g up to 64g (crossing 50g threshold to trigger overload warning & sirens)
        const weightCycle = (t * 0.35) % (2 * Math.PI);
        let simWeight3 = 0.0;
        if (weightCycle < Math.PI) {
          // Weight application phase: climbs to ~64g then comes down
          simWeight3 = Math.max(0, Math.sin(weightCycle) * 64.0 + (Math.random() - 0.5) * 0.8);
        } else {
          // Offload / empty phase: 0g
          simWeight3 = Math.max(0, (Math.random() - 0.5) * 0.2);
        }

        let p3 = Math.sin(t * 0.9) * 8.0;
        let r3 = Math.cos(t * 1.1) * 10.0;
        let y3 = (t * 6) % 360;

        let radP3 = p3 * Math.PI / 180;
        let radR3 = r3 * Math.PI / 180;
        let ax3 = -Math.sin(radP3) + (Math.random() - 0.5) * 0.02;
        let ay3 = Math.sin(radR3) * Math.cos(radP3) + (Math.random() - 0.5) * 0.02;
        let az3 = Math.cos(radR3) * Math.cos(radP3) + (Math.random() - 0.5) * 0.02;

        let gx3 = Math.cos(t * 0.9) * 15 + (Math.random() - 0.5) * 2;
        let gy3 = -Math.sin(t * 1.1) * 18 + (Math.random() - 0.5) * 2;
        let gz3 = 4 + (Math.random() - 0.5) * 1.5;

        // Periodic sudden shock disturbance on Node 3 (every ~10 seconds)
        if (simTick % 250 === 120) {
          ay3 += 1.48;
          gx3 += 115.0;
        }

        processScaleIMUPacket({
          weight: simWeight3,
          pitch: p3, roll: r3, yaw: y3,
          ax: ax3, ay: ay3, az: az3,
          gx: gx3, gy: gy3, gz: gz3,
          temp: 29.2 + Math.sin(t * 0.08) * 0.3
        });

      }, 40);

    } else {
      btnDemo.classList.remove('btn-sim-active');
      clearInterval(state.simTimer);
      state.simTimer = null;
      resetAllAlarms();
      if (!state.b1.isConnected) {
        document.getElementById('b1-status-dot').classList.remove('connected');
        document.getElementById('b1-status-text').innerText = 'Disconnected';
      }
      if (!state.b2.isConnected) {
        document.getElementById('b2-status-dot').classList.remove('connected');
        document.getElementById('b2-status-text').innerText = 'Disconnected';
      }
      if (!state.b3.isConnected) {
        const b3Dot = document.getElementById('b3-status-dot');
        const b3Txt = document.getElementById('b3-status-text');
        if (b3Dot) b3Dot.classList.remove('connected');
        if (b3Txt) b3Txt.innerText = 'Disconnected';
      }
      updateConveyorState(state.b2.currentLocation, 0.0, state.b2.lastDt, true);
    }
  });

  // CSV Export with Tri-Device Telemetry
  document.getElementById('btn-export-csv').addEventListener('click', () => {
    if (state.recordedData.length === 0) {
      alert('No telemetry data recorded yet. Connect sensors or enable Demo Mode first.');
      return;
    }

    const headers = [
      'Timestamp', 'Node', 'Weight_g', 'Pitch_deg', 'Roll_deg', 'Yaw_deg',
      'Accel_X_g', 'Accel_Y_g', 'Accel_Z_g', 'Gyro_X_dps', 'Gyro_Y_dps', 'Gyro_Z_dps',
      'Vibration_g', 'Temp_C', 'Conveyor_Location', 'Speed_cm_s', 'Speed_m_s', 'Transit_Time_ms', 'Status'
    ];
    const rows = state.recordedData.map(d => [
      d.time,
      d.node,
      d.weight !== undefined ? d.weight.toFixed(1) : '',
      d.pitch !== undefined ? d.pitch.toFixed(2) : '',
      d.roll !== undefined ? d.roll.toFixed(2) : '',
      d.yaw !== undefined ? d.yaw.toFixed(2) : '',
      d.ax !== undefined ? d.ax.toFixed(3) : '',
      d.ay !== undefined ? d.ay.toFixed(3) : '',
      d.az !== undefined ? d.az.toFixed(3) : '',
      d.gx !== undefined ? d.gx.toFixed(2) : '',
      d.gy !== undefined ? d.gy.toFixed(2) : '',
      d.gz !== undefined ? d.gz.toFixed(2) : '',
      d.gTotal !== undefined ? d.gTotal.toFixed(2) : '',
      d.temp !== undefined ? d.temp.toFixed(1) : '',
      d.location !== undefined ? d.location : '',
      d.speed_cm_s !== undefined ? d.speed_cm_s.toFixed(1) : '',
      d.speed_m_s !== undefined ? d.speed_m_s.toFixed(2) : '',
      d.dt_ms !== undefined ? d.dt_ms : '',
      d.status || ''
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `telemetry_conveyor_iot_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  // Clear / Reset Button
  document.getElementById('btn-clear-data').addEventListener('click', () => {
    resetAllAlarms();
    if (state.b1.chartAccel) state.b1.chartAccel.clear();
    if (state.b1.chartGyro)  state.b1.chartGyro.clear();
    if (state.b2.chartSpeed) state.b2.chartSpeed.clear();
    if (state.b3.chartWeight) state.b3.chartWeight.clear();
    if (state.b3.chartAccel)  state.b3.chartAccel.clear();
    if (state.b3.chartGyro)   state.b3.chartGyro.clear();

    state.recordedData = [];
    state.b1.packetCount = 0;
    state.b2.packetCount = 0;
    state.b3.packetCount = 0;
    state.b3.peakWeight = 0.0;
    state.totalPackets = 0;

    document.getElementById('b1-packets').innerText = '0';
    document.getElementById('b2-packets').innerText = '0';
    const b3Packets = document.getElementById('b3-packets');
    const b3Peak = document.getElementById('b3-val-peak');
    const b3Weight = document.getElementById('b3-val-weight');
    const b3Bar = document.getElementById('b3-bar-weight');

    if (b3Packets) b3Packets.innerText = '0';
    if (b3Peak) b3Peak.innerText = '0.0 g';
    if (b3Weight) b3Weight.innerText = '0.0';
    if (b3Bar) b3Bar.style.width = '0%';

    document.getElementById('total-packet-count').innerText = '0';
    updateConveyorState(1, 0.0, 0, true);
  });

  // Wi-Fi / WebSocket Modal
  const modal = document.getElementById('network-modal');
  const btnNetworkModal = document.getElementById('btn-network-modal');
  if (btnNetworkModal && modal) {
    btnNetworkModal.addEventListener('click', () => modal.classList.add('open'));
  }
  const modalCloseBtn = document.getElementById('modal-close-btn');
  if (modalCloseBtn && modal) {
    modalCloseBtn.addEventListener('click', () => modal.classList.remove('open'));
  }
  const modalCancelBtn = document.getElementById('modal-cancel-btn');
  if (modalCancelBtn && modal) {
    modalCancelBtn.addEventListener('click', () => modal.classList.remove('open'));
  }

  // Sound Siren Toggle Button
  const btnToggleSound = document.getElementById('btn-toggle-sound');
  if (btnToggleSound) {
    btnToggleSound.addEventListener('click', () => {
      initAudioContext();
      state.thresholds.soundEnabled = !state.thresholds.soundEnabled;
      if (state.thresholds.soundEnabled) {
        btnToggleSound.classList.remove('btn-muted');
        btnToggleSound.innerHTML = '<span id="sound-icon">🔔</span> <span>Sound: ON</span>';
        playAlarmSound('disturbance');
      } else {
        btnToggleSound.classList.add('btn-muted');
        btnToggleSound.innerHTML = '<span id="sound-icon">🔕</span> <span>Sound: MUTED</span>';
      }
      const chk = document.getElementById('thresh-sound-toggle');
      if (chk) chk.checked = state.thresholds.soundEnabled;
    });
  }

  // Thresholds Modal Controls
  const threshModal = document.getElementById('thresholds-modal');
  const btnThreshModal = document.getElementById('btn-thresholds-modal');
  const threshCloseBtn = document.getElementById('thresh-modal-close-btn');
  const threshSaveBtn = document.getElementById('thresh-modal-save-btn');
  const threshResetBtn = document.getElementById('thresh-modal-reset-btn');

  if (btnThreshModal && threshModal) {
    btnThreshModal.addEventListener('click', () => {
      document.getElementById('thresh-weight-limit').value = state.thresholds.weightLimit;
      document.getElementById('thresh-shock-g').value = state.thresholds.shockG;
      document.getElementById('thresh-gyro-spike').value = state.thresholds.gyroSpike;
      document.getElementById('thresh-sound-toggle').checked = state.thresholds.soundEnabled;
      threshModal.classList.add('open');
    });
  }

  if (threshCloseBtn && threshModal) {
    threshCloseBtn.addEventListener('click', () => threshModal.classList.remove('open'));
  }

  if (threshSaveBtn && threshModal) {
    threshSaveBtn.addEventListener('click', () => {
      const w = parseFloat(document.getElementById('thresh-weight-limit').value);
      const g = parseFloat(document.getElementById('thresh-shock-g').value);
      const j = parseFloat(document.getElementById('thresh-gyro-spike').value);
      const snd = document.getElementById('thresh-sound-toggle').checked;

      if (!isNaN(w) && w > 0) state.thresholds.weightLimit = w;
      if (!isNaN(g) && g > 0) state.thresholds.shockG = g;
      if (!isNaN(j) && j > 0) state.thresholds.gyroSpike = j;
      state.thresholds.soundEnabled = snd;

      if (btnToggleSound) {
        if (snd) {
          btnToggleSound.classList.remove('btn-muted');
          btnToggleSound.innerHTML = '<span id="sound-icon">🔔</span> <span>Sound: ON</span>';
        } else {
          btnToggleSound.classList.add('btn-muted');
          btnToggleSound.innerHTML = '<span id="sound-icon">🔕</span> <span>Sound: MUTED</span>';
        }
      }

      threshModal.classList.remove('open');
      logToConsole('b3', `Thresholds saved: Weight > ${state.thresholds.weightLimit}g, Shock > ${state.thresholds.shockG}g, Gyro Spike > ${state.thresholds.gyroSpike}°/s, Sound: ${snd ? 'ON' : 'OFF'}`, 'ok');
    });
  }

  if (threshResetBtn) {
    threshResetBtn.addEventListener('click', () => {
      document.getElementById('thresh-weight-limit').value = 50;
      document.getElementById('thresh-shock-g').value = 1.45;
      document.getElementById('thresh-gyro-spike').value = 90;
      document.getElementById('thresh-sound-toggle').checked = true;
    });
  }

  // Dismiss button for global alert banner
  const alertDismissBtn = document.getElementById('global-alert-dismiss');
  if (alertDismissBtn) {
    alertDismissBtn.addEventListener('click', () => {
      const strip = document.getElementById('global-alert-strip');
      if (strip) {
        strip.style.display = 'none';
        strip.classList.add('hidden');
      }
    });
  }
});
