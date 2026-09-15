/**
 * Ore Sentinels Full-Screen Industrial Sensor Inspection Cockpit
 * Renders real-time 20Hz high-frequency waveform telemetry, threshold limit bands,
 * and comprehensive diagnostic telemetry in a responsive, hardware-accelerated full-screen modal.
 */

export class SensorDetailsDrawer {
  constructor(drawerElement, onFocusSensor) {
    this.drawer = drawerElement;
    this.onFocusSensor = onFocusSensor;
    this.currentSensorKey = null;
    this.historyData = [];
    this.maxHistory = 60;

    this.canvas = null;
    this.ctx = null;
    this.currentStatus = 'normal';
    this.warnLimit = null;
    this.critLimit = null;
    this.unit = '';

    this.setupDOM();
    this.setupGlobalEvents();
  }

  setupDOM() {
    this.drawer.innerHTML = `
      <div class="sensor-fullscreen-dialog" id="sensor-fullscreen-dialog" role="dialog" aria-modal="true">
        <!-- Laser Scanning Top Accent -->
        <div class="cockpit-scan-line"></div>

        <!-- Full-Screen Cockpit Header -->
        <div class="sensor-fullscreen-header">
          <div class="drawer-title-group">
            <div style="font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em; color: var(--primary-blue, #00f0ff); text-transform: uppercase; margin-bottom: 2px;">
              ORE SENTINELS 20Hz SENSOR DAQ // INSPECTION COCKPIT
            </div>
            <h2 id="drawer-sensor-title" style="font-size: 1.45rem; font-weight: 800; margin: 0; display: flex; align-items: center; gap: 12px;">
              Sensor Details
            </h2>
            <p id="drawer-sensor-desc" style="font-size: 0.84rem; color: #64748b; margin: 4px 0 0 0;">
              Physical Conveyor Hardware Component Telemetry
            </p>
          </div>

          <div style="display: flex; align-items: center; gap: 14px;">
            <div id="drawer-status-badge" style="display: flex; align-items: center; gap: 8px; padding: 6px 14px; border-radius: 20px; font-size: 0.78rem; font-weight: 700; font-family: var(--font-mono); background: rgba(16, 185, 129, 0.12); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3);">
              <span id="drawer-status-dot" style="width: 8px; height: 8px; border-radius: 50%; background: #10b981; box-shadow: 0 0 8px #10b981;"></span>
              <span id="drawer-status-text">NOMINAL</span>
            </div>

            <button id="btn-drawer-focus-header" class="tool-btn" style="padding: 6px 14px; font-size: 0.8rem; display: flex; align-items: center; gap: 6px;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
              Focus 3D Viewport
            </button>

            <button class="modal-close-btn" id="drawer-close-x" style="font-size: 1.5rem; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 50%; cursor: pointer;" aria-label="Close Inspector">&times;</button>
          </div>
        </div>

        <!-- Full-Screen Scrollable Body -->
        <div class="sensor-fullscreen-body">
          
          <!-- Top KPI Strip -->
          <div class="sensor-kpi-row">
            <div class="sensor-kpi-box" style="border-left: 4px solid var(--primary-blue, #38bdf8);">
              <div style="font-size: 0.72rem; font-weight: 700; color: #64748b; letter-spacing: 0.05em;">REAL-TIME TELEMETRY</div>
              <div style="display: flex; align-items: baseline; gap: 6px;">
                <span id="drawer-metric-val" style="font-family: var(--font-mono); font-size: 2.2rem; font-weight: 800; color: var(--text-main, #0f172a);">--</span>
                <span id="drawer-metric-unit" style="font-size: 1.0rem; font-weight: 600; color: #64748b;">--</span>
              </div>
              <div id="drawer-metric-rate" style="font-size: 0.74rem; color: #10b981; font-family: var(--font-mono);">Sampling: 20 Hz (50ms interval)</div>
            </div>

            <div class="sensor-kpi-box" style="border-left: 4px solid #10b981;">
              <div style="font-size: 0.72rem; font-weight: 700; color: #64748b; letter-spacing: 0.05em;">NOMINAL BASELINE</div>
              <div id="drawer-nom-range" style="font-family: var(--font-mono); font-size: 1.5rem; font-weight: 700; color: #10b981; margin-top: 4px;">
                Nominal
              </div>
              <div style="font-size: 0.74rem; color: #64748b;">Acceptable operating band</div>
            </div>

            <div class="sensor-kpi-box" style="border-left: 4px solid #f59e0b;">
              <div style="font-size: 0.72rem; font-weight: 700; color: #64748b; letter-spacing: 0.05em;">ADVISORY WARNING SETPOINT</div>
              <div id="drawer-warn-limit" style="font-family: var(--font-mono); font-size: 1.5rem; font-weight: 700; color: #f59e0b; margin-top: 4px;">
                --
              </div>
              <div style="font-size: 0.74rem; color: #64748b;">Triggers inspection ticket</div>
            </div>

            <div class="sensor-kpi-box" style="border-left: 4px solid #ef4444;">
              <div style="font-size: 0.72rem; font-weight: 700; color: #64748b; letter-spacing: 0.05em;">EMERGENCY TRIP SETPOINT</div>
              <div id="drawer-crit-limit" style="font-family: var(--font-mono); font-size: 1.5rem; font-weight: 700; color: #ef4444; margin-top: 4px;">
                --
              </div>
              <div style="font-size: 0.74rem; color: #64748b;">Emergency trip interlock</div>
            </div>
          </div>

          <!-- Real-Time Waveform Chart Container -->
          <div class="sensor-chart-card">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <h4 style="font-size: 0.95rem; font-weight: 700; margin: 0; display: flex; align-items: center; gap: 8px;">
                  High-Frequency Real-Time Telemetry Stream (Last 60 Samples @ 20Hz)
                </h4>
                <div style="font-size: 0.76rem; color: #64748b; margin-top: 2px;">
                  Continuous live circular buffer with active Warning &amp; Critical setpoint bounds
                </div>
              </div>
              <div id="drawer-chart-stats" style="display: flex; gap: 14px; font-family: var(--font-mono); font-size: 0.76rem; color: #64748b;">
                <span>MIN: <b id="stat-min" style="color: var(--text-main);">--</b></span>
                <span>MEAN: <b id="stat-mean" style="color: var(--text-main);">--</b></span>
                <span>MAX: <b id="stat-max" style="color: var(--text-main);">--</b></span>
              </div>
            </div>

            <div style="position: relative; width: 100%; height: 230px; background: rgba(0,0,0,0.02); border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
              <canvas id="drawer-chart-canvas" width="1160" height="230" style="width: 100%; height: 100%; display: block;"></canvas>
            </div>
          </div>

          <!-- Bottom Diagnostics & Actions Matrix -->
          <div class="sensor-diagnostics-grid">
            
            <!-- Left: Technical Hardware Specs -->
            <div class="sensor-diag-card">
              <h4 style="font-size: 0.9rem; font-weight: 700; margin: 0; color: var(--text-main);">
                Component Architecture &amp; DAQ Node Specs
              </h4>
              <table class="threshold-table" style="width: 100%; font-size: 0.8rem;">
                <tr><td style="color: #64748b; width: 45%;">Sensor Tag / Channel</td><td id="drawer-sensor-tag" style="font-family: var(--font-mono); font-weight: 700;">--</td></tr>
                <tr><td style="color: #64748b;">Physical CAD Mesh</td><td id="drawer-cad-mesh" style="font-family: var(--font-mono);">--</td></tr>
                <tr><td style="color: #64748b;">Location / Station</td><td id="drawer-sensor-loc">Conveyor Return &amp; Drive Strand</td></tr>
                <tr><td style="color: #64748b;">Bus Interface Protocol</td><td>Modbus TCP / RS-485 USB-DAQ Bus</td></tr>
                <tr><td style="color: #64748b;">Sampling Clock Loop</td><td>Hardware Interrupt 20 Hz (&plusmn;0.2ms jitter)</td></tr>
                <tr><td style="color: #64748b;">Calibration Offset</td><td id="drawer-cal-offset" style="font-family: var(--font-mono); color: #10b981;">0.00 (Calibrated)</td></tr>
              </table>
            </div>

            <!-- Right: Quick Diagnostic Controls -->
            <div class="sensor-diag-card">
              <h4 style="font-size: 0.9rem; font-weight: 700; margin: 0; color: var(--text-main);">
                Operational Control &amp; Maintenance Actions
              </h4>
              <p style="font-size: 0.78rem; color: #64748b; margin: 0;">
                Direct hardware actions transmitted through the digital twin supervisory loop.
              </p>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 4px;">
                <button id="btn-drawer-focus-bottom" class="tool-btn active" style="justify-content: center; height: 38px;">
                  Focus in 3D Twin
                </button>
                <button id="btn-drawer-ack" class="tool-btn" style="justify-content: center; height: 38px;">
                  Acknowledge Alarm
                </button>
                <button id="btn-drawer-zero" class="tool-btn" style="justify-content: center; height: 38px;">
                  Zero-Calibrate Sensor
                </button>
                <button id="btn-drawer-export" class="tool-btn" style="justify-content: center; height: 38px;">
                  Export CSV (60 Pts)
                </button>
              </div>
              <button id="btn-drawer-close-bottom" class="tool-btn" style="justify-content: center; margin-top: 6px; height: 38px; background: rgba(239, 68, 68, 0.08); color: #ef4444; border-color: rgba(239, 68, 68, 0.2);">
                Close Fullscreen Inspector
              </button>
            </div>

          </div>

        </div>
      </div>
    `;

    // Event Bindings
    const closeBtn = document.getElementById('drawer-close-x');
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());

