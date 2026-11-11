import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ExplorerResult } from '@shared/openings'
import type { Tree, TreeNode } from '../chess/tree.ts'
import type { ChessGame } from './useChessGame.ts'

function cleanError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '')
}

function lineUcis(tree: Tree, rootId: string, currentId: string): string[] {
  const ucis: string[] = []
  let id: string | null = currentId
  while (id && id !== rootId) {
    const node: TreeNode | undefined = tree[id]
    if (!node) break
    if (node.from && node.to) ucis.push(node.from + node.to + (node.promotion ?? ''))
    id = node.parentId
  }
  return ucis.reverse()
}

export default function useOpenings(game: ChessGame, enabled: boolean) {
  const [hasToken, setHasToken] = useState<boolean | null>(null)
  const [result, setResult] = useState<ExplorerResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef(0)

  const refreshToken = useCallback(async () => {
    try {
      setHasToken((await window.studio.openings.tokenState()).hasToken)
    } catch {
      setHasToken(false)
    }
  }, [])

  useEffect(() => {
    void refreshToken()
  }, [refreshToken])

  const rootFen = game.tree[game.rootId].fen
  const play = useMemo(() => lineUcis(game.tree, game.rootId, game.currentId), [game.tree, game.rootId, game.currentId])

  const refresh = useCallback(async () => {
    const request = ++requestRef.current
    if (!hasToken) {
      setResult(null)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const next = await window.studio.openings.query({ fen: rootFen, play })
      if (request !== requestRef.current) return
      setResult(next)
    } catch (caught) {
      if (request !== requestRef.current) return
      setError(cleanError(caught))
      setResult(null)
    } finally {
      if (request === requestRef.current) setLoading(false)
    }
  }, [hasToken, rootFen, play])

  useEffect(() => {
    if (!enabled || !hasToken) return
    const timer = setTimeout(() => void refresh(), 350)
    return () => clearTimeout(timer)
  }, [enabled, hasToken, refresh])

  const setToken = useCallback(
    async (token: string) => {
      const state = await window.studio.openings.setToken(token)
      setHasToken(state.hasToken)
      setError(null)
    },
    []
  )

  const clearToken = useCallback(async () => {
    const state = await window.studio.openings.clearToken()
    setHasToken(state.hasToken)
    setResult(null)
    setError(null)
  }, [])

  return { hasToken, result, loading, error, refresh, setToken, clearToken, refreshToken }
}

export type Openings = ReturnType<typeof useOpenings>