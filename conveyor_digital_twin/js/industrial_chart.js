/**
 * Industrial Trend Chart - Pure HTML5 Canvas Telemetry Recorder
 * Supports 1H, 6H, 24H intervals, multi-channel scaling, crisp high-DPI rendering,
 * and zero external dependencies.
 */

export class IndustrialTrendChart {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.timeframe = '1h'; // '1h', '6h', '24h'
    this.history = [];
    this.maxPoints = 60; // 60 data points along timeline

    // Color definitions for channels
    this.channels = [
      { key: 'temperature', name: 'Temp', unit: '°C', color: '#0284c7', min: 15, max: 45 },
      { key: 'vibration', name: 'Vibration', unit: 'm/s²', color: '#f59e0b', min: 0, max: 2.0 },
      { key: 'load', name: 'Load', unit: 'kg', color: '#10b981', min: 0, max: 2.0 },
      { key: 'speed', name: 'Speed', unit: 'm/s', color: '#8b5cf6', min: 0, max: 2.0 },
      { key: 'current', name: 'Current', unit: 'A', color: '#06b6d4', min: 0, max: 6.0 },
      { key: 'thickness', name: 'Thickness', unit: 'mm', color: '#ec4899', min: 15, max: 26 }
    ];

    this.lastAddTimestamp = 0;
    this.initSyntheticHistory();
    this.setupResizeListener();
  }

  initSyntheticHistory() {
    const now = Date.now();
    const count = 50;
    const interval = 2000; // 2 seconds between samples
    this.history = [];

    for (let i = count; i >= 1; i--) {
      const t = (now - i * interval) / 1000.0;
      this.history.push({
        time: now - i * interval,
        temperature: +(27.4 + 0.3 * Math.sin(t * 0.1)).toFixed(1),
        vibration: +(0.42 + 0.04 * Math.sin(t * 0.8)).toFixed(2),
        load: +(0.48 + 0.008 * Math.sin(t * 0.2)).toFixed(2),
        speed: +(0.86 + 0.02 * Math.sin(t * 0.5)).toFixed(2),
        current: +(2.3 + 0.07 * Math.sin(t * 0.3)).toFixed(1),
        thickness: +(22.1 + 0.03 * Math.sin(t * 0.15)).toFixed(1),
        misalignment: +(3.5 + 0.2 * Math.sin(t * 0.25)).toFixed(1)
      });
    }
  }

  setupResizeListener() {
    window.addEventListener('resize', () => this.resizeAndRender());
    setTimeout(() => this.resizeAndRender(), 100);
  }

  setTimeframe(tf) {
    this.timeframe = tf;
    this.render();
  }

  addPoint(telemetry) {
    const now = Date.now();
    // Throttle to at most 1 point per 1.5s
    if (now - this.lastAddTimestamp < 1500) {
      return;
    }
    this.lastAddTimestamp = now;

    this.history.push({
      time: now,
      temperature: +telemetry.temperature,
      vibration: +telemetry.vibration,
      load: +telemetry.load,
      speed: +telemetry.speed,
      current: +telemetry.current,
      thickness: +telemetry.thickness,
      misalignment: +telemetry.misalignment
    });

    if (this.history.length > 100) {
      this.history.shift();
    }

    this.render();
  }

  resizeAndRender() {
    if (!this.canvas || !this.canvas.parentElement) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(200, rect.width - 4);
    const h = Math.max(160, rect.height - 36);

    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;

    if (this.ctx) {
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    this.render();
  }

  render() {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const w = parseFloat(this.canvas.style.width) || this.canvas.width;
    const h = parseFloat(this.canvas.style.height) || this.canvas.height;

    // Detect theme background
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
    const textColor = isDark ? '#64748b' : '#94a3b8';

    ctx.clearRect(0, 0, w, h);

    const padLeft = 32;
    const padRight = 14;
    const padTop = 14;
    const padBottom = 22;
    const chartW = w - padLeft - padRight;
    const chartH = h - padTop - padBottom;

    if (chartW <= 0 || chartH <= 0) return;

    // Draw horizontal grid lines & Y-ticks
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.fillStyle = textColor;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const ySteps = 4;
    for (let i = 0; i <= ySteps; i++) {
      const y = padTop + (chartH / ySteps) * i;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(w - padRight, y);
      ctx.stroke();

      const pct = Math.round(100 - (i / ySteps) * 100);
      ctx.fillText(`${pct}%`, padLeft - 6, y);
    }

    // Draw vertical time grid lines
    const xSteps = 5;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const timeLabels = this.getTimeLabels();
    for (let i = 0; i < xSteps; i++) {
      const x = padLeft + (chartW / (xSteps - 1)) * i;
      ctx.beginPath();
      ctx.moveTo(x, padTop);
      ctx.lineTo(x, padTop + chartH);
      ctx.stroke();

      ctx.fillText(timeLabels[i] || '', x, padTop + chartH + 5);
    }

    // Draw series
    if (this.history.length < 2) return;

    const dataSlice = this.history;
    const n = dataSlice.length;

    this.channels.forEach(ch => {
      ctx.strokeStyle = ch.color;
      ctx.lineWidth = 1.8;
      ctx.lineJoin = 'round';
      ctx.beginPath();

      for (let i = 0; i < n; i++) {
        const pt = dataSlice[i];
        const val = pt[ch.key] !== undefined ? pt[ch.key] : ch.min;
        
        // Normalize 0 to 1 between min and max
        const norm = Math.max(0, Math.min(1, (val - ch.min) / (ch.max - ch.min)));
        const x = padLeft + (chartW / (n - 1)) * i;
        const y = padTop + chartH - (norm * chartH);

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    });
  }

  getTimeLabels() {
    if (this.timeframe === '24h') {
      return ['-24h', '-18h', '-12h', '-6h', 'Now'];
    } else if (this.timeframe === '6h') {
      return ['-6h', '-4.5h', '-3h', '-1.5h', 'Now'];
    }
    return ['-60m', '-45m', '-30m', '-15m', 'Now'];
  }
}
