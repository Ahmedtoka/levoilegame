// Generative ambient music and UI sound effects with the Web Audio API, so
// the project needs no audio files. Unlocked by the "Enter the Mall" click.

const CHORDS = [
  [53, 57, 60, 64], // Fmaj7
  [52, 55, 59, 62], // Em7
  [50, 53, 57, 60, 64], // Dm9-ish
  [48, 52, 55, 59], // Cmaj7
]
const BELLS = [72, 74, 76, 79, 81, 84]
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12)

export class AudioEngine {
  private ctx: AudioContext | null = null
  private master!: GainNode
  private musicBus!: GainNode
  private sfxBus!: GainNode
  private wet!: GainNode
  private musicTimer = 0
  private chordIndex = 0
  musicOn = true
  sfxOn = true

  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume()
      return
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    this.ctx = ctx
    this.master = ctx.createGain()
    this.master.gain.value = 0.9
    this.master.connect(ctx.destination)

    // Simple feedback-delay "room" for space.
    const delay = ctx.createDelay(1)
    delay.delayTime.value = 0.33
    const fb = ctx.createGain()
    fb.gain.value = 0.38
    const tone = ctx.createBiquadFilter()
    tone.type = 'lowpass'
    tone.frequency.value = 2200
    this.wet = ctx.createGain()
    this.wet.gain.value = 0.35
    this.wet.connect(delay)
    delay.connect(tone)
    tone.connect(fb)
    fb.connect(delay)
    tone.connect(this.master)

    this.musicBus = ctx.createGain()
    this.musicBus.gain.value = this.musicOn ? 0.5 : 0
    this.musicBus.connect(this.master)
    this.musicBus.connect(this.wet)
    this.sfxBus = ctx.createGain()
    this.sfxBus.gain.value = 0.6
    this.sfxBus.connect(this.master)
    this.sfxBus.connect(this.wet)
    this.scheduleMusic()
  }

  setMusic(on: boolean): void {
    this.musicOn = on
    if (!this.ctx) return
    this.musicBus.gain.cancelScheduledValues(this.ctx.currentTime)
    this.musicBus.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx.currentTime, 0.6)
  }

  setSfx(on: boolean): void {
    this.sfxOn = on
  }

  suspend(hidden: boolean): void {
    if (!this.ctx) return
    if (hidden) void this.ctx.suspend()
    else void this.ctx.resume()
  }

  private scheduleMusic(): void {
    const ctx = this.ctx!
    const bar = 6.4
    const tick = () => {
      const now = ctx.currentTime
      // Keep ~2 bars scheduled ahead.
      while (this.musicTimer < now + bar * 2) {
        const t0 = Math.max(this.musicTimer, now + 0.05)
        const chord = CHORDS[this.chordIndex++ % CHORDS.length]
        for (const n of chord) this.pad(mtof(n), t0, bar * 1.15)
        this.pad(mtof(chord[0] - 12), t0, bar * 1.1, 0.06)
        for (let i = 0; i < 3; i++) {
          if (Math.random() < 0.7) this.bell(mtof(BELLS[Math.floor(Math.random() * BELLS.length)]), t0 + 0.8 + i * 1.9 + Math.random() * 0.6, 0.035)
        }
        this.musicTimer = t0 + bar
      }
    }
    tick()
    window.setInterval(tick, 1500)
  }

  private pad(freq: number, t0: number, dur: number, vol = 0.028): void {
    const ctx = this.ctx!
    const g = ctx.createGain()
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 900
    f.Q.value = 0.3
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(vol, t0 + dur * 0.35)
    g.gain.linearRampToValueAtTime(0, t0 + dur)
    for (const det of [-6, 6]) {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = freq
      o.detune.value = det
      o.connect(f)
      o.start(t0)
      o.stop(t0 + dur + 0.1)
    }
    f.connect(g)
    g.connect(this.musicBus)
  }

  private bell(freq: number, t0: number, vol: number, bus?: GainNode): void {
    const ctx = this.ctx!
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(vol, t0 + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.2)
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.value = freq
    const o2 = ctx.createOscillator()
    o2.type = 'sine'
    o2.frequency.value = freq * 2.01
    const g2 = ctx.createGain()
    g2.gain.value = 0.25
    o.connect(g)
    o2.connect(g2)
    g2.connect(g)
    g.connect(bus ?? this.musicBus)
    o.start(t0)
    o2.start(t0)
    o.stop(t0 + 2.3)
    o2.stop(t0 + 2.3)
  }

  private get sfxReady(): boolean {
    return !!this.ctx && this.sfxOn
  }

  /** Two-note chime when something lands in the cart. */
  addToCart(): void {
    if (!this.sfxReady) return
    const t = this.ctx!.currentTime
    this.bell(mtof(76), t, 0.22, this.sfxBus)
    this.bell(mtof(83), t + 0.11, 0.2, this.sfxBus)
  }

  success(): void {
    if (!this.sfxReady) return
    const t = this.ctx!.currentTime
    ;[72, 76, 79, 84].forEach((n, i) => this.bell(mtof(n), t + i * 0.12, 0.18, this.sfxBus))
  }

  click(): void {
    if (!this.sfxReady) return
    const ctx = this.ctx!
    const t = ctx.currentTime
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'triangle'
    o.frequency.setValueAtTime(900, t)
    o.frequency.exponentialRampToValueAtTime(500, t + 0.06)
    g.gain.setValueAtTime(0.08, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08)
    o.connect(g)
    g.connect(this.sfxBus)
    o.start(t)
    o.stop(t + 0.1)
  }

  greet(): void {
    if (!this.sfxReady) return
    const t = this.ctx!.currentTime
    this.bell(mtof(79), t, 0.08, this.sfxBus)
    this.bell(mtof(84), t + 0.09, 0.06, this.sfxBus)
  }

  /** Soft filtered-noise step. */
  step(): void {
    if (!this.sfxReady) return
    const ctx = this.ctx!
    const t = ctx.currentTime
    const len = 0.06
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3)
    const src = ctx.createBufferSource()
    src.buffer = buf
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = 1400 + Math.random() * 500
    f.Q.value = 1.2
    const g = ctx.createGain()
    g.gain.value = 0.05
    src.connect(f)
    f.connect(g)
    g.connect(this.master)
    src.start(t)
  }

  door(): void {
    if (!this.sfxReady) return
    const ctx = this.ctx!
    const t = ctx.currentTime
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.8, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / d.length)
    const src = ctx.createBufferSource()
    src.buffer = buf
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.setValueAtTime(400, t)
    f.frequency.linearRampToValueAtTime(1600, t + 0.4)
    f.frequency.linearRampToValueAtTime(300, t + 0.8)
    const g = ctx.createGain()
    g.gain.value = 0.12
    src.connect(f)
    f.connect(g)
    g.connect(this.sfxBus)
    src.start(t)
  }
}

export const audio = new AudioEngine()
