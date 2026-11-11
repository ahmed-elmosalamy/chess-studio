import { rename } from 'node:fs/promises'

/* Keep the unreadable file for forensics instead of overwriting the user's data on the next save. */
export async function quarantine(file: string, reason: unknown): Promise<void> {
  const target = `${file}.corrupt-${Date.now()}`
  try {
    await rename(file, target)
    console.error(`[store] quarantined ${file} -> ${target}:`, reason)
  } catch (error) {
    console.error(`[store] could not quarantine ${file}:`, error, reason)
  }
}
