import { AI_PROVIDERS, providerForBaseUrl, type AiProviderId } from './aiProviders.ts'

export const AiChannel = {
  State: 'ai:state',
  SetKey: 'ai:set-key',
  ClearKey: 'ai:clear-key',
  SetSettings: 'ai:set-settings',
  Models: 'ai:models',
  ReadPages: 'ai:read-pages',
  Explain: 'ai:explain'
} as const

export type AiKind = 'structure' | 'detail' | 'diagram'

export type AiSettings = { provider: AiProviderId; baseUrl: string; model: string; pagesPerRun: number }

export const DEFAULT_AI_SETTINGS: AiSettings = {
  provider: 'openrouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  model: '',
  pagesPerRun: 100
}

const MAX_PAGES_PER_RUN = 1000

export function normaliseAiSettings(value: unknown): AiSettings {
  const input = value && typeof value === 'object' ? (value as Partial<AiSettings>) : {}
  const baseUrl = typeof input.baseUrl === 'string' && /^https?:\/\//.test(input.baseUrl.trim()) ? input.baseUrl.trim().replace(/\/+$/, '') : DEFAULT_AI_SETTINGS.baseUrl
  const known = AI_PROVIDERS.some((preset) => preset.id === input.provider)
  const provider = known ? (input.provider as AiProviderId) : providerForBaseUrl(baseUrl)
  const model = typeof input.model === 'string' ? input.model.trim().slice(0, 120) : ''
  const pagesPerRun = Number.isFinite(input.pagesPerRun) ? Math.min(MAX_PAGES_PER_RUN, Math.max(1, Math.round(input.pagesPerRun as number))) : DEFAULT_AI_SETTINGS.pagesPerRun
  return { provider, baseUrl, model, pagesPerRun }
}

export type AiState = { hasKey: boolean; settings: AiSettings }
export type AiModel = { id: string; label: string; free: boolean; vision: boolean }
export type AiImage = { page: number; jpeg: string }
export type AiRequest = { kind: AiKind; images: AiImage[] }

export type AiErrorKind = 'no-key' | 'no-model' | 'unauthorized' | 'quota' | 'offline' | 'bad-response'

export class AiError extends Error {
  readonly kind: AiErrorKind

  constructor(kind: AiErrorKind, message: string) {
    super(message)
    this.name = 'AiError'
    this.kind = kind
  }
}

const AI_KINDS: AiErrorKind[] = ['no-key', 'no-model', 'unauthorized', 'quota', 'offline', 'bad-response']

/** IPC hands the renderer a plain Error, so the kind is recovered from the "kind: message" text the main process wrote. */
export function asAiError(error: unknown): AiError | null {
  if (error instanceof AiError) return error
  const message = error instanceof Error ? error.message : String(error)
  for (const kind of AI_KINDS) {
    const at = message.indexOf(`${kind}: `)
    if (at >= 0) return new AiError(kind, message.slice(at + kind.length + 2).trim())
  }
  return null
}

export type AiRawBlock = {
  kind: string
  text?: string
  level?: number
  fen?: string
  caption?: string
  moves?: string[]
  /** Diagram edges as fractions of the page: [left, top, right, bottom] in 0..1. */
  box?: number[]
}

export type AiChapterHint = { title: string; level: number; page: number }

export type AiRawPage = {
  page: number
  blocks?: AiRawBlock[]
  chapters?: { title?: unknown; level?: unknown }[]
  examples?: { label?: unknown }[]
}

export type AiResponse = { pages: AiRawPage[]; model: string; ms: number; tokens: number }

/** One reviewed move plus the engine facts the coach must ground its answer in. */
export type AiExplainRequest = {
  fen: string
  playedSan: string
  bestSan: string | null
  beforeLabel: string
  afterLabel: string
  loss: number
  kind?: 'blunder' | 'brilliant'
}

export type AiExplainResponse = { text: string; model: string; ms: number; tokens: number }
