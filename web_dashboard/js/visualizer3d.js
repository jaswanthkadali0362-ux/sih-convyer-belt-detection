/**
 * 3D IMU & ESP32 Board Orientation Visualizer
 * High-performance 3D perspective projection engine with depth-sorted polygons,
 * realistic PCB shading, component geometry, and attitude horizon gauge integration.
 */

class BoardVisualizer3D {
  constructor(canvasId, options = {}) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    
    this.themeColor = options.themeColor || '#00f0ff';
    this.boardName = options.boardName || 'ESP32 IMU';
    
    // Euler angles in degrees
    this.targetPitch = 0;
    this.targetRoll = 0;
    this.targetYaw = 0;
    
    this.pitch = 0;
    this.roll = 0;
    this.yaw = 0;
    
    // Tare offsets
    this.offsetPitch = 0;
    this.offsetRoll = 0;
    this.offsetYaw = 0;

    // View camera angles (interactive mouse orbit)
    this.camRotX = 25 * Math.PI / 180;
    this.camRotY = -35 * Math.PI / 180;
    this.camZoom = 1.0;

    this.isDragging = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;

    this.setupInteractions();
    this.initGeometry();
    this.startRenderLoop();
  }

  setupInteractions() {
    this.canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;
      this.camRotY += dx * 0.01;
      this.camRotX += dy * 0.01;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.camZoom += (e.deltaY > 0 ? -0.05 : 0.05);
      this.camZoom = Math.max(0.6, Math.min(1.8, this.camZoom));
    });
  }

  resetView() {
    this.camRotX = 25 * Math.PI / 180;
    this.camRotY = -35 * Math.PI / 180;
    this.camZoom = 1.0;
  }

  tare() {
    this.offsetPitch = this.targetPitch;
    this.offsetRoll = this.targetRoll;
    this.offsetYaw = this.targetYaw;
  }

  updateOrientation(pitchDeg, rollDeg, yawDeg) {
    this.targetPitch = pitchDeg - this.offsetPitch;
    this.targetRoll = rollDeg - this.offsetRoll;
    this.targetYaw = yawDeg - this.offsetYaw;
  }

  initGeometry() {
    // PCB dimensions (in mm/units)
    const pcbW = 100; // X
    const pcbL = 160; // Y
    const pcbH = 6;   // Z

    // Cube generator helper
    const makeBox = (w, l, h, ox, oy, oz, baseColor) => {
      const hw = w / 2, hl = l / 2, hh = h / 2;
      const vertices = [
        [-hw + ox, -hl + oy, -hh + oz],
        [ hw + ox, -hl + oy, -hh + oz],
        [ hw + ox,  hl + oy, -hh + oz],
        [-hw + ox,  hl + oy, -hh + oz],
        [-hw + ox, -hl + oy,  hh + oz],
        [ hw + ox, -hl + oy,  hh + oz],
        [ hw + ox,  hl + oy,  hh + oz],
        [-hw + ox,  hl + oy,  hh + oz],
      ];
      const faces = [
        { v: [0, 1, 2, 3], normal: [ 0,  0, -1], color: baseColor, darkFactor: 0.6 }, // Bottom
        { v: [4, 7, 6, 5], normal: [ 0,  0,  1], color: baseColor, darkFactor: 1.0 }, // Top
        { v: [0, 4, 5, 1], normal: [ 0, -1,  0], color: baseColor, darkFactor: 0.8 }, // Front
        { v: [2, 6, 7, 3], normal: [ 0,  1,  0], color: baseColor, darkFactor: 0.75 }, // Back
        { v: [0, 3, 7, 4], normal: [-1,  0,  0], color: baseColor, darkFactor: 0.7 }, // Left
        { v: [1, 5, 6, 2], normal: [ 1,  0,  0], color: baseColor, darkFactor: 0.85 }, // Right
      ];
      return { vertices, faces };
    };

    this.models = [];

    // 1. ESP32 Main PCB (Matte Charcoal / Deep Navy)
    this.models.push(makeBox(pcbW, pcbL, pcbH, 0, 0, 0, '#131b2e'));

    // 2. ESP-WROOM-32 Metal RF Shield
    this.models.push(makeBox(70, 70, 7, 0, -35, pcbH / 2 + 3.5, '#94a3b8'));

    // 3. MPU-6050 Breakout Module (Blue/Violet PCB on top)
    this.models.push(makeBox(60, 50, 5, 0, 40, pcbH / 2 + 2.5, '#1e293b'));

    // 4. MPU-6050 IC Chip (Black QFN package in center of module)
    this.models.push(makeBox(22, 22, 4, 0, 40, pcbH / 2 + 7, '#0f172a'));

    // 5. Pin Headers (Left and Right)
    this.models.push(makeBox(8, pcbL - 20, 16, -pcbW / 2 + 6, 0, pcbH / 2 + 8, '#334155'));
    this.models.push(makeBox(8, pcbL - 20, 16,  pcbW / 2 - 6, 0, pcbH / 2 + 8, '#334155'));
  }

  // Multiply 3D vector by 3x3 rotation matrix
  rotateVector(v, m) {
    return [
      v[0] * m[0][0] + v[1] * m[0][1] + v[2] * m[0][2],
      v[0] * m[1][0] + v[1] * m[1][1] + v[2] * m[1][2],
      v[0] * m[2][0] + v[2] * m[2][1] + v[2] * m[2][2]
    ];
  }

  // Create combined rotation matrix: IMU Orientation followed by Camera View
  getRotationMatrix(pitchDeg, rollDeg, yawDeg) {
    const p = pitchDeg * Math.PI / 180;
    const r = rollDeg  * Math.PI / 180;
    const y = yawDeg   * Math.PI / 180;

    // Roll (rotation around Y or X depending on sensor frame)
    const cosR = Math.cos(r), sinR = Math.sin(r);
    const cosP = Math.cos(p), sinP = Math.sin(p);
    const cosY = Math.cos(y), sinY = Math.sin(y);

    // IMU rotation matrix (Z-Y-X Tait-Bryan angles)
    const r11 = cosY * cosP;
    const r12 = cosY * sinP * sinR - sinY * cosR;
    const r13 = cosY * sinP * cosR + sinY * sinR;

    const r21 = sinY * cosP;
    const r22 = sinY * sinP * sinR + cosY * cosR;
    const r23 = sinY * sinP * cosR - cosY * sinR;

    const r31 = -sinP;
    const r32 = cosP * sinR;
    const r33 = cosP * cosR;

    // Camera view orbit rotation (X then Y)
    const cx = Math.cos(this.camRotX), sx = Math.sin(this.camRotX);
    const cy = Math.cos(this.camRotY), sy = Math.sin(this.camRotY);

    const c11 = cy,       c12 = 0,   c13 = -sy;
    const c21 = -sx * sy, c22 = cx,  c23 = -sx * cy;
    const c31 = cx * sy,  c32 = sx,  c33 = cx * cy;

    // Multiply: C * R
    return [
      [
        c11 * r11 + c12 * r21 + c13 * r31,
        c11 * r12 + c12 * r22 + c13 * r32,
        c11 * r13 + c12 * r23 + c13 * r33
      ],
      [
        c21 * r11 + c22 * r21 + c23 * r31,
        c21 * r12 + c22 * r22 + c23 * r32,
        c21 * r13 + c22 * r23 + c23 * r33
      ],
      [
        c31 * r11 + c32 * r21 + c33 * r31,
        c31 * r12 + c32 * r22 + c33 * r32,
        c31 * r13 + c32 * r23 + c33 * r33
      ]
    ];
  }

  // Adjust color brightness
  shadeColor(color, factor) {
    if (color.startsWith('#')) {
      let r = parseInt(color.slice(1, 3), 16);
      let g = parseInt(color.slice(3, 5), 16);
      let b = parseInt(color.slice(5, 7), 16);
      r = Math.min(255, Math.max(0, Math.round(r * factor)));
      g = Math.min(255, Math.max(0, Math.round(g * factor)));
      b = Math.min(255, Math.max(0, Math.round(b * factor)));
      return `rgb(${r},${g},${b})`;
    }
    return color;
  }

  project(v, rotM, cx, cy, fov) {
    // Transform point
    const x = v[0] * rotM[0][0] + v[1] * rotM[0][1] + v[2] * rotM[0][2];
    const y = v[0] * rotM[1][0] + v[1] * rotM[1][1] + v[2] * rotM[1][2];
    const z = v[0] * rotM[2][0] + v[1] * rotM[2][1] + v[2] * rotM[2][2];

    const dist = 480;
    const scale = (fov * this.camZoom) / (dist + z);
    return {
      x: cx + x * scale,
      y: cy - y * scale,
      z: z
    };
  }

  drawAxes(rotM, cx, cy, fov) {
    const axisLen = 65;
    const origin = this.project([0, 0, 0], rotM, cx, cy, fov);
    const pX = this.project([axisLen, 0, 0], rotM, cx, cy, fov);
    const pY = this.project([0, axisLen, 0], rotM, cx, cy, fov);
    const pZ = this.project([0, 0, axisLen], rotM, cx, cy, fov);

    const drawLine = (pTo, color, label) => {
      this.ctx.beginPath();
      this.ctx.moveTo(origin.x, origin.y);
      this.ctx.lineTo(pTo.x, pTo.y);
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = 2.5;
      this.ctx.stroke();

      // Label
      this.ctx.fillStyle = color;
      this.ctx.font = 'bold 10px JetBrains Mono';
      this.ctx.fillText(label, pTo.x + 4, pTo.y + 3);
    };

    drawLine(pX, '#f43f5e', '+X (Roll)');
    drawLine(pY, '#10b981', '+Y (Pitch)');
    drawLine(pZ, '#38bdf8', '+Z (Yaw)');
  }

  drawGrid(cx, cy) {
    // Subtle background reference ring
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, 100 * this.camZoom, 0, Math.PI * 2);
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([4, 4]);
    this.ctx.stroke();
    this.ctx.restore();
  }

  render() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const fov = 420;

    // Smooth angle interpolation
    this.pitch += (this.targetPitch - this.pitch) * 0.2;
    this.roll  += (this.targetRoll  - this.roll)  * 0.2;
    this.yaw   += (this.targetYaw   - this.yaw)   * 0.2;

    this.ctx.clearRect(0, 0, w, h);

    this.drawGrid(cx, cy);

    const rotM = this.getRotationMatrix(this.pitch, this.roll, this.yaw);

    // Collect all faces across all models
    const polygons = [];
    const lightDir = [0.4, -0.6, 0.7]; // Directional light from top-right-front

    for (const model of this.models) {
      // Pre-project vertices
      const projected = model.vertices.map(v => this.project(v, rotM, cx, cy, fov));

      for (const face of model.faces) {
        const v0 = projected[face.v[0]];
        const v1 = projected[face.v[1]];
        const v2 = projected[face.v[2]];
        const v3 = projected[face.v[3]];

        // Back-face culling using 2D cross product
        const cross = (v1.x - v0.x) * (v2.y - v0.y) - (v1.y - v0.y) * (v2.x - v0.x);
        if (cross >= 0) continue; // Face pointing away

        // Transform normal vector to calculate diffuse lighting
        const n = face.normal;
        const tx = n[0] * rotM[0][0] + n[1] * rotM[0][1] + n[2] * rotM[0][2];
        const ty = n[0] * rotM[1][0] + n[1] * rotM[1][1] + n[2] * rotM[1][2];
        const tz = n[0] * rotM[2][0] + n[1] * rotM[2][1] + n[2] * rotM[2][2];

        // Dot product with light
        const dot = Math.max(0.15, tx * lightDir[0] + ty * lightDir[1] + tz * lightDir[2]);
        const shadeFactor = Math.min(1.3, dot * 1.2 * face.darkFactor);

        const avgZ = (v0.z + v1.z + v2.z + v3.z) / 4;

        polygons.push({
          pts: [v0, v1, v2, v3],
          z: avgZ,
          fill: this.shadeColor(face.color, shadeFactor),
          stroke: 'rgba(255, 255, 255, 0.08)'
        });
      }
    }

    // Sort polygons back-to-front (Painter's Algorithm)
    polygons.sort((a, b) => b.z - a.z);

    // Draw sorted polygons
    for (const poly of polygons) {
      this.ctx.beginPath();
      this.ctx.moveTo(poly.pts[0].x, poly.pts[0].y);
      for (let i = 1; i < poly.pts.length; i++) {
        this.ctx.lineTo(poly.pts[i].x, poly.pts[i].y);
      }
      this.ctx.closePath();
      this.ctx.fillStyle = poly.fill;
      this.ctx.fill();
      this.ctx.strokeStyle = poly.stroke;
      this.ctx.lineWidth = 0.8;
      this.ctx.stroke();
    }

    // Draw coordinate axes
    this.drawAxes(rotM, cx, cy, fov);
  }

  startRenderLoop() {
    const loop = () => {
      this.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
