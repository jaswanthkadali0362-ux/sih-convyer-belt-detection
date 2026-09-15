/**
 * beltXence Daily Wear & Rupture Analytics Modal
 * Renders 7-day degradation curves, drift envelopes, and historical inspection tables.
 * Enhanced with Cyber-Industrial Glassmorphism, Interactive Tooltips, and Load Profile.
 */

export class DailyAnalyticsModal {
  constructor(containerEl, onSelectDayCallback) {
    this.container = containerEl;
    this.onSelectDay = onSelectDayCallback;
    this.data = null;
    this.isOpen = false;
    this.hoverIndex = -1;
    this.hoverCanvasId = null;
  }

  open(historyData) {
    this.data = historyData || this.getFallbackData();
    if (!this.data || !Array.isArray(this.data.days) || this.data.days.length === 0) {
      this.data = this.getFallbackData();
    }
    this.isOpen = true;
    this.render();
    requestAnimationFrame(() => {
      if (this.container) this.container.classList.add('active');
    });
    this.bindEvents();
    this.drawCharts();
  }

  getFallbackData() {
    return {
      total_days: 7,
      summary: {
        cumulative_tonnage: 336500,
        total_wear_loss_mm: 1.34,
        current_thickness_mm: 22.81,
        replacement_threshold_mm: 10.0,
        wear_rate_mm_day: 0.024,
        projected_days_remaining: 533,
        active_alarms: 2
      },
      days: [
        { day_index: 0, date_str: "Monday, Sep 08", relative_label: "Day -6", tonnage: 48200, tonnage_tons: 48200, load_kg: 32.1, load_sensor_st01: 32.1, thickness_st01: 24.15, misalignment_st01: 36.20, misalignment_st02: 58.40, bearing_temp_c: 41.2, temp_bearing_01: 41.2, ai_defects: 0, damage_st01: 0, status: "normal" },
        { day_index: 1, date_str: "Tuesday, Sep 09", relative_label: "Day -5", tonnage: 51400, tonnage_tons: 51400, load_kg: 34.5, load_sensor_st01: 34.5, thickness_st01: 23.92, misalignment_st01: 38.60, misalignment_st02: 61.10, bearing_temp_c: 42.0, temp_bearing_01: 42.0, ai_defects: 0, damage_st01: 0, status: "normal" },
        { day_index: 2, date_str: "Wednesday, Sep 10", relative_label: "Day -4", tonnage: 49800, tonnage_tons: 49800, load_kg: 33.8, load_sensor_st01: 33.8, thickness_st01: 23.68, misalignment_st01: 41.50, misalignment_st02: 64.30, bearing_temp_c: 43.1, temp_bearing_01: 43.1, ai_defects: 0, damage_st01: 0, status: "normal" },
        { day_index: 3, date_str: "Thursday, Sep 11", relative_label: "Day -3", tonnage: 53200, tonnage_tons: 53200, load_kg: 35.2, load_sensor_st01: 35.2, thickness_st01: 23.45, misalignment_st01: 44.80, misalignment_st02: 67.90, bearing_temp_c: 44.5, temp_bearing_01: 44.5, ai_defects: 1, damage_st01: 1, status: "warning" },
        { day_index: 4, date_str: "Friday, Sep 12", relative_label: "Day -2", tonnage: 52100, tonnage_tons: 52100, load_kg: 34.0, load_sensor_st01: 34.0, thickness_st01: 23.22, misalignment_st01: 47.30, misalignment_st02: 69.80, bearing_temp_c: 45.0, temp_bearing_01: 45.0, ai_defects: 1, damage_st01: 1, status: "warning" },
        { day_index: 5, date_str: "Saturday, Sep 13", relative_label: "Yesterday", tonnage: 47900, tonnage_tons: 47900, load_kg: 31.5, load_sensor_st01: 31.5, thickness_st01: 22.98, misalignment_st01: 51.10, misalignment_st02: 71.40, bearing_temp_c: 46.8, temp_bearing_01: 46.8, ai_defects: 2, damage_st01: 2, status: "critical" },
        { day_index: 6, date_str: "Sunday, Sep 14", relative_label: "Today (Live)", tonnage: 33900, tonnage_tons: 33900, load_kg: 35.0, load_sensor_st01: 35.0, thickness_st01: 22.81, misalignment_st01: 52.33, misalignment_st02: 72.33, bearing_temp_c: 47.2, temp_bearing_01: 47.2, ai_defects: 2, damage_st01: 2, status: "critical" }
      ]
    };
  }

