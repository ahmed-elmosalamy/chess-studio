import type { GameDoc } from './game.ts'
import type { Tree } from './tree.ts'

export const SESSION_KEY = 'studio.session'
export const SESSION_MAX_BYTES = 512 * 1024
const VERSION = 1

type SessionStorage = Pick<Storage, 'getItem' | 'setItem'>

export function serializeSession(doc: GameDoc): string {
  return JSON.stringify({ version: VERSION, tree: doc.tree, rootId: doc.rootId, currentId: doc.currentId, headers: doc.headers })
}

function validTree(value: unknown): value is Tree {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const tree = value as Record<string, unknown>
  for (const [id, node] of Object.entries(tree)) {
    if (!node || typeof node !== 'object') return false
    const candidate = node as Record<string, unknown>
    if (candidate.id !== id) return false
    if (typeof candidate.fen !== 'string' || typeof candidate.ply !== 'number') return false
    if (!Array.isArray(candidate.childIds) || candidate.childIds.some((child) => typeof child !== 'string' || !tree[child])) return false
    if (candidate.parentId !== null && (typeof candidate.parentId !== 'string' || !tree[candidate.parentId])) return false
  }
  return true
}

export function parseSession(raw: string | null): GameDoc | null {
  if (!raw) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null

  const candidate = parsed as Record<string, unknown>
  if (candidate.version !== VERSION) return null
  if (!validTree(candidate.tree)) return null

  const tree = candidate.tree
  const { rootId, currentId } = candidate
  if (typeof rootId !== 'string' || typeof currentId !== 'string') return null
  if (!tree[rootId] || !tree[currentId]) return null
  if (tree[rootId].parentId !== null || tree[rootId].ply !== 0) return null

  const rawHeaders = candidate.headers
  const headers: Record<string, string> = {}
  if (rawHeaders && typeof rawHeaders === 'object' && !Array.isArray(rawHeaders)) {
    for (const [key, value] of Object.entries(rawHeaders)) {
      if (typeof value === 'string') headers[key] = value
    }
  }

  return { tree, rootId, currentId, headers }
}

export function saveSession(doc: GameDoc, storage: SessionStorage): boolean {
  const raw = serializeSession(doc)
  if (raw.length > SESSION_MAX_BYTES) return false
  try {
    storage.setItem(SESSION_KEY, raw)
    return true
  } catch {
    return false
  }
}

export function loadSession(storage: SessionStorage): GameDoc | null {
  let raw: string | null
  try {
    raw = storage.getItem(SESSION_KEY)
  } catch {
    return null
  }
  return parseSession(raw)
}
