let ctx: AudioContext | null = null
let master: GainNode | null = null
let noiseBuffer: AudioBuffer | null = null

function audio() {
  if (!ctx) {
    ctx = new AudioContext()
    master = ctx.createGain()
    master.gain.value = 0.85
    const compressor = ctx.createDynamicsCompressor()
    compressor.threshold.value = -14
    compressor.ratio.value = 4
    master.connect(compressor)
    compressor.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return { ctx, out: master as GainNode }
}

function getNoise(c: AudioContext) {
  if (!noiseBuffer) {
    noiseBuffer = c.createBuffer(1, c.sampleRate * 2, c.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  }
  return noiseBuffer
}

export const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12)

export function playPiano(midi: number, when = 0, velocity = 0.6) {
  const { ctx: c, out } = audio()
  const t = c.currentTime + when
  const f = midiToFreq(midi)
  const env = c.createGain()
  env.gain.setValueAtTime(0, t)
  env.gain.linearRampToValueAtTime(velocity * 0.45, t + 0.006)
  env.gain.exponentialRampToValueAtTime(velocity * 0.18, t + 0.4)
  env.gain.exponentialRampToValueAtTime(0.0008, t + 3.2)
  const filter = c.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(Math.min(f * 10, 14000), t)
  filter.frequency.exponentialRampToValueAtTime(Math.max(f * 2, 400), t + 1.6)
  env.connect(filter)
  filter.connect(out)
  const partials = [1, 2, 3, 4, 5, 6]
  const amps = [1, 0.45, 0.22, 0.12, 0.06, 0.03]
  partials.forEach((p, i) => {
    const osc = c.createOscillator()
    osc.type = i === 0 ? 'triangle' : 'sine'
    osc.frequency.value = f * p * (1 + (i % 2 ? 0.0008 : -0.0006))
    const g = c.createGain()
    g.gain.value = amps[i]
    osc.connect(g)
    g.connect(env)
    osc.start(t)
    osc.stop(t + 3.4)
  })
}

export function playRhodes(midi: number, when = 0) {
  const { ctx: c, out } = audio()
  const t = c.currentTime + when
  const f = midiToFreq(midi)
  const carrier = c.createOscillator()
  carrier.frequency.value = f
  const mod = c.createOscillator()
  mod.frequency.value = f * 1.0
  const modGain = c.createGain()
  modGain.gain.setValueAtTime(f * 2.2, t)
  modGain.gain.exponentialRampToValueAtTime(f * 0.1, t + 1.2)
  mod.connect(modGain)
  modGain.connect(carrier.frequency)
  const env = c.createGain()
  env.gain.setValueAtTime(0, t)
  env.gain.linearRampToValueAtTime(0.35, t + 0.005)
  env.gain.exponentialRampToValueAtTime(0.001, t + 2.6)
  const tremolo = c.createOscillator()
  tremolo.frequency.value = 4.5
  const tremGain = c.createGain()
  tremGain.gain.value = 0.06
  tremolo.connect(tremGain)
  tremGain.connect(env.gain)
  carrier.connect(env)
  env.connect(out)
  ;[carrier, mod, tremolo].forEach((o) => {
    o.start(t)
    o.stop(t + 2.8)
  })
}

export function playKick() {
  const { ctx: c, out } = audio()
  const t = c.currentTime
  const osc = c.createOscillator()
  osc.frequency.setValueAtTime(160, t)
  osc.frequency.exponentialRampToValueAtTime(42, t + 0.18)
  const g = c.createGain()
  g.gain.setValueAtTime(1, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.55)
  osc.connect(g)
  g.connect(out)
  osc.start(t)
  osc.stop(t + 0.6)
  noiseHit(c, out, { type: 'lowpass', freq: 3000, decay: 0.03, gain: 0.3 })
}

function noiseHit(
  c: AudioContext,
  out: AudioNode,
  { type, freq, decay, gain, q = 0.8 }: { type: BiquadFilterType; freq: number; decay: number; gain: number; q?: number },
) {
  const t = c.currentTime
  const src = c.createBufferSource()
  src.buffer = getNoise(c)
  const filter = c.createBiquadFilter()
  filter.type = type
  filter.frequency.value = freq
  filter.Q.value = q
  const g = c.createGain()
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + decay)
  src.connect(filter)
  filter.connect(g)
  g.connect(out)
  src.start(t)
  src.stop(t + decay + 0.05)
}

