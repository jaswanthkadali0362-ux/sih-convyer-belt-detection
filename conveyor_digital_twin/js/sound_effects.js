/**
 * Ore Sentinels Procedural Sound FX Engine
 * Uses Web Audio API to generate real-time industrial acoustics and sci-fi telemetry audio.
 * Zero external audio files required. Starts muted by default.
 */

export class SoundFXEngine {
  constructor() {
    this.ctx = null;
    this.isMuted = true; // Default muted for unobtrusive experience
    this.masterGain = null;
    this.motorOsc = null;
    this.motorGain = null;
    this.isMotorRunning = false;

    // Retrieve user preference
    const saved = localStorage.getItem('oresentinels_sound_muted') || localStorage.getItem('beltxence_sound_muted');
    if (saved !== null) {
      this.isMuted = saved === 'true';
    }
  }

  init() {
    if (this.ctx) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.isMuted ? 0 : 0.45;
      this.masterGain.connect(this.ctx.destination);
    } catch (e) {
      console.warn('[SoundFX] Web Audio not supported:', e);
    }
  }

  ensureContext() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.ensureContext();
    this.isMuted = !this.isMuted;
    localStorage.setItem('oresentinels_sound_muted', String(this.isMuted));
    localStorage.setItem('beltxence_sound_muted', String(this.isMuted));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.45, this.ctx.currentTime);
    }
    if (!this.isMuted) {
      this.playClick();
    }
    return !this.isMuted;
  }

  setMuted(muted) {
    this.isMuted = muted;
    localStorage.setItem('oresentinels_sound_muted', String(this.isMuted));
    localStorage.setItem('beltxence_sound_muted', String(this.isMuted));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.45, this.ctx.currentTime);
    }
  }

  // UI Button Click Chirp
  playClick() {
    if (this.isMuted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1400, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(700, this.ctx.currentTime + 0.04);

    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.045);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.05);
  }

  // Optical Laser Profilometer Ping
  playLaserPing() {
    if (this.isMuted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(2200, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(2800, this.ctx.currentTime + 0.06);

    gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.07);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.08);
  }

  // Industrial Alarm Siren (Emergency / Gouge Detected)
  playAlarm() {
    if (this.isMuted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(450, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(900, this.ctx.currentTime + 0.25);
    osc.frequency.linearRampToValueAtTime(450, this.ctx.currentTime + 0.5);

    gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.25, this.ctx.currentTime + 0.45);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.55);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.55);
  }

  // Emergency Brake Friction & Spark Sound
  playBrakeSparks() {
    if (this.isMuted) return;
    this.ensureContext();
    if (!this.ctx) return;

    // Generate white noise buffer
    const bufferSize = this.ctx.sampleRate * 0.4;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(3000, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(400, this.ctx.currentTime + 0.4);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.4);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start();
    noise.stop(this.ctx.currentTime + 0.4);
  }

  // Continuous Motor Drive Hum
  updateMotorHum(isRunning, speedRatio = 1.0) {
    if (this.isMuted || !isRunning) {
      if (this.motorGain && this.ctx) {
        this.motorGain.gain.setValueAtTime(0, this.ctx.currentTime);
      }
      this.isMotorRunning = false;
      return;
    }

    this.ensureContext();
    if (!this.ctx) return;

    if (!this.motorOsc) {
      this.motorOsc = this.ctx.createOscillator();
      this.motorGain = this.ctx.createGain();

      this.motorOsc.type = 'triangle';
      this.motorOsc.frequency.setValueAtTime(65, this.ctx.currentTime);
      this.motorGain.gain.setValueAtTime(0.04, this.ctx.currentTime);

      this.motorOsc.connect(this.motorGain);
      this.motorGain.connect(this.masterGain);
      this.motorOsc.start();
    }

    const targetFreq = 50 + speedRatio * 35;
    this.motorOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.15);
    this.motorGain.gain.setTargetAtTime(0.04, this.ctx.currentTime, 0.15);
    this.isMotorRunning = true;
  }
}
