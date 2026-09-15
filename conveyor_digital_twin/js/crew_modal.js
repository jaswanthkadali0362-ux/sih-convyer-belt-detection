/**
 * beltXence Industrial Maintenance Crew & Operator Management Console
 * Features:
 *  - Interactive Operator Diagnostic Dossier & Real-time Sensor Telemetry Feed
 *  - Interactive Diagnostic Laser Scan trigger with 3D audio-visual feedback
 *  - Over-The-Shoulder Follow-Cam Navigation (Third-Person Operator POV)
 *  - Real-time Station Reassignment & Catwalk Routing
 *  - Operator Vitals: Heart Rate, Body Temp, Shift Time, Radio RSSI
 *  - Inline Name & Role Customization with instant 3D sync
 *  - Global Operator Scale Slider (0.05x to 0.20x) with CAD frame calibration
 */

import { industrialAudio } from './industrial_workers.js';

export class CrewModal {
  constructor(containerEl, industrialCrew, scene = null, onCrewUpdateCallback = null) {
    this.container = containerEl;
    this.crew = industrialCrew;
    this.scene = scene;
    this.onCrewUpdate = onCrewUpdateCallback;
    this.isOpen = false;
    this.selectedWorkerId = 'worker_marcus';
    this.lastScanResults = {};
  }

  open(highlightWorkerId = null) {
    this.isOpen = true;
    if (highlightWorkerId) {
      this.selectedWorkerId = highlightWorkerId;
    }
    this.render();
    this.bindEvents();
  }

  close() {
    this.isOpen = false;
    if (this.container) {
      this.container.innerHTML = '';
      this.container.classList.remove('active');
    }
  }

  getLiveSensorData(sensorKey) {
    const liveSensors = window.app?.telemetryClient?.state?.sensors || {};
    if (sensorKey && liveSensors[sensorKey]) {
      return liveSensors[sensorKey];
    }
    // Fallback nominal telemetry
    const fallbacks = {
      'load_sensor_st01': { tag: 'Load Sensor ST01', val: 0.0, unit: 'kg', status: 'normal', description: 'Frame Joint Stress Load Cell' },
      'misalignment_st02': { tag: 'Misalignment ST02', val: 72.33, unit: 'mm', status: 'warning', description: 'Carrying Strand Optical Tracking' },
      'speed_head_drive': { tag: 'Head Drive Speed', val: 3.08, unit: 'm/s', status: 'normal', description: 'Main Drive Motor Tachometer' },
      'speed_mid_02': { tag: 'Speed Sensor 02', val: 2.96, unit: 'm/s', status: 'normal', description: 'Carrying Strand Linear Speed' },
      'misalignment_st01': { tag: 'Misalignment ST01', val: 32.40, unit: 'mm', status: 'normal', description: 'Return Strand Lateral Drift' }
    };
    return fallbacks[sensorKey] || { tag: 'Station Sensor', val: 0.0, unit: '--', status: 'normal', description: 'Nominal Condition' };
  }

