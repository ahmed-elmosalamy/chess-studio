import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { DEFAULT_AI_SETTINGS, normaliseAiSettings, type AiSettings } from '../../shared/ai.ts'
import { quarantine } from '../quarantine.ts'

export type AiCrypto = {
  available: () => boolean
  encrypt: (value: string) => string
  decrypt: (value: string) => string
}

export type AiSettingsStore = {
  key: () => Promise<string>
  setKey: (value: string) => Promise<void>
  settings: () => Promise<AiSettings>
  setSettings: (patch: Partial<AiSettings>) => Promise<AiSettings>
}

type AiKeySlot = { value: string; encrypted: boolean }
type AiRecord = { key?: string; keyEncrypted?: boolean; keys?: Record<string, AiKeySlot>; settings?: unknown }

export async function fileCrypto(): Promise<AiCrypto> {
  const { safeStorage } = await import('electron')
  const available = (): boolean => {
    try {
      return safeStorage.isEncryptionAvailable()
    } catch {
      return false
    }
  }
  return {
    available,
    encrypt: (value) => safeStorage.encryptString(value).toString('base64'),
    decrypt: (value) => {
      try {
        return safeStorage.decryptString(Buffer.from(value, 'base64'))
      } catch {
        return ''
      }
    }
  }
}

const passthroughCrypto: AiCrypto = { available: () => false, encrypt: (value) => value, decrypt: (value) => value }

export function settingsFileFor(userData: string): string {
  return join(userData, 'ai.json')
}

export function createAiSettings(file: string, crypto: AiCrypto = passthroughCrypto): AiSettingsStore {
  const readRecord = async (): Promise<AiRecord> => {
    let raw: string
    try {
      raw = await readFile(file, 'utf8')
    } catch {
      return {}
    }
    try {
      return JSON.parse(raw) as AiRecord
    } catch (error) {
      await quarantine(file, error)
      return {}
    }
  }

  const writeRecord = async (value: AiRecord): Promise<void> => {
    await mkdir(dirname(file), { recursive: true })
    const temp = `${file}.tmp`
    await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    await rename(temp, file)
  }

  const readSettings = async (): Promise<AiSettings> => normaliseAiSettings((await readRecord()).settings ?? DEFAULT_AI_SETTINGS)

  /* Older records hold a single OpenRouter key; it becomes that provider's slot on the next write. */
  const slotsOf = (record: AiRecord): Record<string, AiKeySlot> => {
    const slots = { ...record.keys }
    if (typeof record.key === 'string' && record.key && !slots.openrouter) {
      slots.openrouter = { value: record.key, encrypted: record.keyEncrypted === true }
    }
    return slots
  }

  const readSlot = (record: AiRecord, provider: string): string => {
    const slot = slotsOf(record)[provider]
    if (!slot || !slot.value) return ''
    return slot.encrypted ? crypto.decrypt(slot.value) : slot.value
  }

  /* The legacy plaintext fields are folded into keys on write so they are not left on disk. */
  const withoutLegacy = (record: AiRecord): AiRecord => {
    const rest: AiRecord = { ...record }
    delete rest.key
    delete rest.keyEncrypted
    return rest
  }

  return {
    key: async () => readSlot(await readRecord(), (await readSettings()).provider),
    setKey: async (value) => {
      const clean = value.trim()
      const record = await readRecord()
      const provider = normaliseAiSettings(record.settings ?? DEFAULT_AI_SETTINGS).provider
      const slots = slotsOf(record)
      if (!clean) delete slots[provider]
      else slots[provider] = { value: crypto.available() ? crypto.encrypt(clean) : clean, encrypted: crypto.available() }
      await writeRecord({ ...withoutLegacy(record), keys: slots })
    },
    settings: readSettings,
    setSettings: async (patch) => {
      const next = normaliseAiSettings({ ...(await readSettings()), ...patch })
      const record = await readRecord()
      await writeRecord({ ...withoutLegacy(record), keys: slotsOf(record), settings: next })
      return next
    }
  }
}
