/**
 * Ore Sentinels Spatial Cursor & 3D Interactive Motion Engine
 * MotionSites-inspired 3D physics cursor, magnetic tab tilt, specular lighting,
 * and micro-animations for all tabs, cards, and interactive controls.
 */

export class SpatialCursorEngine {
  constructor() {
    this.mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    this.cursorPos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    this.speed = { x: 0, y: 0 };
    this.isHovering = false;
    this.hoverTarget = null;
    this.isDown = false;
    this.rafId = null;

    this.initDOM();
    this.bindEvents();
    this.bind3DTiltElements();
    this.render();

    console.log('[Ore Sentinels] Spatial Cursor & 3D Motion Engine activated.');
  }

  initDOM() {
    // Container for cursor elements
    const container = document.createElement('div');
    container.id = 'spatial-cursor-root';
    container.className = 'spatial-cursor-root';
    container.innerHTML = `
      <div class="spatial-cursor-halo" id="cursor-halo">
        <div class="halo-reticle top-left"></div>
        <div class="halo-reticle top-right"></div>
        <div class="halo-reticle bottom-left"></div>
        <div class="halo-reticle bottom-right"></div>
      </div>
      <div class="spatial-cursor-core" id="cursor-core"></div>
    `;
    document.body.appendChild(container);

    this.haloEl = document.getElementById('cursor-halo');
    this.coreEl = document.getElementById('cursor-core');
  }

  bindEvents() {
    // Mouse movement
    window.addEventListener('pointermove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;

      // Update core position immediately for zero latency
      if (this.coreEl) {
        this.coreEl.style.transform = `translate3d(${this.mouse.x}px, ${this.mouse.y}px, 0) translate(-50%, -50%)`;
      }
    }, { passive: true });

    // Pointer down / click ripple
    window.addEventListener('pointerdown', (e) => {
      this.isDown = true;
      if (this.haloEl) this.haloEl.classList.add('cursor-pressed');
      this.spawnClickPulse(e.clientX, e.clientY);
    });

    window.addEventListener('pointerup', () => {
      this.isDown = false;
      if (this.haloEl) this.haloEl.classList.remove('cursor-pressed');
    });

    // Delegated hover detection for interactive elements
    document.addEventListener('mouseover', (e) => {
      const interactive = e.target.closest('button, [data-nav], .rail-item, .tool-btn, .modal-tab-btn, .settings-tab-btn, .header-history-btn, .header-settings-btn, .header-futuristic-btn, .ai-expand-btn, .ai-source-btn, .ai-filter-pill, .hud-pill-badge, input, select, .kpi-card, .clickable');
      if (interactive) {
        this.isHovering = true;
        this.hoverTarget = interactive;
        if (this.haloEl) this.haloEl.classList.add('is-hovering');
        if (this.coreEl) this.coreEl.classList.add('is-hovering');
      }
    });

    document.addEventListener('mouseout', (e) => {
      const interactive = e.target.closest('button, [data-nav], .rail-item, .tool-btn, .modal-tab-btn, .settings-tab-btn, .header-history-btn, .header-settings-btn, .header-futuristic-btn, .ai-expand-btn, .ai-source-btn, .ai-filter-pill, .hud-pill-badge, input, select, .kpi-card, .clickable');
      if (interactive && interactive === this.hoverTarget) {
        this.isHovering = false;
        this.hoverTarget = null;
        if (this.haloEl) this.haloEl.classList.remove('is-hovering');
        if (this.coreEl) this.coreEl.classList.remove('is-hovering');
      }
    });
  }

  spawnClickPulse(x, y) {
    const pulse = document.createElement('div');
    pulse.className = 'spatial-click-pulse';
    pulse.style.left = `${x}px`;
    pulse.style.top = `${y}px`;
    document.body.appendChild(pulse);

    setTimeout(() => {
      if (pulse.parentNode) pulse.parentNode.removeChild(pulse);
    }, 600);
  }

  bind3DTiltElements() {
    // Select targets for interactive 3D perspective tilt and dynamic specular light
    const setupCardTilt = (el, maxTilt = 8, maxScale = 1.02) => {
      if (!el || el.__tiltBound) return;
      el.__tiltBound = true;
      el.classList.add('perspective-3d-target');

      el.addEventListener('mousemove', (e) => {
        const rect = el.getBoundingClientRect();
        const normX = (e.clientX - rect.left) / rect.width - 0.5;
        const normY = (e.clientY - rect.top) / rect.height - 0.5;

        // Calculate 3D angles
        const rotX = -normY * maxTilt;
        const rotY = normX * maxTilt;

        // Set dynamic specular light coordinates (in percentages)
        const lightX = ((e.clientX - rect.left) / rect.width) * 100;
        const lightY = ((e.clientY - rect.top) / rect.height) * 100;

        el.style.setProperty('--specular-x', `${lightX}%`);
        el.style.setProperty('--specular-y', `${lightY}%`);
        el.style.transform = `perspective(800px) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg) scale3d(${maxScale}, ${maxScale}, 1)`;
      }, { passive: true });

      el.addEventListener('mouseleave', () => {
        el.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
        el.style.setProperty('--specular-x', `50%`);
        el.style.setProperty('--specular-y', `50%`);
      });
    };

    // Attach to existing cards and toolbars
    const attachAll = () => {
      const cards = document.querySelectorAll(
        '.ai-vision-card, .health-kpi-card, .camera-toolbar, .timeline-scrubber-bar, .rail-item, .header-futuristic-btn, .header-settings-btn, .header-history-btn, .tool-btn, .modal-kpi-card, .sensor-kpi-box, .sensor-chart-card, .sensor-diag-card'
      );
      cards.forEach(card => setupCardTilt(card, card.classList.contains('rail-item') ? 6 : (card.classList.contains('tool-btn') ? 5 : 7)));
    };

    attachAll();

    // Re-bind when new modals or elements might appear in DOM
    const observer = new MutationObserver(() => {
      attachAll();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  render() {
    // Fluid smooth inertia for the halo follower
    const ease = 0.18;
    this.speed.x = (this.mouse.x - this.cursorPos.x) * ease;
    this.speed.y = (this.mouse.y - this.cursorPos.y) * ease;
    this.cursorPos.x += this.speed.x;
    this.cursorPos.y += this.speed.y;

    if (this.haloEl) {
      this.haloEl.style.transform = `translate3d(${this.cursorPos.x}px, ${this.cursorPos.y}px, 0) translate(-50%, -50%)`;
    }

    this.rafId = requestAnimationFrame(() => this.render());
  }

  destroy() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    const root = document.getElementById('spatial-cursor-root');
    if (root) root.remove();
  }
}
