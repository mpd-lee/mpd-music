let ctx: AudioContext | null = null
let master: GainNode | null = null
let noiseBuffer: AudioBuffer | null = null

function audio() {
  if (typeof window === 'undefined') throw new Error('Audio is available only in the browser.')
  if (!ctx) {
    const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextCtor) throw new Error('이 브라우저는 Web Audio를 지원하지 않습니다.')
    ctx = new AudioContextCtor({ latencyHint: 'interactive' })
    master = ctx.createGain()
    master.gain.value = 0.92
    const compressor = ctx.createDynamicsCompressor()
    compressor.threshold.value = -18
    compressor.knee.value = 20
    compressor.ratio.value = 3.5
    compressor.attack.value = 0.004
    compressor.release.value = 0.18
    master.connect(compressor)
    compressor.connect(ctx.destination)
  }
  if (ctx.state !== 'running') {
    void ctx.resume().catch((error) => console.warn('[MPD Studio] AudioContext resume failed:', error))
  }
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

type SampleInstrument = { play: (note: number, time?: number, options?: { duration?: number; gain?: number }) => unknown }
const sampleInstruments = new Map<string, SampleInstrument>()
const samplePromises = new Map<string, Promise<SampleInstrument>>()

/** Load one sampled GM instrument only when a visitor first plays it. */
function requestSampleInstrument(name: string): SampleInstrument | null {
  const ready = sampleInstruments.get(name)
  if (ready) return ready
  if (!samplePromises.has(name)) {
    const { ctx: c, out } = audio()
    const noteRange = name === 'acoustic_grand_piano'
      ? Array.from({ length: 88 }, (_, index) => index + 21)
      : name === 'electric_piano_1'
        ? Array.from({ length: 61 }, (_, index) => index + 36)
        : Array.from({ length: 23 }, (_, index) => index + 33)
    const promise = import('soundfont-player').then((module) => {
      const namespace = module as unknown as {
        instrument?: (context: AudioContext, instrumentName: string, options: Record<string, unknown>) => Promise<SampleInstrument>
        default?: { instrument?: (context: AudioContext, instrumentName: string, options: Record<string, unknown>) => Promise<SampleInstrument> }
      }
      const createInstrument = namespace.instrument ?? namespace.default?.instrument
      if (!createInstrument) throw new Error('soundfont-player instrument() API를 찾을 수 없습니다.')
      return createInstrument(c, name, { soundfont: 'FluidR3_GM', format: 'mp3', destination: out, gain: 0.78, notes: noteRange })
    }).then((instrument) => {
      sampleInstruments.set(name, instrument)
      return instrument
    }).catch((error: unknown) => {
      samplePromises.delete(name)
      console.warn(`[MPD Studio] ${name} sample load failed; using the built-in fallback tone.`, error)
      throw error
    })
    samplePromises.set(name, promise)
    void promise.catch(() => undefined)
  }
  return null
}

function playSampleOrWarm(name: string, midi: number, when: number, duration: number, gain: number) {
  const instrument = requestSampleInstrument(name)
  if (!instrument) return false
  const { ctx: c } = audio()
  try {
    instrument.play(midi, c.currentTime + Math.max(0, when), { duration, gain })
    return true
  } catch (error) {
    // A broken/partially-loaded sample must never silence this note or later clicks.
    sampleInstruments.delete(name)
    samplePromises.delete(name)
    console.warn(`[MPD Studio] ${name} sample playback failed; using the built-in tone.`, error)
    return false
  }
}

