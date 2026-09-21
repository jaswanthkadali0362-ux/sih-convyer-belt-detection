/**
 * beltXence Timeline Scrubber
 * Interactive Day-by-Day Historical Playback & Wear Progression Controller
 */

export class TimelineScrubber {
  constructor(containerEl, callbacks = {}) {
    this.container = containerEl;
    this.callbacks = callbacks; // { onDaySelect, onPlayStateChange, onReturnToLive, onOpenAnalytics }

    this.historyData = null;
    this.currentDayIndex = 6; // 6 = Today (Live)
    this.isPlaying = false;
    this.playbackSpeed = 1.0; // 1x, 2x, 4x
    this.playTimer = null;
    this.isLive = true;

    this.init();
  }

  async init() {
    await this.loadHistory();
    this.render();
    this.bindEvents();
  }

  async loadHistory() {
    try {
      const res = await fetch('/api/telemetry/history');
      if (res.ok) {
        this.historyData = await res.json();
      }
    } catch (e) {
      console.warn('[TimelineScrubber] Failed to load history API, using fallback data', e);
      this.historyData = this.getFallbackData();
    }
  }

  getFallbackData() {
    return {
      total_days: 7,
      num_joints: 2,
      summary: {
        cumulative_load: 0.48,
        cumulative_tonnage: 0.48,
        total_wear_loss_mm: 0.14,
        current_thickness_mm: 22.81,
        replacement_threshold_mm: 10.0,
        wear_rate_mm_day: 0.002,
        projected_days_remaining: 1250,
        active_alarms: 0,
        num_joints: 2
      },
      days: [
        { day_index: 0, date_str: "Monday, Sep 08", relative_label: "Day -6", load_kg: 0.06, tonnage_tons: 0.06, thickness_st01: 22.95, misalignment_st01: 2.10, misalignment_st02: 3.20, status: "normal" },
        { day_index: 1, date_str: "Tuesday, Sep 09", relative_label: "Day -5", load_kg: 0.07, tonnage_tons: 0.07, thickness_st01: 22.92, misalignment_st01: 2.30, misalignment_st02: 3.50, status: "normal" },
        { day_index: 2, date_str: "Wednesday, Sep 10", relative_label: "Day -4", load_kg: 0.05, tonnage_tons: 0.05, thickness_st01: 22.90, misalignment_st01: 2.50, misalignment_st02: 3.80, status: "normal" },
        { day_index: 3, date_str: "Thursday, Sep 11", relative_label: "Day -3", load_kg: 0.08, tonnage_tons: 0.08, thickness_st01: 22.88, misalignment_st01: 2.70, misalignment_st02: 4.10, status: "normal" },
        { day_index: 4, date_str: "Friday, Sep 12", relative_label: "Day -2", load_kg: 0.06, tonnage_tons: 0.06, thickness_st01: 22.85, misalignment_st01: 2.90, misalignment_st02: 4.30, status: "normal" },
        { day_index: 5, date_str: "Saturday, Sep 13", relative_label: "Yesterday", load_kg: 0.07, tonnage_tons: 0.07, thickness_st01: 22.83, misalignment_st01: 3.10, misalignment_st02: 4.60, status: "normal" },
        { day_index: 6, date_str: "Sunday, Sep 14", relative_label: "Today (Live)", load_kg: 0.09, tonnage_tons: 0.09, thickness_st01: 22.81, misalignment_st01: 2.80, misalignment_st02: 4.30, status: "normal" }
      ]
    };
  }

  getFallbackHistory() {
    return this.getFallbackData();
  }

