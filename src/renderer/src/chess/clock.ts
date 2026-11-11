export type Clock = {
  whiteMs: number
  blackMs: number
  incrementMs: number
}

export type ClockSide = 'w' | 'b'

export function createClock(minutes: number, incrementSeconds: number): Clock {
  const base = Math.max(0, Math.round(minutes * 60_000))
  return { whiteMs: base, blackMs: base, incrementMs: Math.max(0, Math.round(incrementSeconds * 1000)) }
}

export function tick(clock: Clock | null, elapsedMs: number, side: ClockSide): Clock | null {
  if (!clock) return null
  const elapsed = Math.max(0, elapsedMs)
  if (side === 'w') return { ...clock, whiteMs: Math.max(0, clock.whiteMs - elapsed) }
  return { ...clock, blackMs: Math.max(0, clock.blackMs - elapsed) }
}

export function applyMove(clock: Clock | null, side: ClockSide): Clock | null {
  if (!clock) return null
  if (side === 'w') return { ...clock, whiteMs: clock.whiteMs + clock.incrementMs }
  return { ...clock, blackMs: clock.blackMs + clock.incrementMs }
}

export function flagged(clock: Clock | null): ClockSide | null {
  if (!clock) return null
  if (clock.whiteMs <= 0) return 'w'
  if (clock.blackMs <= 0) return 'b'
  return null
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
