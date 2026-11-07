export type ScoreType = 'cp' | 'mate'

export type EngineScore = { type: ScoreType; value: number }

export type EvalLine = {
  multipv: number
  depth: number
  seldepth: number
  score: EngineScore
  nodes: number
  nps: number
  time: number
  pv: string[]
}

export type EngineSource = 'wasm' | 'native'

export type EngineSettings = {
  multipv: number
  threads: number
  hash: number
  depth: number
}

export type EngineRunState = 'idle' | 'starting' | 'searching' | 'ready' | 'error'

export type EngineStatus = {
  state: EngineRunState
  source: EngineSource
  name: string
  error: string | null
}

export type NativeEngineInfo = {
  path: string | null
  exists: boolean
  name: string
  state: EngineRunState
  error: string | null
  source: EngineSource
  settings: EngineSettings
}

export const defaultEngineSettings: EngineSettings = { multipv: 3, threads: 4, hash: 256, depth: 18 }

export const EngineChannel = {
  Analyze: 'engine:analyze',
  Stop: 'engine:stop',
  SetSettings: 'engine:set-settings',
  SetSource: 'engine:set-source',
  PickPath: 'engine:pick-path',
  NativeStatus: 'engine:native-status',
  Line: 'engine:line',
  Best: 'engine:best',
  Status: 'engine:status'
} as const

export type AnalyzeRequest = { epoch: number; fen: string; source: EngineSource; settings: EngineSettings }

export type EngineStatusPayload = { kind: 'line'; epoch: number; line: EvalLine } | { kind: 'best'; epoch: number; move: string } | { kind: 'status'; status: EngineStatus }