  render() {
    if (!this.container || !this.historyData) return;

    const days = this.historyData.days;

    this.container.innerHTML = `
      <div class="timeline-bar-inner">
        <!-- Left Transport Controls -->
        <div class="timeline-transport-group">
          <button id="btn-timeline-play" class="timeline-ctrl-btn" title="Replay wear progression over 7 days">
            <svg class="play-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            <span id="btn-timeline-play-text">Play Replay</span>
          </button>
          
          <button id="btn-timeline-speed" class="timeline-speed-pill" title="Cycle playback speed">1x</button>
          
          <button id="btn-timeline-live" class="timeline-live-btn ${this.isLive ? 'active-live' : ''}" title="Jump to Real-time Telemetry">
            <span class="live-dot-pulse"></span>
            <span>LIVE</span>
          </button>
        </div>

        <!-- Center Stepper Track & Day Chips -->
        <div class="timeline-track-wrapper">
          <div class="timeline-slider-track">
            <div class="timeline-track-line"></div>
            <div id="timeline-progress-fill" class="timeline-track-progress" style="width: 100%;"></div>
          </div>

          <div class="timeline-days-container">
            ${days.map((d, i) => {
              const isSelected = (i === this.currentDayIndex);
              const statusClass = d.status || 'normal';
              const loadVal = (d.load_kg !== undefined ? d.load_kg : (d.tonnage_tons !== undefined ? d.tonnage_tons : 0.07));
              return `
                <button class="day-step-node ${isSelected ? 'selected' : ''} status-${statusClass}" data-day-index="${i}" title="${d.date_str} - Load: ${loadVal.toFixed(2)} KG">
                  <div class="step-dot"></div>
                  <div class="step-label-box">
                    <span class="step-rel-label">${d.relative_label}</span>
                    <span class="step-date-sub">${d.date_str.split(',')[0]}</span>
                  </div>
                </button>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Right Mode Status & Analytics Action -->
        <div class="timeline-right-actions">
          <div class="timeline-status-badge ${this.isLive ? 'badge-live' : 'badge-archive'}">
            <span class="status-mode-dot" style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${this.isLive ? '#10b981' : '#94a3b8'};"></span>
            <span id="timeline-mode-text">${this.isLive ? 'LIVE 20Hz MONITOR' : `ARCHIVE: ${days[this.currentDayIndex]?.relative_label}`}</span>
          </div>

          <button id="btn-open-analytics" class="timeline-analytics-btn" title="Open 7-Day Wear & Rupture Analytics">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            <span>7-Day Analytics</span>
          </button>
        </div>
      </div>
    `;

    this.updateProgressFill();
  }

  bindEvents() {
    // Day nodes click
    this.container.querySelectorAll('.day-step-node').forEach(node => {
      node.addEventListener('click', () => {
        const idx = parseInt(node.dataset.dayIndex, 10);
        this.selectDay(idx);
      });
    });

    // Play / Pause Replay
    const playBtn = this.container.querySelector('#btn-timeline-play');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        this.togglePlayback();
      });
    }

    // Speed toggle
    const speedBtn = this.container.querySelector('#btn-timeline-speed');
    if (speedBtn) {
      speedBtn.addEventListener('click', () => {
        if (this.playbackSpeed === 1.0) this.playbackSpeed = 2.0;
        else if (this.playbackSpeed === 2.0) this.playbackSpeed = 4.0;
        else this.playbackSpeed = 1.0;
        speedBtn.textContent = `${this.playbackSpeed}x`;
      });
    }

    // Return to Live
    const liveBtn = this.container.querySelector('#btn-timeline-live');
    if (liveBtn) {
      liveBtn.addEventListener('click', () => {
        this.selectDay(6); // 6 is Today / Live
      });
    }

    // Open Daily Analytics Modal
    const analyticsBtn = this.container.querySelector('#btn-open-analytics');
    if (analyticsBtn) {
      analyticsBtn.addEventListener('click', () => {
        if (this.callbacks.onOpenAnalytics) {
          this.callbacks.onOpenAnalytics(this.historyData);
        }
      });
    }
  }

  async selectDay(idx) {
    idx = Math.max(0, Math.min(6, idx));
    this.currentDayIndex = idx;
    this.isLive = (idx === 6);

    // Update active UI classes
    this.container.querySelectorAll('.day-step-node').forEach((node, i) => {
      node.classList.toggle('selected', i === idx);
    });

    const liveBtn = this.container.querySelector('#btn-timeline-live');
    if (liveBtn) {
      liveBtn.classList.toggle('active-live', this.isLive);
    }

    const badge = this.container.querySelector('.timeline-status-badge');
    const modeText = this.container.querySelector('#timeline-mode-text');
    if (badge && modeText) {
      const dot = badge.querySelector('.status-mode-dot');
      if (this.isLive) {
        badge.className = 'timeline-status-badge badge-live';
        if (dot) { dot.style.background = '#00f0ff'; dot.style.boxShadow = '0 0 6px #00f0ff'; }
        modeText.textContent = 'LIVE 20Hz MONITOR';
      } else {
        badge.className = 'timeline-status-badge badge-archive';
        if (dot) { dot.style.background = '#94a3b8'; dot.style.boxShadow = 'none'; }
        const d = this.historyData?.days[idx];
        modeText.textContent = `ARCHIVE: ${d?.relative_label} (${d?.date_str.split(',')[0]})`;
      }
    }

    this.updateProgressFill();

    // Fetch full snapshot for that day
    try {
      const res = await fetch(`/api/telemetry/day?day=${idx}`);
      if (res.ok) {
        const snapshot = await res.json();
        if (this.callbacks.onDaySelect) {
          this.callbacks.onDaySelect(idx, snapshot, this.isLive);
        }
      }
    } catch (e) {
      console.error('[TimelineScrubber] Failed to fetch day snapshot:', e);
    }
  }

  updateProgressFill() {
    const fill = this.container.querySelector('#timeline-progress-fill');
    if (fill) {
      const pct = (this.currentDayIndex / 6) * 100;
      fill.style.width = `${pct}%`;
    }
  }

  togglePlayback() {
    if (this.isPlaying) {
      this.pausePlayback();
    } else {
      this.startPlayback();
    }
  }

  startPlayback() {
    this.isPlaying = true;
    const playBtn = this.container.querySelector('#btn-timeline-play');
    if (playBtn) {
      playBtn.classList.add('playing');
      playBtn.innerHTML = `
        <svg class="play-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
        <span id="btn-timeline-play-text">Pause</span>
      `;
    }

    // If currently at today, loop from day 0
    if (this.currentDayIndex >= 6) {
      this.selectDay(0);
    }

    const stepInterval = 1500 / this.playbackSpeed;
    this.playTimer = setInterval(() => {
      let nextDay = this.currentDayIndex + 1;
      if (nextDay > 6) {
        this.pausePlayback();
        this.selectDay(6); // Resume live
        return;
      }
      this.selectDay(nextDay);
    }, stepInterval);

    if (this.callbacks.onPlayStateChange) {
      this.callbacks.onPlayStateChange(true);
    }
  }

  pausePlayback() {
    this.isPlaying = false;
    if (this.playTimer) {
      clearInterval(this.playTimer);
      this.playTimer = null;
    }
    const playBtn = this.container.querySelector('#btn-timeline-play');
    if (playBtn) {
      playBtn.classList.remove('playing');
      playBtn.innerHTML = `
        <svg class="play-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        <span id="btn-timeline-play-text">Play Replay</span>
      `;
    }

    if (this.callbacks.onPlayStateChange) {
      this.callbacks.onPlayStateChange(false);
    }
  }
}