function playPianoFallback(midi: number, when = 0, velocity = 0.6) {
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

export function playPiano(midi: number, when = 0, velocity = 0.6) {
  const { ctx: c } = audio()
  if (c.state !== 'running') {
    void c.resume().then(() => playPiano(midi, when, velocity)).catch(() => playPianoFallback(midi, when, velocity))
    return
  }
  const sampled = playSampleOrWarm('acoustic_grand_piano', midi, when, 2.8, velocity * 0.86)
  // Audible procedural piano remains as a fallback until each soundfont sample is ready.
  playPianoFallback(midi, when, sampled ? velocity * 0.22 : velocity)
}

function playRhodesFallback(midi: number, when = 0, velocity = 0.72) {
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
  env.gain.linearRampToValueAtTime(0.46 * velocity, t + 0.005)
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

export function playRhodes(midi: number, when = 0, velocity = 0.72) {
  const { ctx: c } = audio()
  if (c.state !== 'running') {
    void c.resume().then(() => playRhodes(midi, when, velocity)).catch(() => playRhodesFallback(midi, when, velocity))
    return
  }
  const sampled = playSampleOrWarm('electric_piano_1', midi, when, 2.2, velocity * 0.82)
  // Keep a low-level Rhodes FM fallback under the sample: a blocked CDN sample
  // can never make the keyboard appear dead after the first note.
  playRhodesFallback(midi, when, sampled ? velocity * 0.34 : velocity)
}


function playSynthFallback(midi: number, when = 0, velocity = 0.68) {
  const { ctx: c, out } = audio()
  const t = c.currentTime + Math.max(0, when)
  const f = midiToFreq(midi)
  const filter = c.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(5200, t)
  filter.frequency.exponentialRampToValueAtTime(1450, t + 0.42)
  filter.Q.value = 1.25
  const envelope = c.createGain()
  envelope.gain.setValueAtTime(0.0001, t)
  envelope.gain.linearRampToValueAtTime(velocity * 0.34, t + 0.012)
  envelope.gain.exponentialRampToValueAtTime(0.12, t + 0.12)
  envelope.gain.exponentialRampToValueAtTime(0.0008, t + 1.65)
  filter.connect(envelope)
  envelope.connect(out)
  const detunes = [-7, 0, 7]
  detunes.forEach((cents, index) => {
    const osc = c.createOscillator()
    osc.type = index === 1 ? 'sawtooth' : 'triangle'
    osc.frequency.setValueAtTime(f, t)
    osc.detune.value = cents
    const gain = c.createGain()
    gain.gain.value = index === 1 ? 0.42 : 0.29
    osc.connect(gain)
    gain.connect(filter)
    osc.start(t)
    osc.stop(t + 1.72)
  })
}

export function playSynth(midi: number, when = 0, velocity = 0.68) {
  const { ctx: c } = audio()
  if (c.state !== 'running') {
    void c.resume().then(() => playSynth(midi, when, velocity)).catch(() => playSynthFallback(midi, when, velocity))
    return
  }
  playSynthFallback(midi, when, velocity)
}

export function playKick() {
  const { ctx: c, out } = audio()
  if (c.state !== 'running') { void c.resume().then(playKick).catch(() => undefined); return }
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


function playFunkyBassFallback(midi: number, when = 0, velocity = 0.72) {
  const { ctx: c, out } = audio()
  const t = c.currentTime + when
  const f = midiToFreq(midi)
  const osc = c.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(f * 1.012, t)
  osc.frequency.exponentialRampToValueAtTime(f, t + 0.035)
  const sub = c.createOscillator()
  sub.type = 'sine'
  sub.frequency.value = f * 0.5
  const filter = c.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(1800, t)
  filter.frequency.exponentialRampToValueAtTime(440, t + 0.22)
  filter.Q.value = 0.85
  const env = c.createGain()
  env.gain.setValueAtTime(0.0001, t)
  env.gain.linearRampToValueAtTime(velocity * 0.62, t + 0.008)
  env.gain.exponentialRampToValueAtTime(0.0008, t + 0.34)
  osc.connect(filter)
  sub.connect(filter)
  filter.connect(env)
  env.connect(out)
  osc.start(t); sub.start(t)
  osc.stop(t + 0.38); sub.stop(t + 0.38)
}

/** A short syncopated slap-bass lick; the sampled Slap Bass 1 soundfont is fetched lazily. */
export function playFunkyBass() {
  const { ctx: c } = audio()
  if (c.state !== 'running') { void c.resume().then(playFunkyBass).catch(() => undefined); return }
  const riff = [40, 43, 45, 47, 50, 47, 45, 43]
  const timings = [0, 0.085, 0.17, 0.285, 0.48, 0.565, 0.68, 0.79]
  riff.forEach((note, index) => {
    const when = timings[index]
    const velocity = index === 0 ? 0.9 : 0.76
    const sampled = playSampleOrWarm('slap_bass_1', note, when, 0.24, velocity * 0.85)
    playFunkyBassFallback(note, when, sampled ? velocity * 0.42 : velocity)
  })
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
  if (c.state !== 'running') { void c.resume().then(playSnare).catch(() => undefined); return }
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
  if (c.state !== 'running') { void c.resume().then(() => playTom(freq)).catch(() => undefined); return }
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
  if (c.state !== 'running') { void c.resume().then(() => playHiHat(open)).catch(() => undefined); return }
  noiseHit(c, out, { type: 'highpass', freq: 7500, decay: open ? 0.5 : 0.07, gain: 0.5, q: 0.3 })
}

export function playCymbal(kind: 'crash' | 'ride') {
  const { ctx: c, out } = audio()
  if (c.state !== 'running') { void c.resume().then(() => playCymbal(kind)).catch(() => undefined); return }
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
  if (c.state !== 'running') { void c.resume().then(() => playGuitarString(midi, when, gain)).catch(() => undefined); return }
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
  if (c.state !== 'running') { void c.resume().then(playBlip).catch(() => undefined); return }
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
  const { ctx: c, out } = audio()
  const prime = () => {
    // A one-sample silent node primes mobile browsers after the entry gesture.
    const buffer = c.createBuffer(1, 1, c.sampleRate)
    const source = c.createBufferSource()
    const gain = c.createGain()
    gain.gain.value = 0
    source.buffer = buffer
    source.connect(gain)
    gain.connect(out)
    source.start()
    source.stop(c.currentTime + 0.01)
  }
  if (c.state === 'running') prime()
  else void c.resume().then(prime).catch((error) => console.warn('[MPD Studio] Tap an instrument once to enable sound:', error))
}