export function playSnare() {
  const { ctx: c, out } = audio()
  const t = c.currentTime
  noiseHit(c, out, { type: 'bandpass', freq: 2200, decay: 0.28, gain: 0.9, q: 0.5 })
  const osc = c.createOscillator()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(230, t)
  osc.frequency.exponentialRampToValueAtTime(160, t + 0.1)
  const g = c.createGain()
  g.gain.setValueAtTime(0.6, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.15)
  osc.connect(g)
  g.connect(out)
  osc.start(t)
  osc.stop(t + 0.2)
}

export function playTom(freq: number) {
  const { ctx: c, out } = audio()
  const t = c.currentTime
  const osc = c.createOscillator()
  osc.frequency.setValueAtTime(freq * 1.6, t)
  osc.frequency.exponentialRampToValueAtTime(freq, t + 0.08)
  const g = c.createGain()
  g.gain.setValueAtTime(0.85, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.7)
  osc.connect(g)
  g.connect(out)
  osc.start(t)
  osc.stop(t + 0.75)
  noiseHit(c, out, { type: 'lowpass', freq: 1800, decay: 0.06, gain: 0.25 })
}

export function playHiHat(open = false) {
  const { ctx: c, out } = audio()
  noiseHit(c, out, { type: 'highpass', freq: 7500, decay: open ? 0.5 : 0.07, gain: 0.5, q: 0.3 })
}

export function playCymbal(kind: 'crash' | 'ride') {
  const { ctx: c, out } = audio()
  if (kind === 'crash') {
    noiseHit(c, out, { type: 'highpass', freq: 4500, decay: 2.4, gain: 0.55, q: 0.2 })
    noiseHit(c, out, { type: 'bandpass', freq: 9000, decay: 1.4, gain: 0.25 })
  } else {
    noiseHit(c, out, { type: 'bandpass', freq: 6200, decay: 1.6, gain: 0.32, q: 1.5 })
    const t = c.currentTime
    ;[1180, 1720, 2630].forEach((f) => {
      const o = c.createOscillator()
      o.type = 'square'
      o.frequency.value = f
      const g = c.createGain()
      g.gain.setValueAtTime(0.025, t)
      g.gain.exponentialRampToValueAtTime(0.0005, t + 1.4)
      o.connect(g)
      g.connect(out)
      o.start(t)
      o.stop(t + 1.5)
    })
  }
}

export function playGuitarString(midi: number, when = 0, gain = 0.5) {
  const { ctx: c, out } = audio()
  const sr = c.sampleRate
  const f = midiToFreq(midi)
  const length = Math.floor(sr * 2.2)
  const buffer = c.createBuffer(1, length, sr)
  const data = buffer.getChannelData(0)
  const period = Math.round(sr / f)
  const ring = new Float32Array(period)
  for (let i = 0; i < period; i++) ring[i] = Math.random() * 2 - 1
  let idx = 0
  for (let i = 0; i < length; i++) {
    const next = (idx + 1) % period
    const value = (ring[idx] + ring[next]) * 0.4985
    data[i] = ring[idx]
    ring[idx] = value
    idx = next
  }
  const src = c.createBufferSource()
  src.buffer = buffer
  const g = c.createGain()
  g.gain.value = gain
  const tone = c.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.value = 4200
  src.connect(tone)
  tone.connect(g)
  g.connect(out)
  src.start(c.currentTime + when)
}

export function strumGuitar() {
  const chords = [
    [40, 47, 52, 56, 59, 64],
    [45, 52, 57, 61, 64],
    [43, 47, 50, 55, 59, 67],
    [38, 45, 50, 54, 57, 62],
  ]
  const chord = chords[Math.floor(Math.random() * chords.length)]
  chord.forEach((m, i) => playGuitarString(m, i * 0.018, 0.32))
}

export function playPianoChord() {
  const chords = [
    [48, 55, 64, 67, 71, 74],
    [45, 52, 60, 64, 67, 71],
    [41, 48, 57, 60, 64, 69],
    [43, 50, 59, 62, 65, 69],
  ]
  const chord = chords[Math.floor(Math.random() * chords.length)]
  chord.forEach((m, i) => playPiano(m, i * 0.07, 0.5))
}

export function playBlip() {
  const { ctx: c, out } = audio()
  const t = c.currentTime
  ;[880, 1320].forEach((f, i) => {
    const o = c.createOscillator()
    o.type = 'sine'
    o.frequency.value = f
    const g = c.createGain()
    g.gain.setValueAtTime(0, t + i * 0.08)
    g.gain.linearRampToValueAtTime(0.18, t + i * 0.08 + 0.01)
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.3)
    o.connect(g)
    g.connect(out)
    o.start(t + i * 0.08)
    o.stop(t + i * 0.08 + 0.35)
  })
}

export function unlockAudio() {
  audio()
}