  render() {
    if (!this.container || !this.crew) return;

    this.container.classList.add('active');
    const workers = this.crew.getWorkersList();
    const currentScale = this.crew.globalScale || 0.09;
    const activeCount = workers.filter(w => w.visible).length;
    const approxHeightMm = Math.round(currentScale * 1830);

    // Active selected worker
    const activeWorker = workers.find(w => w.id === this.selectedWorkerId) || workers[0] || {};
    const vitals = activeWorker.vitals || { bpm: 74, temp: 36.7, shiftHrs: '04:18', radioSignal: '99%' };
    const sensorInfo = this.getLiveSensorData(activeWorker.sensorKey);
    const scanResult = this.lastScanResults[activeWorker.id];

    const hardHatColors = {
      'lime_white': { hat: '#f8fafc', vest: '#84cc16', label: 'White / Lime (Supervisor)' },
      'orange_orange': { hat: '#f97316', vest: '#ea580c', label: 'Orange / Hi-Vis (Specialist)' },
      'blue_yellow': { hat: '#eab308', vest: '#0284c7', label: 'Yellow / Blue (Electrical)' }
    };
    const activeColors = hardHatColors[activeWorker.preset] || hardHatColors['lime_white'];

    this.container.innerHTML = `
      <div class="analytics-modal-backdrop" id="crew-backdrop">
        <div class="analytics-modal-dialog crew-modal-dialog" role="dialog" aria-modal="true" style="max-width: 880px;">
          
          <!-- Modal Header -->
          <div class="modal-header" style="padding-bottom: 12px;">
            <div class="modal-title-group">
              <div class="modal-tag">PLANT PERSONNEL &amp; ONSITE WORKFORCE</div>
              <h2>Industrial Maintenance Crew &amp; Operators</h2>
              <p class="modal-subtitle">Photorealistic rigged 3D human operators, live telemetry dossiers, diagnostic scans &amp; follow-cam.</p>
            </div>
            <button id="btn-close-crew" class="modal-close-btn" aria-label="Close modal">&times;</button>
          </div>

          <!-- Modal Body Scrollable -->
          <div class="modal-body-scroll" style="gap: 16px;">
            
            <!-- Featured Interactive Operator Dossier Card -->
            <div class="operator-dossier-card" style="background: linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95)); border: 1px solid rgba(0, 240, 255, 0.35); border-radius: 12px; padding: 18px 20px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35); color: #fff;">
              
              <!-- Dossier Header Strip -->
              <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255, 255, 255, 0.1); padding-bottom: 14px; gap: 14px; flex-wrap: wrap;">
                
                <div style="display: flex; align-items: center; gap: 14px;">
                  <!-- Avatar Badge with PPE Status -->
                  <div style="position: relative; width: 50px; height: 50px; border-radius: 10px; background: #0b1329; display: flex; align-items: center; justify-content: center; border: 2px solid ${activeColors.hat}; box-shadow: 0 0 16px rgba(0, 240, 255, 0.25);">
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="${activeColors.vest}" stroke="#f8fafc" stroke-width="1.5">
                      <circle cx="12" cy="7" r="4"/>
                      <path d="M5.5 21v-2a6.5 6.5 0 0 1 13 0v2"/>
                    </svg>
                    <span style="position: absolute; bottom: -3px; right: -3px; width: 12px; height: 12px; border-radius: 50%; background: #10b981; border: 2px solid #0f172a;" title="Operator Onsite &amp; Active"></span>
                  </div>

                  <!-- Name and Role Title (Editable) -->
                  <div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <input 
                        type="text" 
                        class="dossier-name-input" 
                        data-worker-id="${activeWorker.id}" 
                        value="${activeWorker.name}" 
                        placeholder="Operator Name..." 
                        style="font-size: 1.15rem; font-weight: 800; color: #fff; background: rgba(0, 114, 206, 0.15); border: 1px dashed rgba(0, 240, 255, 0.4); border-radius: 6px; padding: 2px 8px; outline: none; width: 220px;"
                      />
                      <span style="font-size: 0.70rem; font-weight: 700; background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); padding: 2px 8px; border-radius: 4px;">
                        ● ACTIVE PATROL
                      </span>
                    </div>
                    <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 3px;">
                      ${activeWorker.role} &bull; <span style="color: #38bdf8;">PPE: ${activeColors.label}</span>
                    </div>
                  </div>
                </div>

                <!-- Action Controls: Focus 3D & Follow-Cam -->
                <div style="display: flex; gap: 8px; align-items: center;">
                  <button id="btn-dossier-focus" data-worker-id="${activeWorker.id}" class="dossier-action-btn" style="display: flex; align-items: center; gap: 6px; padding: 7px 12px; background: rgba(0, 114, 206, 0.25); border: 1px solid rgba(0, 114, 206, 0.5); border-radius: 6px; color: #38bdf8; font-size: 0.76rem; font-weight: 700; cursor: pointer;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
                    <span>Focus 3D</span>
                  </button>
                  <button id="btn-dossier-follow" data-worker-id="${activeWorker.id}" class="dossier-action-btn" style="display: flex; align-items: center; gap: 6px; padding: 7px 12px; background: rgba(16, 185, 129, 0.2); border: 1px solid rgba(16, 185, 129, 0.5); border-radius: 6px; color: #34d399; font-size: 0.76rem; font-weight: 700; cursor: pointer;" title="Over-the-shoulder third-person camera following this operator">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 7 16 12 23 17 23 7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                    <span>Follow Cam (POV)</span>
                  </button>
                </div>

              </div>

              <!-- Vitals & Station Sensor Grid -->
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-top: 14px;">
                
                <!-- Vital: Heart Rate -->
                <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 10px 12px;">
                  <div style="font-size: 0.68rem; color: #94a3b8; text-transform: uppercase; font-weight: 700;">Biometric Pulse</div>
                  <div style="display: flex; align-items: baseline; gap: 6px; margin-top: 4px;">
                    <span style="font-size: 1.25rem; font-weight: 800; color: #f43f5e; font-family: monospace;">
                      ❤️ ${vitals.bpm}
                    </span>
                    <span style="font-size: 0.72rem; color: #94a3b8;">BPM (Normal)</span>
                  </div>
                </div>

                <!-- Vital: Shift Duration -->
                <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 10px 12px;">
                  <div style="font-size: 0.68rem; color: #94a3b8; text-transform: uppercase; font-weight: 700;">Shift Elapsed</div>
                  <div style="display: flex; align-items: baseline; gap: 6px; margin-top: 4px;">
                    <span style="font-size: 1.25rem; font-weight: 800; color: #38bdf8; font-family: monospace;">
                      ⏱️ ${vitals.shiftHrs}
                    </span>
                    <span style="font-size: 0.72rem; color: #94a3b8;">Hours</span>
                  </div>
                </div>

                <!-- Vital: Radio RSSI -->
                <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 10px 12px;">
                  <div style="font-size: 0.68rem; color: #94a3b8; text-transform: uppercase; font-weight: 700;">Comms Signal</div>
                  <div style="display: flex; align-items: baseline; gap: 6px; margin-top: 4px;">
                    <span style="font-size: 1.25rem; font-weight: 800; color: #10b981; font-family: monospace;">
                      📶 ${vitals.radioSignal}
                    </span>
                    <span style="font-size: 0.72rem; color: #94a3b8;">-58 dBm</span>
                  </div>
                </div>

                <!-- Station Sensor Live Value -->
                <div style="background: rgba(0, 114, 206, 0.15); border: 1px solid rgba(0, 240, 255, 0.3); border-radius: 8px; padding: 10px 12px;">
                  <div style="font-size: 0.68rem; color: #38bdf8; text-transform: uppercase; font-weight: 700;">
                    📍 ${sensorInfo.tag}
                  </div>
                  <div style="display: flex; align-items: baseline; gap: 6px; margin-top: 4px;">
                    <span style="font-size: 1.25rem; font-weight: 800; color: ${sensorInfo.status === 'warning' ? '#f59e0b' : '#00f0ff'}; font-family: monospace;">
                      ${sensorInfo.val.toFixed(2)} ${sensorInfo.unit}
                    </span>
                    <span style="font-size: 0.72rem; color: #94a3b8;">Live (20Hz)</span>
                  </div>
                </div>

              </div>

              <!-- Station Location & Interactive Actions Row -->
              <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 14px; gap: 12px; flex-wrap: wrap;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-size: 0.75rem; color: #94a3b8; font-weight: 700;">Assigned Station:</span>
                  <span style="font-family: monospace; font-size: 0.75rem; font-weight: 700; background: rgba(255, 255, 255, 0.08); padding: 4px 10px; border-radius: 6px; color: #e2e8f0; border: 1px solid rgba(255, 255, 255, 0.1);">
                    ${activeWorker.station}
                  </span>
                </div>

                <div style="display: flex; gap: 8px;">
                  <!-- Run Diagnostic Scan -->
                  <button id="btn-dossier-scan" data-worker-id="${activeWorker.id}" style="display: flex; align-items: center; gap: 6px; padding: 8px 14px; background: linear-gradient(135deg, #0284c7, #0072ce); border: none; border-radius: 6px; color: #ffffff; font-size: 0.76rem; font-weight: 800; cursor: pointer; box-shadow: 0 4px 14px rgba(0, 114, 206, 0.4);">
                    <span>⚡ Run Diagnostic Scan</span>
                  </button>

                  <!-- Radio Dispatch Callout -->
                  <button id="btn-dossier-radio" data-worker-id="${activeWorker.id}" style="display: flex; align-items: center; gap: 6px; padding: 8px 12px; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 6px; color: #e2e8f0; font-size: 0.76rem; font-weight: 700; cursor: pointer;">
                    <span>📻 Radio Dispatch</span>
                  </button>
                </div>
              </div>

              <!-- Live Diagnostic Scan Feedback Box (If triggered) -->
              ${scanResult ? `
                <div style="margin-top: 12px; background: rgba(0, 229, 255, 0.1); border: 1px solid #00e5ff; border-radius: 8px; padding: 10px 14px; font-family: monospace; font-size: 0.76rem; color: #a5f3fc; display: flex; align-items: center; gap: 10px;">
                  <span style="font-size: 1.1rem;">📡</span>
                  <div>
                    <strong>[DIAGNOSTIC TELEMETRY REPORT &bull; ${activeWorker.name}]:</strong>
                    ${scanResult.message}
                  </div>
                </div>
              ` : ''}

            </div>

            <!-- Global Scale & Proportions Card -->
            <div class="crew-control-card">
              <div class="crew-card-header">
                <div>
                  <h4 style="font-size: 0.85rem; font-weight: 800; margin: 0; color: var(--text-dark, #0f172a);">
                    Operator Visual Scale &amp; Frame Calibration
                  </h4>
                  <p style="font-size: 0.72rem; color: var(--text-muted, #64748b); margin: 2px 0 0;">
                    Adjust human height relative to the 243mm CAD conveyor chassis.
                  </p>
                </div>
                <div class="crew-scale-badge" id="crew-scale-display">
                  ${currentScale.toFixed(3)}x (${approxHeightMm} mm)
                </div>
              </div>

              <div style="display: flex; align-items: center; gap: 14px; margin-top: 10px;">
                <span style="font-size: 0.72rem; font-weight: 700; color: var(--text-muted);">Compact</span>
                <input 
                  type="range" 
                  id="crew-scale-slider" 
                  min="0.05" 
                  max="0.20" 
                  step="0.005" 
                  value="${currentScale}" 
                  style="flex: 1; accent-color: #0072ce; cursor: pointer;"
                />
                <span style="font-size: 0.72rem; font-weight: 700; color: var(--text-muted);">Standard</span>
              </div>

              <div class="crew-presets-row" style="display: flex; gap: 8px; margin-top: 10px;">
                <button class="crew-preset-btn ${Math.abs(currentScale - 0.07) < 0.01 ? 'active' : ''}" data-scale="0.07">Compact (0.07x &bull; 128mm)</button>
                <button class="crew-preset-btn ${Math.abs(currentScale - 0.09) < 0.01 ? 'active' : ''}" data-scale="0.09">Waist-Height (0.09x &bull; 165mm)</button>
                <button class="crew-preset-btn ${Math.abs(currentScale - 0.12) < 0.01 ? 'active' : ''}" data-scale="0.12">Proportional (0.12x &bull; 220mm)</button>
              </div>
            </div>

            <!-- Active Crew Roster Header Strip -->
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 4px 2px;">
              <div style="font-size: 0.82rem; font-weight: 800; color: var(--text-dark, #0f172a);">
                Active Crew Roster (<span id="crew-active-count">${activeCount}</span> of ${workers.length} Onsite)
              </div>
              <div style="display: flex; gap: 8px;">
                <button class="btn-crew-spread" id="btn-spread-workers" style="display: flex; align-items: center; gap: 6px; padding: 6px 12px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 6px; color: #059669; font-size: 0.75rem; font-weight: 700; cursor: pointer;" title="Scatter workers across left and right catwalks">
                  <span>🔀 Spread Workers</span>
                </button>
                <button class="btn-crew-add" id="btn-add-worker" style="display: flex; align-items: center; gap: 6px; padding: 6px 12px; background: rgba(0, 114, 206, 0.1); border: 1px solid rgba(0, 114, 206, 0.3); border-radius: 6px; color: #0072ce; font-size: 0.75rem; font-weight: 700; cursor: pointer;">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
                  <span>Add Operator</span>
                </button>
              </div>
            </div>

            <!-- Workers Roster Cards Grid -->
            <div class="crew-roster-grid" style="display: flex; flex-direction: column; gap: 10px;">
              ${workers.map((w) => {
                const isSelected = activeWorker.id === w.id;
                const colors = hardHatColors[w.preset] || hardHatColors['lime_white'];

                return `
                  <div class="crew-worker-card ${isSelected ? 'is-highlighted' : ''} ${!w.visible ? 'is-hidden-worker' : ''}" data-worker-id="${w.id}" style="display: flex; align-items: center; justify-content: space-between; background: var(--bg-card, #ffffff); border: 1px solid ${isSelected ? '#00f0ff' : 'var(--border-light, #e2e8f0)'}; border-radius: 10px; padding: 12px 16px; gap: 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); cursor: pointer;">
                    
                    <!-- Worker Avatar & Info -->
                    <div style="display: flex; align-items: center; gap: 12px; min-width: 220px; flex: 1;">
                      <div class="crew-avatar-badge" style="position: relative; width: 42px; height: 42px; border-radius: 8px; background: #0f172a; display: flex; align-items: center; justify-content: center; flex-shrink: 0; border: 2px solid ${colors.hat};">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="${colors.vest}" stroke="#f8fafc" stroke-width="1.5">
                          <circle cx="12" cy="7" r="4"/>
                          <path d="M5.5 21v-2a6.5 6.5 0 0 1 13 0v2"/>
                        </svg>
                        <span style="position: absolute; bottom: -3px; right: -3px; width: 10px; height: 10px; border-radius: 50%; background: ${w.visible ? '#10b981' : '#94a3b8'}; border: 2px solid #fff;"></span>
                      </div>

                      <div style="flex: 1;">
                        <div style="font-size: 0.88rem; font-weight: 800; color: var(--text-dark, #0f172a);">
                          ${w.name}
                        </div>
                        <div style="font-size: 0.72rem; color: var(--text-muted, #64748b);">
                          ${w.role}
                        </div>
                      </div>
                    </div>

                    <!-- Station Tag -->
                    <div style="flex: 1; min-width: 180px;">
                      <span class="crew-station-pill" style="display: inline-block; font-family: var(--font-mono, monospace); font-size: 0.68rem; font-weight: 700; background: rgba(15, 23, 42, 0.06); color: #334155; padding: 4px 8px; border-radius: 6px; border: 1px solid rgba(0,0,0,0.06);">
                        📍 ${w.station}
                      </span>
                    </div>

                    <!-- Action Buttons -->
                    <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                      <!-- Select / Inspect Dossier Button -->
                      <button class="btn-select-worker ${isSelected ? 'active-select' : ''}" data-worker-id="${w.id}" style="padding: 6px 12px; background: ${isSelected ? '#0072ce' : 'rgba(0, 114, 206, 0.08)'}; border: 1px solid rgba(0, 114, 206, 0.2); border-radius: 6px; font-size: 0.72rem; font-weight: 700; color: ${isSelected ? '#ffffff' : '#0072ce'}; cursor: pointer;">
                        ${isSelected ? 'Selected' : 'Inspect'}
                      </button>

                      <!-- Visibility Toggle Button -->
                      <button class="btn-crew-toggle-vis ${w.visible ? 'active' : ''}" data-worker-id="${w.id}" title="${w.visible ? 'Hide operator' : 'Show operator'}" style="padding: 6px 10px; background: ${w.visible ? '#10b981' : '#94a3b8'}; border: none; border-radius: 6px; color: #fff; font-size: 0.72rem; font-weight: 700; cursor: pointer; min-width: 58px;">
                        ${w.visible ? 'Visible' : 'Hidden'}
                      </button>
                    </div>

                  </div>
                `;
              }).join('')}
            </div>

          </div>

          <!-- Modal Footer -->
          <div class="modal-footer" style="display: flex; align-items: center; justify-content: space-between; padding: 14px 24px; border-top: 1px solid var(--border-light, #e2e8f0); background: var(--bg-card, #ffffff);">
            <button id="btn-reset-crew" style="padding: 6px 12px; background: transparent; border: 1px solid #cbd5e1; border-radius: 6px; color: #64748b; font-size: 0.74rem; font-weight: 700; cursor: pointer;">
              Reset to Factory Defaults
            </button>
            <button id="btn-apply-crew" style="padding: 8px 20px; background: #0072ce; border: none; border-radius: 6px; color: #ffffff; font-size: 0.80rem; font-weight: 700; cursor: pointer; box-shadow: 0 4px 12px rgba(0, 114, 206, 0.25);">
              Done &amp; Close
            </button>
          </div>

        </div>
      </div>
    `;
  }