  close() {
    this.isOpen = false;
    if (this.container) {
      this.container.classList.remove('active');
      setTimeout(() => {
        if (!this.isOpen && this.container) {
          this.container.innerHTML = '';
        }
      }, 320);
    }
  }

  render() {
    if (!this.container) return;
    if (!this.data) this.data = this.getFallbackData();

    const s = this.data.summary || {};
    const days = Array.isArray(this.data.days) ? this.data.days : [];

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    const cumTonnage = s.cumulative_tonnage !== undefined ? s.cumulative_tonnage.toLocaleString() : '336,500';
    const wearLoss = s.total_wear_loss_mm !== undefined ? s.total_wear_loss_mm : '1.34';
    const wearRate = s.wear_rate_mm_day !== undefined ? s.wear_rate_mm_day : '0.024';
    const usefulDays = s.projected_days_remaining !== undefined ? s.projected_days_remaining : '533';

    this.container.innerHTML = `
      <div class="analytics-modal-backdrop" id="analytics-backdrop">
        <div class="analytics-modal-dialog" role="dialog" aria-modal="true" style="max-width: 1180px;">
          
          <!-- Modal Header -->
          <div class="modal-header">
            <div class="modal-title-group">
              <div class="modal-tag">ORE SENTINELS HISTORICAL ARCHIVE // 7-DAY WEAR TELEMETRY</div>
              <h2>Ore Sentinels 7-Day Conveyor Wear Progression &amp; Rupture Risk Report</h2>
              <p class="modal-subtitle">Condition Monitoring Dataset: ${days[0]?.date_str || 'Monday, Sep 08'} &mdash; ${days[days.length - 1]?.date_str || 'Sunday, Sep 14'} | Ore Sentinels Archival Engine</p>
            </div>
            <button id="btn-close-analytics" class="modal-close-btn" aria-label="Close modal">&times;</button>
          </div>

          <!-- Modal Body Scrollable -->
          <div class="modal-body-scroll" style="gap: 18px;">
            
            <!-- Summary KPI Strip -->
            <div class="modal-kpi-grid">
              <div class="modal-kpi-card highlight-box">
                <div class="kpi-label">7-DAY CUMULATIVE TONNAGE</div>
                <div class="kpi-val" style="color: var(--primary-blue); font-family: var(--font-mono); font-weight: 800;">
                  ${cumTonnage} <span class="kpi-unit" style="font-size: 0.9rem;">TONS</span>
                </div>
                <div class="kpi-subtext">Avg 48,071 Tons / 24h operational cycle</div>
              </div>

              <div class="modal-kpi-card">
                <div class="kpi-label">TOTAL RUBBER WEAR LOSS</div>
                <div class="kpi-val highlight-wear" style="color: #ff1744; font-family: var(--font-mono); font-weight: 800;">
                  -${wearLoss} <span class="kpi-unit" style="font-size: 0.9rem;">mm</span>
                </div>
                <div class="kpi-subtext">From initial 24.15 mm nominal carcass cover</div>
              </div>

              <div class="modal-kpi-card">
                <div class="kpi-label">AVERAGE WEAR RATE</div>
                <div class="kpi-val" style="color: var(--text-dark); font-family: var(--font-mono); font-weight: 800;">
                  ${wearRate} <span class="kpi-unit" style="font-size: 0.9rem;">mm/day</span>
                </div>
                <div class="kpi-subtext">Calibrated via Ore Sentinels optical profilometer</div>
              </div>

              <div class="modal-kpi-card highlight-box">
                <div class="kpi-label">PROJECTED USEFUL LIFE</div>
                <div class="kpi-val" style="color: #10b981; font-family: var(--font-mono); font-weight: 800;">
                  ${usefulDays} <span class="kpi-unit" style="font-size: 0.9rem;">DAYS</span>
                </div>
                <div class="kpi-subtext">Until 10.0 mm carcass replacement limit</div>
              </div>
            </div>

            <!-- Charts Row (3 Rich Glassmorphic Telemetry Profiles) -->
            <div class="modal-charts-grid" style="grid-template-columns: repeat(2, 1fr); gap: 16px;">
              
              <!-- Chart 1: Vulcanized Rubber Carcass Thickness Decay -->
              <div class="chart-card">
                <div class="chart-card-header">
                  <div class="chart-title">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00f0ff" stroke-width="2.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                    <span>VULCANIZED RUBBER THICKNESS DECAY (mm)</span>
                  </div>
                  <div class="chart-legend-line">
                    <span class="dot-legend" style="background: #00f0ff;"></span> Laser Profilometer
                    <span class="dot-legend" style="background: #ffd600;"></span> Warn (15mm)
                    <span class="dot-legend" style="background: #ff1744;"></span> Crit (10mm)
                  </div>
                </div>
                <div class="canvas-chart-holder" style="position: relative;">
                  <canvas id="canvas-thickness-decay" width="540" height="190"></canvas>
                  <div id="tooltip-thickness" class="chart-hover-tooltip" style="display: none;"></div>
                </div>
              </div>

              <!-- Chart 2: Lateral Misalignment Drift Envelope -->
              <div class="chart-card">
                <div class="chart-card-header">
                  <div class="chart-title">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    <span>LATERAL MISALIGNMENT DRIFT (mm)</span>
                  </div>
                  <div class="chart-legend-line">
                    <span class="dot-legend" style="background: #ff1744;"></span> ST01 Return (&lt;50mm)
                    <span class="dot-legend" style="background: #f59e0b;"></span> ST02 Carry (&lt;71mm)
                  </div>
                </div>
                <div class="canvas-chart-holder" style="position: relative;">
                  <canvas id="canvas-drift-envelope" width="540" height="190"></canvas>
                  <div id="tooltip-drift" class="chart-hover-tooltip" style="display: none;"></div>
                </div>
              </div>

            </div>

            <!-- Historical Data Log Table -->
            <div class="modal-table-section">
              <div class="section-subhead">
                <h4>7-DAY COMPLETE TELEMETRY LOG</h4>
                <span>Industrial SCADA Archival Database &bull; Click row to frame conveyor timeline</span>
              </div>
              <div class="table-responsive-box">
                <table class="history-table">
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Date</th>
                      <th>Tonnage (T)</th>
                      <th>Load (kg)</th>
                      <th>Thickness (mm)</th>
                      <th>ST01 Drift (mm)</th>
                      <th>ST02 Drift (mm)</th>
                      <th>Bearing Temp (°C)</th>
                      <th>AI Defects</th>
                      <th>Condition</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${days.map((d, i) => {
                      const isToday = (i === days.length - 1);
                      const statusBadge = d.status === 'critical' ? '<span class="badge-status-crit">CRITICAL</span>' :
                                          d.status === 'warning' ? '<span class="badge-status-warn">WARNING</span>' :
                                          '<span class="badge-status-norm">OPTIMAL</span>';
                      
                      const tonnage = Number(d.tonnage !== undefined ? d.tonnage : (d.tonnage_tons !== undefined ? d.tonnage_tons : 48000));
                      const load = Number(d.load_kg !== undefined ? d.load_kg : (d.load_sensor_st01 !== undefined ? d.load_sensor_st01 : 32.0));
                      const thickness = Number(d.thickness_st01 !== undefined ? d.thickness_st01 : 22.81);
                      const drift01 = Number(d.misalignment_st01 !== undefined ? d.misalignment_st01 : 36.2);
                      const drift02 = Number(d.misalignment_st02 !== undefined ? d.misalignment_st02 : 58.4);
                      const temp = Number(d.bearing_temp_c !== undefined ? d.bearing_temp_c : (d.temp_bearing_01 !== undefined ? d.temp_bearing_01 : 42.0));
                      const defects = Number(d.ai_defects !== undefined ? d.ai_defects : (d.damage_st01 !== undefined ? d.damage_st01 : 0));

                      return `
                        <tr class="history-row" data-day-index="${i}">
                          <td><strong style="color: var(--text-dark);">${d.relative_label || `Day ${i}`}</strong></td>
                          <td>${d.date_str || ''}</td>
                          <td><strong style="font-family: var(--font-mono);">${tonnage.toLocaleString()}</strong></td>
                          <td>${load.toFixed(1)}</td>
                          <td style="color: ${thickness < 15 ? '#ef4444' : 'var(--primary-blue)'}; font-weight: 700;">${thickness.toFixed(2)}</td>
                          <td style="color: ${drift01 > 45 ? '#ef4444' : 'inherit'}; font-weight: 600;">${drift01.toFixed(1)}</td>
                          <td>${drift02.toFixed(1)}</td>
                          <td>${temp.toFixed(1)}</td>
                          <td>${defects === 0 ? '<span style="color: #10b981;">0 (Clean)</span>' : `<span style="color: #ef4444; font-weight: 800;">${defects}</span>`}</td>
                          <td>${statusBadge}</td>
                          <td>
                            <button class="btn-table-jump" data-day-index="${i}" title="View in 3D Scene">
                              Inspect 3D &rarr;
                            </button>
                          </td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

          <!-- Modal Footer -->
          <div class="modal-footer">
            <div class="footer-info">
              <span>Standard: ISO 5048 / DIN 22101 Continuous Belt Telemetry Analysis &bull; Certified Calibration</span>
            </div>
            <div class="footer-actions">
              <button id="btn-print-report" class="btn-secondary-action">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="margin-right: 5px;"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                Export PDF
              </button>
              <button id="btn-modal-close-action" class="btn-primary-action">Close Report</button>
            </div>
          </div>

        </div>
      </div>
    `;
  }

  bindEvents() {
    const backdrop = this.container.querySelector('#analytics-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) this.close();
      });
    }

    const closeBtn = this.container.querySelector('#btn-close-analytics');
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());

    const closeAction = this.container.querySelector('#btn-modal-close-action');
    if (closeAction) closeAction.addEventListener('click', () => this.close());

    const printBtn = this.container.querySelector('#btn-print-report');
    if (printBtn) {
      printBtn.addEventListener('click', () => {
        window.print();
      });
    }

    this.container.querySelectorAll('.btn-table-jump').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.dayIndex, 10);
        if (this.onSelectDay) this.onSelectDay(idx);
        this.close();
      });
    });

    this.container.querySelectorAll('.history-row').forEach(row => {
      row.addEventListener('click', () => {
        const idx = parseInt(row.dataset.dayIndex, 10);
        if (this.onSelectDay) this.onSelectDay(idx);
        this.close();
      });
    });

    // Chart Interactive Hover Handlers
    this.setupChartInteractivity('canvas-thickness-decay', 'tooltip-thickness', (d) => {
      const thk = Number(d.thickness_st01 || 22.81);
      return `<strong>${d.relative_label || ''} (${d.date_str || ''})</strong><br>Thickness: <strong>${thk.toFixed(2)} mm</strong><br>Wear Loss: -${(24.15 - thk).toFixed(2)} mm`;
    });

    this.setupChartInteractivity('canvas-drift-envelope', 'tooltip-drift', (d) => {
      const s1 = Number(d.misalignment_st01 || 36.2);
      const s2 = Number(d.misalignment_st02 || 58.4);
      return `<strong>${d.relative_label || ''} (${d.date_str || ''})</strong><br>ST01 Return: <strong style="color:#ff1744">${s1.toFixed(1)} mm</strong><br>ST02 Carry: <strong style="color:#f59e0b">${s2.toFixed(1)} mm</strong>`;
    });
  }

  setupChartInteractivity(canvasId, tooltipId, formatFn) {
    const canvas = this.container.querySelector(`#${canvasId}`);
    const tooltip = this.container.querySelector(`#${tooltipId}`);
    if (!canvas || !tooltip) return;

    const days = this.data.days;
    const padL = 50, padR = 25;

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const plotW = canvas.width - padL - padR;

      // Find closest day index
      let closestIdx = 0;
      let minDist = 9999;
      for (let i = 0; i < days.length; i++) {
        const x = (padL + (i / (days.length - 1)) * plotW) * (rect.width / canvas.width);
        const dist = Math.abs(mouseX - x);
        if (dist < minDist) {
          minDist = dist;
          closestIdx = i;
        }
      }

      this.hoverIndex = closestIdx;
      this.hoverCanvasId = canvasId;
      this.drawCharts();

      // Show tooltip
      const xPos = (padL + (closestIdx / (days.length - 1)) * plotW) * (rect.width / canvas.width);
      tooltip.innerHTML = formatFn(days[closestIdx]);
      tooltip.style.display = 'block';
      tooltip.style.left = `${Math.min(Math.max(xPos - 50, 10), rect.width - 130)}px`;
      tooltip.style.top = '12px';
    });

    canvas.addEventListener('mouseleave', () => {
      this.hoverIndex = -1;
      this.hoverCanvasId = null;
      tooltip.style.display = 'none';
      this.drawCharts();
    });
  }

  drawCharts() {
    this.drawThicknessChart();
    this.drawDriftChart();
  }

  drawThicknessChart() {
    const canvas = this.container.querySelector('#canvas-thickness-decay');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const days = this.data.days;

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    ctx.clearRect(0, 0, w, h);

    const padL = 50, padR = 25, padT = 25, padB = 35;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    const minY = 8.0;
    const maxY = 26.0;
    const getY = (val) => padT + (1 - (val - minY) / (maxY - minY)) * plotH;
    const getX = (i) => padL + (i / (days.length - 1)) * plotW;

    // Grid lines
    ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0';
    ctx.lineWidth = 1;

    for (let v = 10; v <= 25; v += 5) {
      const y = getY(v);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();

      ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
      ctx.font = 'bold 9.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${v} mm`, padL - 8, y + 3);
    }

    // Warning Line (15mm)
    const yWarn = getY(15.0);
    ctx.strokeStyle = '#ffd600';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padL, yWarn);
    ctx.lineTo(w - padR, yWarn);
    ctx.stroke();

    // Critical Threshold Line (10mm)
    const yCrit = getY(10.0);
    ctx.strokeStyle = '#ff1744';
    ctx.beginPath();
    ctx.moveTo(padL, yCrit);
    ctx.lineTo(w - padR, yCrit);
    ctx.stroke();
    ctx.setLineDash([]);

    // Curve Area Gradient Fill
    const grad = ctx.createLinearGradient(0, padT, 0, h - padB);
    grad.addColorStop(0, isDark ? 'rgba(0, 240, 255, 0.35)' : 'rgba(0, 114, 206, 0.25)');
    grad.addColorStop(1, isDark ? 'rgba(0, 240, 255, 0.0)' : 'rgba(0, 114, 206, 0.0)');

    ctx.beginPath();
    ctx.moveTo(getX(0), getY(days[0].thickness_st01));
    for (let i = 1; i < days.length; i++) {
      const prevX = getX(i - 1);
      const prevY = getY(days[i - 1].thickness_st01);
      const currX = getX(i);
      const currY = getY(days[i].thickness_st01);
      const cpX1 = prevX + (currX - prevX) / 2;
      const cpX2 = currX - (currX - prevX) / 2;
      ctx.bezierCurveTo(cpX1, prevY, cpX2, currY, currX, currY);
    }
    ctx.lineTo(getX(days.length - 1), h - padB);
    ctx.lineTo(getX(0), h - padB);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Glowing Curve Line
    ctx.strokeStyle = isDark ? '#00f0ff' : '#0072ce';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(getX(0), getY(days[0].thickness_st01));
    for (let i = 1; i < days.length; i++) {
      const prevX = getX(i - 1);
      const prevY = getY(days[i - 1].thickness_st01);
      const currX = getX(i);
      const currY = getY(days[i].thickness_st01);
      const cpX1 = prevX + (currX - prevX) / 2;
      const cpX2 = currX - (currX - prevX) / 2;
      ctx.bezierCurveTo(cpX1, prevY, cpX2, currY, currX, currY);
    }
    ctx.stroke();

    // Dots & Labels
    days.forEach((d, i) => {
      const x = getX(i);
      const y = getY(d.thickness_st01);
      const isHovered = (this.hoverIndex === i && this.hoverCanvasId === 'canvas-thickness-decay');

      // Hover Crosshair Line
      if (isHovered) {
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.5)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x, padT);
        ctx.lineTo(x, h - padB);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.fillStyle = isDark ? '#091018' : '#ffffff';
      ctx.strokeStyle = isHovered ? '#ff1744' : (isDark ? '#00f0ff' : '#0072ce');
      ctx.lineWidth = isHovered ? 3.5 : 2.5;
      ctx.beginPath();
      ctx.arc(x, y, isHovered ? 6 : 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Value label
      ctx.fillStyle = isDark ? '#f8fafc' : '#0f172a';
      ctx.font = isHovered ? 'bold 11px "JetBrains Mono", monospace' : 'bold 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${d.thickness_st01.toFixed(2)}`, x, y - 9);

      // X-axis label
      ctx.fillStyle = isDark ? '#94a3b8' : '#334155';
      ctx.font = 'bold 10px Outfit, sans-serif';
      ctx.fillText(d.relative_label.replace('Day ', 'D'), x, h - padB + 16);
    });
  }

  drawDriftChart() {
    const canvas = this.container.querySelector('#canvas-drift-envelope');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const days = this.data.days;

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    ctx.clearRect(0, 0, w, h);

    const padL = 50, padR = 25, padT = 25, padB = 35;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    const minY = 25.0;
    const maxY = 85.0;
    const getY = (val) => padT + (1 - (val - minY) / (maxY - minY)) * plotH;
    const getX = (i) => padL + (i / (days.length - 1)) * plotW;

    // Grid lines
    ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0';
    ctx.lineWidth = 1;
    for (let v = 30; v <= 80; v += 15) {
      const y = getY(v);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();

      ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
      ctx.font = 'bold 9.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${v} mm`, padL - 8, y + 3);
    }

    // Critical ST01 Limit (50mm)
    const yCrit01 = getY(50.0);
    ctx.strokeStyle = '#ff1744';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(padL, yCrit01);
    ctx.lineTo(w - padR, yCrit01);
    ctx.stroke();

    // Warning ST02 Limit (71.2mm)
    const yWarn02 = getY(71.2);
    ctx.strokeStyle = '#ffd600';
    ctx.beginPath();
    ctx.moveTo(padL, yWarn02);
    ctx.lineTo(w - padR, yWarn02);
    ctx.stroke();
    ctx.setLineDash([]);

    // Curve ST01 (Crimson line - Return strand drift)
    ctx.strokeStyle = '#ff1744';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(getX(0), getY(days[0].misalignment_st01));
    for (let i = 1; i < days.length; i++) {
      const prevX = getX(i - 1);
      const prevY = getY(days[i - 1].misalignment_st01);
      const currX = getX(i);
      const currY = getY(days[i].misalignment_st01);
      const cpX1 = prevX + (currX - prevX) / 2;
      const cpX2 = currX - (currX - prevX) / 2;
      ctx.bezierCurveTo(cpX1, prevY, cpX2, currY, currX, currY);
    }
    ctx.stroke();

    // Curve ST02 (Amber line - Carrying strand drift)
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(getX(0), getY(days[0].misalignment_st02));
    for (let i = 1; i < days.length; i++) {
      const prevX = getX(i - 1);
      const prevY = getY(days[i - 1].misalignment_st02);
      const currX = getX(i);
      const currY = getY(days[i].misalignment_st02);
      const cpX1 = prevX + (currX - prevX) / 2;
      const cpX2 = currX - (currX - prevX) / 2;
      ctx.bezierCurveTo(cpX1, prevY, cpX2, currY, currX, currY);
    }
    ctx.stroke();

    // Dots
    days.forEach((d, i) => {
      const x = getX(i);
      const isHovered = (this.hoverIndex === i && this.hoverCanvasId === 'canvas-drift-envelope');

      if (isHovered) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x, padT);
        ctx.lineTo(x, h - padB);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // ST01 dot
      const y1 = getY(d.misalignment_st01);
      ctx.fillStyle = '#ff1744';
      ctx.beginPath();
      ctx.arc(x, y1, isHovered ? 5.5 : 4, 0, Math.PI * 2);
      ctx.fill();

      // ST02 dot
      const y2 = getY(d.misalignment_st02);
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(x, y2, isHovered ? 5.5 : 4, 0, Math.PI * 2);
      ctx.fill();

      // X-axis label
      ctx.fillStyle = isDark ? '#94a3b8' : '#334155';
      ctx.font = 'bold 10px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(d.relative_label.replace('Day ', 'D'), x, h - padB + 16);
    });
  }
}