    const closeBottomBtn = document.getElementById('btn-drawer-close-bottom');
    if (closeBottomBtn) closeBottomBtn.addEventListener('click', () => this.close());

    const focusHeaderBtn = document.getElementById('btn-drawer-focus-header');
    if (focusHeaderBtn) {
      focusHeaderBtn.addEventListener('click', () => {
        if (this.onFocusSensor && this.currentSensorKey) {
          this.onFocusSensor(this.currentSensorKey);
          this.close();
        }
      });
    }

    const focusBottomBtn = document.getElementById('btn-drawer-focus-bottom');
    if (focusBottomBtn) {
      focusBottomBtn.addEventListener('click', () => {
        if (this.onFocusSensor && this.currentSensorKey) {
          this.onFocusSensor(this.currentSensorKey);
          this.close();
        }
      });
    }

    const ackBtn = document.getElementById('btn-drawer-ack');
    if (ackBtn) {
      ackBtn.addEventListener('click', () => {
        ackBtn.textContent = 'Acknowledged ✓';
        ackBtn.style.color = '#10b981';
        setTimeout(() => {
          ackBtn.textContent = 'Acknowledge Alarm';
          ackBtn.style.color = '';
        }, 2500);
      });
    }

    const zeroBtn = document.getElementById('btn-drawer-zero');
    if (zeroBtn) {
      zeroBtn.addEventListener('click', () => {
        zeroBtn.textContent = 'Zeroed (0.00) ✓';
        zeroBtn.style.color = '#10b981';
        const calOffset = document.getElementById('drawer-cal-offset');
        if (calOffset) calOffset.textContent = 'Offset -' + (this.historyData[this.historyData.length - 1] || '0.00');
        setTimeout(() => {
          zeroBtn.textContent = 'Zero-Calibrate Sensor';
          zeroBtn.style.color = '';
        }, 2500);
      });
    }

