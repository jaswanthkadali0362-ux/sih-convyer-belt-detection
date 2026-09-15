/**
 * beltXence Interactive Rupture & Incident Simulator
 * Allows operators and reliability engineers to stress-test the conveyor system,
 * simulate physical belt gouges/rips, coal overload surges, and emergency pull-cord stops.
 */

export class RuptureSimulator {
  constructor(conveyorScene, depthVision, soundEngine = null) {
    this.scene = conveyorScene;
    this.depthVision = depthVision;
    this.sound = soundEngine;
    this.container = null;
    this.isOpen = false;
    this.activeScenario = null; // null | 'tear' | 'overload' | 'estop'

    this.initContainer();
  }

  initContainer() {
    this.container = document.getElementById('simulator-modal-root');
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'simulator-modal-root';
      this.container.className = 'analytics-modal-root';
      document.body.appendChild(this.container);
    }
  }

  open() {
    this.isOpen = true;
    this.render();
    if (this.sound) this.sound.playClick();
  }

  close() {
    this.isOpen = false;
    if (this.container) {
      this.container.innerHTML = '';
      this.container.classList.remove('active');
    }
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  render() {
    if (!this.container) return;
    this.container.classList.add('active');

    this.container.innerHTML = `
      <div class="analytics-modal-backdrop" id="sim-backdrop">
        <div class="analytics-modal-dialog sim-dialog" role="dialog" aria-modal="true" style="max-width: 860px;">
          
          <!-- Modal Header -->
          <div class="modal-header">
            <div class="modal-title-group">
              <div class="modal-tag" style="color: #ff1744;">STRESS TEST &amp; INCIDENT SANDBOX</div>
              <h2>Digital Twin AI Rupture &amp; Fault Simulator</h2>
              <p class="modal-subtitle">Inject real-time physical anomalies, overload conditions, and emergency shutdown sequences</p>
            </div>
            <button id="btn-close-sim" class="modal-close-btn">&times;</button>
          </div>

          <!-- Modal Body -->
          <div class="modal-body-scroll" style="gap: 16px;">

            <!-- Scenario Cards Grid -->
            <div class="sim-scenarios-grid">
              
              <!-- Scenario 1: Belt Tear / Rip -->
              <div class="sim-card ${this.activeScenario === 'tear' ? 'active-sim' : ''}" id="card-sim-tear">
                <div class="sim-card-icon" style="background: rgba(239, 68, 68, 0.15); border-color: rgba(239, 68, 68, 0.35); color: #ff1744;">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                </div>
                <div class="sim-card-body">
                  <div class="sim-card-title">1. Longitudinal Tear / Gouge</div>
                  <p class="sim-card-desc">Injects a deep physical carcass puncture. Keyence optical laser locks on, AI reticle tracks defect, and rupture risk spikes to 88.5%.</p>
                  <button class="sim-action-btn btn-tear" id="btn-run-tear">
                    ${this.activeScenario === 'tear' ? 'ACTIVE INCIDENT (RE-TRIGGER)' : 'TRIGGER BELT TEAR'}
                  </button>
                </div>
              </div>

              <!-- Scenario 2: Coal Overload -->
              <div class="sim-card ${this.activeScenario === 'overload' ? 'active-sim' : ''}" id="card-sim-overload">
                <div class="sim-card-icon" style="background: rgba(245, 158, 11, 0.15); border-color: rgba(245, 158, 11, 0.35); color: #f59e0b;">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                </div>
                <div class="sim-card-body">
                  <div class="sim-card-title">2. Ore Surge &amp; Weigh Overload</div>
                  <p class="sim-card-desc">Triples coal boulder transport rate. Load cell spikes to 68 kg (>55 kg critical threshold), causing sag and motor current surge.</p>
                  <button class="sim-action-btn btn-overload" id="btn-run-overload">
                    ${this.activeScenario === 'overload' ? 'ACTIVE SURGE (RE-TRIGGER)' : 'TRIGGER BULK OVERLOAD'}
                  </button>
                </div>
              </div>

              <!-- Scenario 3: Emergency E-Stop Pull-Cord -->
              <div class="sim-card ${this.activeScenario === 'estop' ? 'active-sim' : ''}" id="card-sim-estop">
                <div class="sim-card-icon" style="background: rgba(14, 165, 233, 0.15); border-color: rgba(14, 165, 233, 0.35); color: #00f0ff;">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><rect x="9" y="9" width="6" height="6"/></svg>
                </div>
                <div class="sim-card-body">
                  <div class="sim-card-title">3. Emergency E-Stop Pull-Cord</div>
                  <p class="sim-card-desc">Simulates catwalk safety cord activation by maintenance crew. Kinematic instant deceleration, brake sparks, and lockout alert.</p>
                  <button class="sim-action-btn btn-estop" id="btn-run-estop">
                    ${this.activeScenario === 'estop' ? 'E-STOPPED (RE-ENGAGE)' : 'TRIGGER E-STOP PULL'}
                  </button>
                </div>
              </div>

            </div>

            <!-- Live Telemetry Impact Monitor Strip -->
            <div class="sim-impact-strip">
              <div class="sim-impact-kpi">
                <span class="sim-label">ACTIVE STATUS:</span>
                <strong id="sim-status-label" style="color: ${this.activeScenario ? '#ff1744' : '#10b981'};">
                  ${this.activeScenario ? `SIMULATING: ${this.activeScenario.toUpperCase()}` : 'NOMINAL 99.8% HEALTHY'}
                </strong>
              </div>
              <div class="sim-impact-kpi">
                <span class="sim-label">RUPTURE RISK:</span>
                <strong id="sim-risk-label" style="color: ${this.activeScenario === 'tear' ? '#ff1744' : '#10b981'};">
                  ${this.activeScenario === 'tear' ? '88.50% [CRITICAL]' : '0.04% [NOMINAL]'}
                </strong>
              </div>
              <div class="sim-impact-kpi">
                <span class="sim-label">LOAD CELL:</span>
                <strong id="sim-load-label" style="color: ${this.activeScenario === 'overload' ? '#ff1744' : '#00f0ff'};">
                  ${this.activeScenario === 'overload' ? '68.4 kg [ALARM]' : '28.5 kg [OPTIMAL]'}
                </strong>
              </div>
            </div>

          </div>

          <!-- Modal Footer -->
          <div class="modal-footer" style="justify-content: space-between;">
            <button id="btn-sim-reset" class="btn-secondary-action" style="color: #10b981; border-color: rgba(16, 185, 129, 0.3);">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 6px;"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
              RESET TO NOMINAL (CLEAR FAULTS)
            </button>
            <button id="btn-sim-close" class="btn-primary-action">Close Sandbox</button>
          </div>

        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    // Backdrop close
    const backdrop = this.container.querySelector('#sim-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) this.close();
      });
    }

    const closeBtn = this.container.querySelector('#btn-close-sim');
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());

    const closeFooter = this.container.querySelector('#btn-sim-close');
    if (closeFooter) closeFooter.addEventListener('click', () => this.close());

    // Scenario buttons
    const btnTear = this.container.querySelector('#btn-run-tear');
    if (btnTear) btnTear.addEventListener('click', () => this.triggerTearScenario());

    const btnOverload = this.container.querySelector('#btn-run-overload');
    if (btnOverload) btnOverload.addEventListener('click', () => this.triggerOverloadScenario());

    const btnEstop = this.container.querySelector('#btn-run-estop');
    if (btnEstop) btnEstop.addEventListener('click', () => this.triggerEstopScenario());

    const btnReset = this.container.querySelector('#btn-sim-reset');
    if (btnReset) btnReset.addEventListener('click', () => this.resetNominal());
  }

  triggerTearScenario() {
    this.activeScenario = 'tear';
    if (this.sound) {
      this.sound.playAlarm();
    }

    // 1. Tell 3D scene to display visual rip & defect bracket
    if (this.scene && this.scene.triggerSimulatedGouge) {
      this.scene.triggerSimulatedGouge(true);
    }

    // 2. Tell vision system to lock defect tracking reticle & bump rupture risk
    if (this.depthVision) {
      this.depthVision.ruptureRisk = 0.885; // 88.5%
      this.depthVision.damageCount = 1;
      this.depthVision.anomalyDepthMm = 7.85;
      this.depthVision.trackedBox = {
        x: 0.50, y: 0.52, w: 0.45, h: 0.32,
        conf: 0.986, tag: 'CRITICAL // LONGITUDINAL TEAR RISK'
      };
      const riskEl = document.getElementById('ai-rupture-risk-val');
      if (riskEl) {
        riskEl.textContent = '88.50%';
        riskEl.style.color = '#ef4444';
      }
      const riskBar = document.getElementById('ai-rupture-risk-bar');
      if (riskBar) {
        riskBar.style.width = '88.5%';
        riskBar.style.background = 'linear-gradient(90deg, #ef4444, #ff1744)';
      }
    }

    this.render();
  }

  triggerOverloadScenario() {
    this.activeScenario = 'overload';
    if (this.sound) {
      this.sound.playLaserPing();
    }

    // 1. Boost coal stream in 3D scene
    if (this.scene && this.scene.coalStream) {
      this.scene.coalStream.rocks.forEach(r => {
        r.mesh.scale.set(1.8, 1.8, 1.8);
      });
    }

    // 2. Bump load sensor telemetry
    if (this.depthVision) {
      this.depthVision.liveLoad = 68.4;
      this.depthVision.liveMotorCurrent = 38.6;
    }

    this.render();
  }

  triggerEstopScenario() {
    this.activeScenario = 'estop';
    if (this.sound) {
      this.sound.playBrakeSparks();
    }

    // 1. Decelerate / stop 3D conveyor
    if (this.scene) {
      this.scene.setBeltSpeed(0.0);
    }

    // 2. Update status labels
    const statusLabel = document.getElementById('ai-cam-status-label');
    if (statusLabel) {
      statusLabel.textContent = 'E-STOPPED (PULL-CORD)';
      statusLabel.style.color = '#ef4444';
    }

    this.render();
  }

  resetNominal() {
    this.activeScenario = null;
    if (this.sound) {
      this.sound.playClick();
    }

    // 1. Reset 3D scene
    if (this.scene) {
      if (this.scene.triggerSimulatedGouge) {
        this.scene.triggerSimulatedGouge(false);
      }
      this.scene.setBeltSpeed(2.96);
      if (this.scene.coalStream) {
        this.scene.coalStream.rocks.forEach(r => {
          r.mesh.scale.set(1.0, 1.0, 1.0);
        });
      }
    }

    // 2. Reset vision engine
    if (this.depthVision) {
      this.depthVision.ruptureRisk = 0.0004;
      this.depthVision.damageCount = 0;
      this.depthVision.anomalyDepthMm = 0;
      this.depthVision.trackedBox = {
        x: 0.50, y: 0.52, w: 0.38, h: 0.26,
        conf: 0.992, tag: 'NOMINAL BELT COVER'
      };
      const riskEl = document.getElementById('ai-rupture-risk-val');
      if (riskEl) {
        riskEl.textContent = '0.04%';
        riskEl.style.color = '#059669';
      }
      const riskBar = document.getElementById('ai-rupture-risk-bar');
      if (riskBar) {
        riskBar.style.width = '0.04%';
        riskBar.style.background = '#10b981';
      }
    }

    const statusLabel = document.getElementById('ai-cam-status-label');
    if (statusLabel) {
      statusLabel.textContent = 'VIRTUAL CAM LIVE';
      statusLabel.style.color = '#00f0ff';
    }

    this.render();
  }
}
