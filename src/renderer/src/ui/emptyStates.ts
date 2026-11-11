export type ReviewStage = 'playing' | 'running' | 'reviewed' | 'empty-game' | 'ready'
export type LibraryStage = 'empty' | 'no-results' | 'ready'
export type OpeningsStage = 'no-token' | 'loading' | 'ready'

type ReviewInput = { ply: number; running: boolean; reviewed: boolean; playing: boolean }
type LibraryInput = { total: number; filtered: number }
type OpeningsInput = { tokenConfigured: boolean; loading: boolean }

export function reviewStage({ ply, running, reviewed, playing }: ReviewInput): ReviewStage {
  if (playing) return 'playing'
  if (running) return 'running'
  if (reviewed) return 'reviewed'
  if (ply <= 0) return 'empty-game'
  return 'ready'
}

export function libraryStage({ total, filtered }: LibraryInput): LibraryStage {
  if (total === 0) return 'empty'
  if (filtered === 0) return 'no-results'
  return 'ready'
}

export function openingsStage({ tokenConfigured, loading }: OpeningsInput): OpeningsStage {
  if (loading) return 'loading'
  if (!tokenConfigured) return 'no-token'
  return 'ready'
}