    const exportBtn = document.getElementById('btn-drawer-export');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportCSV());
    }

    this.canvas = document.getElementById('drawer-chart-canvas');
    if (this.canvas) {
      this.ctx = this.canvas.getContext('2d');
    }
  }

  setupGlobalEvents() {
    // Close on clicking backdrop outside dialog
    this.drawer.addEventListener('click', (e) => {
      if (e.target === this.drawer) {
        this.close();
      }
    });

    // Close on Escape key
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.drawer.classList.contains('open')) {
        this.close();
      }
    });
  }

  open(key, sensorData) {
    const isAlreadyOpen = this.drawer.classList.contains('open');
    const isDifferentKey = this.currentSensorKey !== key;
    this.currentSensorKey = key;
    const initialVal = Number(sensorData?.val !== undefined ? sensorData.val : 0);
    this.historyData = [initialVal];

    const dialog = this.drawer.querySelector('.sensor-fullscreen-dialog');
    if (dialog) {
      if (!isAlreadyOpen) {
        dialog.classList.remove('dialog-unfold', 'dialog-closing');
        void dialog.offsetWidth; // force DOM reflow
        dialog.classList.add('dialog-unfold');
      } else if (isDifferentKey) {
        dialog.classList.remove('tab-morphing');
        void dialog.offsetWidth; // force DOM reflow
        dialog.classList.add('tab-morphing');
        setTimeout(() => dialog.classList.remove('tab-morphing'), 400);
      }
    }

    this.drawer.classList.add('open');
    this.updateDetails(sensorData);
  }

  close() {
    const dialog = this.drawer.querySelector('.sensor-fullscreen-dialog');
    if (dialog && this.drawer.classList.contains('open')) {
      dialog.classList.add('dialog-closing');
      setTimeout(() => {
        this.drawer.classList.remove('open');
        dialog.classList.remove('dialog-unfold', 'dialog-closing', 'tab-morphing');
        this.currentSensorKey = null;
      }, 220);
    } else {
      this.drawer.classList.remove('open');
      this.currentSensorKey = null;
    }
  }

  updateDetails(sensorData) {
    if (!this.currentSensorKey || !sensorData) return;

    const key = this.currentSensorKey;
    const titleEl = document.getElementById('drawer-sensor-title');
    const descEl = document.getElementById('drawer-sensor-desc');
    const tagEl = document.getElementById('drawer-sensor-tag');
    const valEl = document.getElementById('drawer-metric-val');
    const unitEl = document.getElementById('drawer-metric-unit');
    const warnEl = document.getElementById('drawer-warn-limit');
    const critEl = document.getElementById('drawer-crit-limit');
    const meshEl = document.getElementById('drawer-cad-mesh');
    const badgeEl = document.getElementById('drawer-status-badge');
    const dotEl = document.getElementById('drawer-status-dot');
    const textEl = document.getElementById('drawer-status-text');
    const locEl = document.getElementById('drawer-sensor-loc');

    const tagName = sensorData.tag || key;
    if (titleEl) titleEl.textContent = tagName;
    if (descEl) descEl.textContent = sensorData.description || 'Industrial Physical Telemetry Sensor';
    if (tagEl) tagEl.textContent = `${tagName} [${key}]`;

    const val = Number(sensorData.val !== undefined ? sensorData.val : 0);
    this.unit = sensorData.unit || '';

    if (valEl) valEl.textContent = Number.isInteger(val) ? val : val.toFixed(2);
    if (unitEl) unitEl.textContent = this.unit;

    this.warnLimit = sensorData.warn_limit !== undefined ? Number(sensorData.warn_limit) : null;
    this.critLimit = sensorData.crit_limit !== undefined ? Number(sensorData.crit_limit) : null;

    if (warnEl) warnEl.textContent = this.warnLimit !== null ? `${this.warnLimit} ${this.unit}` : 'None';
    if (critEl) critEl.textContent = this.critLimit !== null ? `${this.critLimit} ${this.unit}` : 'None';

    const meshName = sensorData.mesh || this.inferMeshName(key);
    if (meshEl) meshEl.textContent = meshName;
    if (locEl) locEl.textContent = this.inferLocation(key);

    const status = sensorData.status || 'normal';
    this.currentStatus = status;

    if (badgeEl && dotEl && textEl) {
      if (status === 'critical') {
        badgeEl.style.background = 'rgba(239, 68, 68, 0.14)';
        badgeEl.style.color = '#ef4444';
        badgeEl.style.borderColor = 'rgba(239, 68, 68, 0.4)';
        dotEl.style.background = '#ef4444';
        dotEl.style.boxShadow = '0 0 10px #ef4444';
        textEl.textContent = 'CRITICAL TRIP';
        if (valEl) valEl.style.color = '#ef4444';
      } else if (status === 'warning') {
        badgeEl.style.background = 'rgba(245, 158, 11, 0.14)';
        badgeEl.style.color = '#f59e0b';
        badgeEl.style.borderColor = 'rgba(245, 158, 11, 0.4)';
        dotEl.style.background = '#f59e0b';
        dotEl.style.boxShadow = '0 0 10px #f59e0b';
        textEl.textContent = 'WARNING LIMIT';
        if (valEl) valEl.style.color = '#f59e0b';
      } else {
        badgeEl.style.background = 'rgba(16, 185, 129, 0.14)';
        badgeEl.style.color = '#10b981';
        badgeEl.style.borderColor = 'rgba(16, 185, 129, 0.4)';
        dotEl.style.background = '#10b981';
        dotEl.style.boxShadow = '0 0 10px #10b981';
        textEl.textContent = 'NOMINAL';
        if (valEl) valEl.style.color = 'var(--text-main, #0f172a)';
      }
    }

    // Append to rolling history
    this.historyData.push(val);
    if (this.historyData.length > this.maxHistory) {
      this.historyData.shift();
    }

    this.renderChart(status);
  }

  renderChart(status) {
    if (!this.ctx || !this.canvas || this.historyData.length < 1) return;

    const w = this.canvas.width;
    const h = this.canvas.height;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, w, h);

    // Dynamic scale bounds
    let allVals = [...this.historyData];
    if (this.warnLimit !== null) allVals.push(this.warnLimit);
    if (this.critLimit !== null) allVals.push(this.critLimit);

    const minVal = Math.min(...allVals) * 0.92;
    const maxVal = Math.max(...allVals) * 1.08 || 1.0;
    const range = (maxVal - minVal) || 1.0;

    const getY = (val) => h - ((val - minVal) / range) * (h - 40) - 20;

    // Update stats summary strip
    const curMin = Math.min(...this.historyData);
    const curMax = Math.max(...this.historyData);
    const curMean = (this.historyData.reduce((a, b) => a + b, 0) / this.historyData.length);

    const statMin = document.getElementById('stat-min');
    const statMean = document.getElementById('stat-mean');
    const statMax = document.getElementById('stat-max');
    if (statMin) statMin.textContent = `${curMin.toFixed(2)} ${this.unit}`;
    if (statMean) statMean.textContent = `${curMean.toFixed(2)} ${this.unit}`;
    if (statMax) statMax.textContent = `${curMax.toFixed(2)} ${this.unit}`;

    // 1. Grid Lines & Values
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
    ctx.lineWidth = 1;
    ctx.font = '10px monospace';
    ctx.fillStyle = '#64748b';

    for (let p = 0; p <= 4; p++) {
      const y = 20 + p * ((h - 40) / 4);
      const valAtY = maxVal - (p / 4) * range;
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(w - 20, y);
      ctx.stroke();

      ctx.fillText(valAtY.toFixed(1), 6, y + 3);
    }

    // 2. Warning Threshold Line
    if (this.warnLimit !== null && this.warnLimit >= minVal && this.warnLimit <= maxVal) {
      const yWarn = getY(this.warnLimit);
      ctx.save();
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(40, yWarn);
      ctx.lineTo(w - 20, yWarn);
      ctx.stroke();

      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(`WARN LIMIT: ${this.warnLimit} ${this.unit}`, w - 170, yWarn - 5);
      ctx.restore();
    }

    // 3. Critical Threshold Line
    if (this.critLimit !== null && this.critLimit >= minVal && this.critLimit <= maxVal) {
      const yCrit = getY(this.critLimit);
      ctx.save();
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(40, yCrit);
      ctx.lineTo(w - 20, yCrit);
      ctx.stroke();

      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(`CRIT TRIP: ${this.critLimit} ${this.unit}`, w - 165, yCrit - 5);
      ctx.restore();
    }

    // 4. Waveform Area Fill
    let strokeColor = '#38bdf8';
    let gradientTop = 'rgba(56, 189, 248, 0.35)';
    if (status === 'warning') {
      strokeColor = '#f59e0b';
      gradientTop = 'rgba(245, 158, 11, 0.35)';
    } else if (status === 'critical') {
      strokeColor = '#ef4444';
      gradientTop = 'rgba(239, 68, 68, 0.40)';
    }

    const startX = 40;
    const plotWidth = w - 60;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, gradientTop);
    grad.addColorStop(1, 'rgba(56, 189, 248, 0.00)');

    ctx.beginPath();
    this.historyData.forEach((val, idx) => {
      const x = startX + (idx / (this.maxHistory - 1)) * plotWidth;
      const y = getY(val);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(startX + ((this.historyData.length - 1) / (this.maxHistory - 1)) * plotWidth, h - 20);
    ctx.lineTo(startX, h - 20);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // 5. Waveform Stroke
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2.8;
    ctx.lineJoin = 'round';
    ctx.beginPath();

    this.historyData.forEach((val, idx) => {
      const x = startX + (idx / (this.maxHistory - 1)) * plotWidth;
      const y = getY(val);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // 6. Current Head Point
    if (this.historyData.length > 0) {
      const lastVal = this.historyData[this.historyData.length - 1];
      const lastX = startX + ((this.historyData.length - 1) / (this.maxHistory - 1)) * plotWidth;
      const lastY = getY(lastVal);

      ctx.save();
      ctx.fillStyle = strokeColor;
      ctx.shadowColor = strokeColor;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(lastX, lastY, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(lastX, lastY, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  exportCSV() {
    if (!this.historyData.length) return;
    let csv = `Sample_Index,Sensor_Tag,Value,Unit,Timestamp\n`;
    const now = Date.now();
    this.historyData.forEach((val, idx) => {
      const t = new Date(now - (this.historyData.length - 1 - idx) * 50).toISOString();
      csv += `${idx + 1},${this.currentSensorKey || 'Sensor'},${val},${this.unit},${t}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.currentSensorKey || 'sensor'}_telemetry_20hz.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  inferMeshName(key) {
    if (key.includes('misalignment_st01')) return 'TIME_OF_FLIGHT_1.stl';
    if (key.includes('misalignment_st02')) return 'TIME_OF_FLIGHT_2.stl';
    if (key.includes('thickness')) return 'THICKNESS_LASER_1.stl';
    if (key.includes('load')) return 'HX711_LOADCELL_1.stl';
    if (key.includes('speed') || key.includes('head')) return 'TACHOMETER_DRIVE.stl';
    if (key.includes('temp')) return 'PT100_BEARING_01.stl';
    if (key.includes('damage')) return 'AI_KEYENCE_PROFILER.stl';
    return 'BASE_FRAME_LINK.stl';
  }

  inferLocation(key) {
    if (key.includes('misalignment_st01')) return 'Tail Return Strand Station ST01';
    if (key.includes('misalignment_st02')) return 'Carrying Strand Station ST02';
    if (key.includes('thickness')) return 'Intake Belt Scanner Laser Station';
    if (key.includes('load')) return 'Head Support Frame Joint Stress Link';
    if (key.includes('head') || key.includes('speed_head')) return 'Head Discharge Drive Drum';
    if (key.includes('temp')) return 'Drive Motor Idler Bearing Housing';
    if (key.includes('damage')) return 'Overhead Optical Machine Vision Camera';
    return 'Conveyor Machinery Frame';
  }
}
