const STORAGE_KEY = 'nw:cinema-audio-muted';

export class AmbientAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private humOsc: OscillatorNode | null = null;
  private droneOsc: OscillatorNode | null = null;
  private droneGain: GainNode | null = null;
  private muted: boolean;
  private active = false;

  constructor() {
    this.muted = localStorage.getItem(STORAGE_KEY) !== 'false'; // Default muted
  }

  isMuted(): boolean {
    return this.muted;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    localStorage.setItem(STORAGE_KEY, String(this.muted));
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 0.3, this.ctx!.currentTime, 0.1);
    }
    if (!this.muted && !this.ctx) {
      this.initAudio();
    }
    return this.muted;
  }

  start(): void {
    this.active = true;
    // Audio only initializes when user unmutes (user gesture requirement)
  }

  stop(): void {
    this.active = false;
    this.destroyAudio();
  }

  /** Play a severity-pitched event ping */
  ping(severity: 'critical' | 'elevated' | 'monitor'): void {
    if (!this.ctx || this.muted || !this.active) return;

    const freq = severity === 'critical' ? 1200 : severity === 'elevated' ? 800 : 500;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);

    osc.connect(gain).connect(this.masterGain!);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  /** Play a frequency sweep for camera fly-to */
  sweep(): void {
    if (!this.ctx || this.muted || !this.active) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, this.ctx.currentTime + 0.8);
    gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.8);

    osc.connect(gain).connect(this.masterGain!);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.9);
  }

  /** Play critical alert two-tone stinger */
  stinger(): void {
    if (!this.ctx || this.muted || !this.active) return;

    for (let i = 0; i < 3; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const time = this.ctx.currentTime + i * 0.4;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, time);
      osc.frequency.setValueAtTime(1100, time + 0.2);
      gain.gain.setValueAtTime(0.06, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);

      osc.connect(gain).connect(this.masterGain!);
      osc.start(time);
      osc.stop(time + 0.4);
    }
  }

  /** Update tension drone based on current tension index */
  updateTensionDrone(tensionValue: number): void {
    if (!this.droneOsc || !this.droneGain || !this.ctx || this.muted) return;

    // Map tension 0-100 to frequency 100-300Hz
    const freq = 100 + (tensionValue / 100) * 200;
    this.droneOsc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.5);

    // Map tension to gain 0.01-0.04
    const gain = 0.01 + (tensionValue / 100) * 0.03;
    this.droneGain.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.5);
  }

  private initAudio(): void {
    if (this.ctx) return;

    try {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.3;
      this.masterGain.connect(this.ctx.destination);

      // Background hum: 60Hz sine at very low volume
      this.humOsc = this.ctx.createOscillator();
      const humGain = this.ctx.createGain();
      this.humOsc.type = 'sine';
      this.humOsc.frequency.value = 60;
      humGain.gain.value = 0.02;
      this.humOsc.connect(humGain).connect(this.masterGain);
      this.humOsc.start();

      // Tension drone: modulated by tension index
      this.droneOsc = this.ctx.createOscillator();
      this.droneGain = this.ctx.createGain();
      this.droneOsc.type = 'sine';
      this.droneOsc.frequency.value = 150;
      this.droneGain.gain.value = 0.02;
      this.droneOsc.connect(this.droneGain).connect(this.masterGain);
      this.droneOsc.start();
    } catch {
      // Web Audio not supported
    }
  }

  private destroyAudio(): void {
    try {
      this.humOsc?.stop();
      this.droneOsc?.stop();
    } catch {
      // Already stopped
    }
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.masterGain = null;
    this.humOsc = null;
    this.droneOsc = null;
    this.droneGain = null;
  }
}
