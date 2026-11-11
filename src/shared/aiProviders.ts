import type { AiSettings } from './ai.ts'

export type AiProviderId = 'openrouter' | 'groq' | 'gemini' | 'nvidia' | 'ollama' | 'custom'

export type AiProviderPreset = {
  id: AiProviderId
  label: string
  baseUrl: string
  defaultModel: string
  visionPattern: string
  keyless: boolean
}

export const AI_PROVIDERS: readonly AiProviderPreset[] = [
  { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', defaultModel: '', visionPattern: '', keyless: false },
  { id: 'groq', label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', defaultModel: 'meta-llama/llama-4-scout-17b-16e-instruct', visionPattern: 'llama-4|vision', keyless: false },
  { id: 'gemini', label: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', defaultModel: 'gemini-3.8-flash', visionPattern: 'gemini', keyless: false },
  { id: 'nvidia', label: 'NVIDIA NIM', baseUrl: 'https://integrate.api.nvidia.com/v1', defaultModel: 'google/gemma-4-31b-it', visionPattern: 'gemma|vision|vl', keyless: false },
  { id: 'ollama', label: 'Local (Ollama)', baseUrl: 'http://localhost:11434/v1', defaultModel: 'qwen2.5vl:7b', visionPattern: 'vl|vision|gemma3|llava', keyless: true },
  { id: 'custom', label: 'Custom URL', baseUrl: '', defaultModel: '', visionPattern: '.', keyless: false }
]

export function presetFor(id: AiProviderId): AiProviderPreset {
  return AI_PROVIDERS.find((preset) => preset.id === id) ?? AI_PROVIDERS[0]
}

export function providerForBaseUrl(baseUrl: string): AiProviderId {
  let host = ''
  try {
    host = new URL(baseUrl).hostname
  } catch {
    return 'custom'
  }
  if (host === 'openrouter.ai' || host.endsWith('.openrouter.ai')) return 'openrouter'
  if (host === 'api.groq.com') return 'groq'
  if (host === 'generativelanguage.googleapis.com') return 'gemini'
  if (host === 'integrate.api.nvidia.com') return 'nvidia'
  return 'custom'
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

export function isKeyless(settings: AiSettings): boolean {
  if (settings.provider === 'ollama') return true
  if (settings.provider !== 'custom') return false
  try {
    return LOOPBACK.has(new URL(settings.baseUrl).hostname)
  } catch {
    return false
  }
}

/** Only OpenRouter understands the reasoning toggle; strict providers reject unknown body fields. */
export function sendsReasoningField(settings: AiSettings): boolean {
  return settings.provider === 'openrouter' || (settings.provider === 'custom' && providerForBaseUrl(settings.baseUrl) === 'openrouter')
}