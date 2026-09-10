/**
 * High-Performance Canvas Telemetry Stream Chart
 * Renders multi-channel continuous waveforms at 60 FPS with auto-scaling grid.
 */

class TelemetryStreamChart {
  constructor(canvasId, options = {}) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');

    this.maxPoints = options.maxPoints || 120;
    this.channels = options.channels || [
      { name: 'X', color: '#f43f5e' },
      { name: 'Y', color: '#10b981' },
      { name: 'Z', color: '#38bdf8' }
    ];
    this.minY = options.minY !== undefined ? options.minY : -2.0;
    this.maxY = options.maxY !== undefined ? options.maxY : 2.0;
    this.autoScale = options.autoScale !== undefined ? options.autoScale : true;

    // Ring buffers for each channel
    this.data = this.channels.map(() => []);

    this.startRenderLoop();
  }

  push(values) {
    for (let i = 0; i < this.channels.length; i++) {
      const val = values[i] !== undefined ? values[i] : 0;
      this.data[i].push(val);
      if (this.data[i].length > this.maxPoints) {
        this.data[i].shift();
      }
    }
  }

  clear() {
    this.data = this.channels.map(() => []);
  }

  drawGrid(w, h, currentMin, currentMax) {
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    this.ctx.lineWidth = 1;

    // Horizontal grid lines
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const y = (h / steps) * i;
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(w, y);
      this.ctx.stroke();

      // Value label
      const val = currentMax - (i / steps) * (currentMax - currentMin);
      this.ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
      this.ctx.font = '9px JetBrains Mono';
      this.ctx.fillText(val.toFixed(1), 4, y - 3 > 9 ? y - 3 : 10);
    }

    // Zero line if in range
    if (currentMin < 0 && currentMax > 0) {
      const zeroY = h * (currentMax / (currentMax - currentMin));
      this.ctx.beginPath();
      this.ctx.moveTo(0, zeroY);
      this.ctx.lineTo(w, zeroY);
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      this.ctx.lineWidth = 1;
      this.ctx.setLineDash([2, 4]);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    }
  }

  render() {
    const w = this.canvas.width;
    const h = this.canvas.height;

    this.ctx.clearRect(0, 0, w, h);

    // Determine current dynamic Y range
    let currentMin = this.minY;
    let currentMax = this.maxY;

    if (this.autoScale) {
      for (const series of this.data) {
        for (const v of series) {
          if (v < currentMin) currentMin = v - 0.2;
          if (v > currentMax) currentMax = v + 0.2;
        }
      }
    }

    const rangeY = (currentMax - currentMin) || 1.0;

    this.drawGrid(w, h, currentMin, currentMax);

    // Draw lines for each channel
    for (let c = 0; c < this.channels.length; c++) {
      const series = this.data[c];
      if (series.length < 2) continue;

      const channel = this.channels[c];
      this.ctx.beginPath();
      this.ctx.strokeStyle = channel.color;
      this.ctx.lineWidth = 1.8;
      this.ctx.lineJoin = 'round';

      const stepX = w / (this.maxPoints - 1);
      const startOffset = this.maxPoints - series.length;

      for (let i = 0; i < series.length; i++) {
        const x = (startOffset + i) * stepX;
        const normalized = (series[i] - currentMin) / rangeY;
        const y = h - (normalized * h);

        if (i === 0) {
          this.ctx.moveTo(x, y);
        } else {
          this.ctx.lineTo(x, y);
        }
      }
      this.ctx.stroke();
    }
  }

  startRenderLoop() {
    const loop = () => {
      this.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
