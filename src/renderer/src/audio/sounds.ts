let context: AudioContext | null = null

function audioContext(): AudioContext {
  context ??= new AudioContext()
  if (context.state === 'suspended') void context.resume()
  return context
}

type Tone = {
  frequency: number
  duration: number
  delay?: number
  type?: OscillatorType
  gain?: number
  sweepTo?: number
}

function play(tones: Tone[]): void {
  const ctx = audioContext()
  const start = ctx.currentTime

  for (const tone of tones) {
    const offset = start + (tone.delay ?? 0)
    const oscillator = ctx.createOscillator()
    const envelope = ctx.createGain()

    oscillator.type = tone.type ?? 'triangle'
    oscillator.frequency.setValueAtTime(tone.frequency, offset)
    if (tone.sweepTo) oscillator.frequency.exponentialRampToValueAtTime(tone.sweepTo, offset + tone.duration)

    envelope.gain.setValueAtTime(0.0001, offset)
    envelope.gain.exponentialRampToValueAtTime(tone.gain ?? 0.18, offset + 0.008)
    envelope.gain.exponentialRampToValueAtTime(0.0001, offset + tone.duration)

    oscillator.connect(envelope).connect(ctx.destination)
    oscillator.start(offset)
    oscillator.stop(offset + tone.duration + 0.02)
  }
}

function noise(duration: number, cutoff: number, gain = 0.12): void {
  const ctx = audioContext()
  const frames = Math.floor(ctx.sampleRate * duration)
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate)
  const samples = buffer.getChannelData(0)
  for (let i = 0; i < frames; i += 1) samples[i] = (Math.random() * 2 - 1) * (1 - i / frames)

  const source = ctx.createBufferSource()
  source.buffer = buffer
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = cutoff
  const envelope = ctx.createGain()
  envelope.gain.value = gain

  source.connect(filter).connect(envelope).connect(ctx.destination)
  source.start()
}

export type SoundName = 'select' | 'move' | 'capture' | 'check' | 'illegal' | 'gameEnd'

export const soundLabels: Record<SoundName, string> = {
  select: 'Select',
  move: 'Move',
  capture: 'Capture',
  check: 'Check',
  illegal: 'Illegal',
  gameEnd: 'Game end'
}

export function playSound(name: SoundName): void {
  switch (name) {
    case 'select':
      play([{ frequency: 880, duration: 0.05, type: 'sine', gain: 0.1 }])
      break
    case 'move':
      noise(0.05, 1600, 0.14)
      play([{ frequency: 320, duration: 0.08, type: 'sine', gain: 0.12, sweepTo: 240 }])
      break
    case 'capture':
      noise(0.12, 900, 0.22)
      play([{ frequency: 180, duration: 0.14, type: 'sawtooth', gain: 0.12, sweepTo: 90 }])
      break
    case 'check':
      play([
        { frequency: 660, duration: 0.09, type: 'square', gain: 0.1 },
        { frequency: 990, duration: 0.12, delay: 0.08, type: 'square', gain: 0.1 }
      ])
      break
    case 'illegal':
      play([{ frequency: 160, duration: 0.14, type: 'square', gain: 0.09 }])
      break
    case 'gameEnd':
      play([
        { frequency: 523, duration: 0.12, type: 'sine', gain: 0.14 },
        { frequency: 659, duration: 0.12, delay: 0.1, type: 'sine', gain: 0.14 },
        { frequency: 784, duration: 0.24, delay: 0.2, type: 'sine', gain: 0.14 }
      ])
      break
  }
}