  bindEvents() {
    if (!this.container) return;

    // Close buttons
    const btnClose = this.container.querySelector('#btn-close-crew');
    if (btnClose) btnClose.addEventListener('click', () => this.close());

    const btnApply = this.container.querySelector('#btn-apply-crew');
    if (btnApply) btnApply.addEventListener('click', () => this.close());

    const backdrop = this.container.querySelector('#crew-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) this.close();
      });
    }

    // Scale slider
    const slider = this.container.querySelector('#crew-scale-slider');
    const scaleDisplay = this.container.querySelector('#crew-scale-display');
    if (slider) {
      slider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.crew.setGlobalScale(val);
        const mm = Math.round(val * 1830);
        if (scaleDisplay) {
          scaleDisplay.textContent = `${val.toFixed(3)}x (${mm} mm)`;
        }
        this.container.querySelectorAll('.crew-preset-btn').forEach(btn => {
          const btnScale = parseFloat(btn.dataset.scale);
          btn.classList.toggle('active', Math.abs(btnScale - val) < 0.01);
        });
      });
    }

    // Scale Preset Buttons
    this.container.querySelectorAll('.crew-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = parseFloat(btn.dataset.scale);
        if (slider) slider.value = val;
        this.crew.setGlobalScale(val);
        const mm = Math.round(val * 1830);
        if (scaleDisplay) {
          scaleDisplay.textContent = `${val.toFixed(3)}x (${mm} mm)`;
        }
        this.container.querySelectorAll('.crew-preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Dossier Focus 3D Camera Button
    const btnFocus = this.container.querySelector('#btn-dossier-focus');
    if (btnFocus) {
      btnFocus.addEventListener('click', () => {
        const wid = btnFocus.dataset.workerId;
        if (this.scene && this.scene.focusOnWorker) {
          this.scene.focusOnWorker(wid);
        }
        this.close();
      });
    }

    // Dossier Follow-Cam Button
    const btnFollow = this.container.querySelector('#btn-dossier-follow');
    if (btnFollow) {
      btnFollow.addEventListener('click', () => {
        const wid = btnFollow.dataset.workerId;
        if (this.scene && this.scene.startFollowCam) {
          this.scene.startFollowCam(wid);
        }
        this.close();
      });
    }

    // Run Diagnostic Scan Button
    const btnScan = this.container.querySelector('#btn-dossier-scan');
    if (btnScan) {
      btnScan.addEventListener('click', () => {
        const wid = btnScan.dataset.workerId;
        const result = this.crew.triggerDiagnosticScan(wid);
        if (result) {
          const msgs = [
            'Optical alignment verified ±0.4mm. Laser sensor sweep complete.',
            'Telemetry calibrated. No micro-slip or vibration anomalies detected.',
            'Thermal envelope normal (45.5°C). Bearing lubrication optimal.',
            'Frame strain gauge balanced at 0.0 kg load. Zero structural deflection.'
          ];
          const chosen = msgs[Math.floor(Math.random() * msgs.length)];
          this.lastScanResults[wid] = { message: chosen, time: Date.now() };
          this.render();
          this.bindEvents();
        }
      });
    }

    // Radio Dispatch Callout Button
    const btnRadio = this.container.querySelector('#btn-dossier-radio');
    if (btnRadio) {
      btnRadio.addEventListener('click', () => {
        industrialAudio.playRadioChirp();
        const worker = this.crew.getWorkerById(this.selectedWorkerId);
        const name = worker ? worker.cfg.name : 'Operator';
        const msg = `📻 [RADIO] ${name}: All sensors nominal on station. Proceeding with routine patrol.`;
        window.dispatchEvent(new CustomEvent('radio-callout', { detail: { message: msg } }));
        alert(msg);
      });
    }

    // Name input in dossier
    const nameInput = this.container.querySelector('.dossier-name-input');
    if (nameInput) {
      nameInput.addEventListener('blur', () => {
        const wid = nameInput.dataset.workerId;
        const val = nameInput.value.trim();
        if (val) {
          this.crew.setWorkerName(wid, val);
          if (this.onCrewUpdate) this.onCrewUpdate();
        }
      });
      nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') nameInput.blur();
      });
    }

    // Select worker card from roster
    this.container.querySelectorAll('.crew-worker-card, .btn-select-worker').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.btn-crew-toggle-vis')) return; // ignore vis button
        const wid = el.dataset.workerId || el.closest('.crew-worker-card')?.dataset.workerId;
        if (wid && wid !== this.selectedWorkerId) {
          this.selectedWorkerId = wid;
          if (this.scene && this.scene.focusOnWorker) {
            this.scene.focusOnWorker(wid);
          }
          this.render();
          this.bindEvents();
        }
      });
    });

    // Visibility Toggles
    this.container.querySelectorAll('.btn-crew-toggle-vis').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const wid = btn.dataset.workerId;
        const worker = this.crew.workers.find(w => w.id === wid);
        if (worker) {
          const nextVis = !worker.root.visible;
          this.crew.setWorkerVisibility(wid, nextVis);
          this.render();
          this.bindEvents();
          if (this.onCrewUpdate) this.onCrewUpdate();
        }
      });
    });

    // Spread Workers Randomly Across Catwalks
    const btnSpread = this.container.querySelector('#btn-spread-workers');
    if (btnSpread) {
      btnSpread.addEventListener('click', () => {
        this.crew.spreadWorkersRandomly();
        this.render();
        this.bindEvents();
        if (this.onCrewUpdate) this.onCrewUpdate();
      });
    }

    // Add Operator
    const btnAdd = this.container.querySelector('#btn-add-worker');
    if (btnAdd) {
      btnAdd.addEventListener('click', () => {
        const name = prompt('Enter New Operator Name:', 'Field Technician');
        if (name && name.trim()) {
          this.crew.addNewWorker(name.trim(), 'Maintenance Operator', 'Walkway Idler Inspection');
          this.render();
          this.bindEvents();
          if (this.onCrewUpdate) this.onCrewUpdate();
        }
      });
    }

    // Reset to Defaults
    const btnReset = this.container.querySelector('#btn-reset-crew');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        if (confirm('Reset operator roster and custom names back to factory defaults?')) {
          this.crew.resetToDefaults();
          this.render();
          this.bindEvents();
          if (this.onCrewUpdate) this.onCrewUpdate();
        }
      });
    }
  }
}
