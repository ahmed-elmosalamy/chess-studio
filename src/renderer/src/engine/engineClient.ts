import type { EngineRunState, EngineSettings, EvalLine } from '@shared/engine'

export type EngineEvents = {
  onLine: (line: EvalLine) => void
  onBest: (move: string) => void
  onState: (state: EngineRunState, name: string, error: string | null) => void
}

export type EngineClient = {
  analyze: (fen: string, settings: EngineSettings, epoch: number) => void
  stop: () => void
  dispose: () => void
}
