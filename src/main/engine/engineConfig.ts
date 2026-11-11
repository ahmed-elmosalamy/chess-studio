import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { defaultEngineSettings, type EngineSettings, type EngineSource } from '../../shared/engine.ts'

export type EngineConfig = {
  source: EngineSource
  path: string | null
  settings: EngineSettings
}

export const defaultEngineConfig: EngineConfig = {
  source: 'wasm',
  path: null,
  settings: defaultEngineSettings
}

export function normalizeEngineConfig(raw: Partial<EngineConfig> | null | undefined): EngineConfig {
  const source: EngineSource = raw?.source === 'native' ? 'native' : 'wasm'
  const path = typeof raw?.path === 'string' && raw.path ? raw.path : null
  const settings = { ...defaultEngineSettings, ...(raw?.settings ?? {}) }
  return { source, path, settings }
}

export function readEngineConfig(file: string): EngineConfig {
  try {
    return normalizeEngineConfig(JSON.parse(readFileSync(file, 'utf-8')) as Partial<EngineConfig>)
  } catch {
    return normalizeEngineConfig(null)
  }
}

export function writeEngineConfig(file: string, config: EngineConfig): string | null {
  const temp = `${file}.tmp`
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(temp, JSON.stringify(config, null, 2), 'utf-8')
    renameSync(temp, file)
    return null
  } catch (error) {
    try {
      rmSync(temp, { force: true })
    } catch {
      /* leave the stray file behind rather than mask the original failure */
    }
    return error instanceof Error ? error.message : 'could not write engine config'
  }
}

export function migrateEngineConfig(legacy: string, target: string): boolean {
  if (existsSync(target) || !existsSync(legacy)) return false
  return writeEngineConfig(target, readEngineConfig(legacy)) === null
}
