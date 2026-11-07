import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { gradeMeta, summarizeMoves, type SideSummary } from '@shared/review'
import runReview, { reviewSettings, reviewWorkload, type ReviewProgress } from '../engine/reviewJob.ts'
import SearchQueue from '../engine/searchQueue.ts'
import { buildGraph, type EvaluationParts, type GraphPoint, type LinesByFen, type ReviewScope } from '../chess/review.ts'
import type { EngineSettings, EngineSource } from '@shared/engine'
import type { MoveEvaluation, ReviewGrade } from '@shared/review'
import type { Tree } from '../chess/tree.ts'

export type KeyMoment = {
  nodeId: string
  ply: number
  san: string
  color: 'w' | 'b'
  grade: ReviewGrade
  accuracy: number
  beforeLabel: string
  afterLabel: string
}

type Props = {
  tree: Tree
  rootId: string
  source: EngineSource
  settings: EngineSettings
  pauseLiveAnalysis: () => void
}

export default function useReview({ tree, rootId, source, settings, pauseLiveAnalysis }: Props) {
  const [scope, setScope] = useState<ReviewScope>('line')
  const [depth, setDepth] = useState(12)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<ReviewProgress>({ done: 0, total: 0 })
  const [lines, setLines] = useState<LinesByFen>(() => new Map())
  const [results, setResults] = useState<Record<string, EvaluationParts>>({})
  const [error, setError] = useState<string | null>(null)

  const stopRef = useRef(false)
  const queueRef = useRef<SearchQueue | null>(null)

  useEffect(() => {
    return () => {
      stopRef.current = true
      queueRef.current?.stop()
    }
  }, [])

  const start = useCallback(async () => {
    if (running) return

    pauseLiveAnalysis()
    setError(null)
    setResults({})
    setLines(new Map())
    setProgress({ done: 0, total: 0 })
    stopRef.current = false
    setRunning(true)

    const queue = new SearchQueue(source, reviewSettings(depth, settings))
    queueRef.current = queue

    try {
      const outcome = await runReview(
        queue,
        tree,
        rootId,
        scope,
        (next, snapshot) => {
          setProgress(next)
          setLines(new Map(snapshot.lines))
          setResults({ ...snapshot.results })
        },
        () => stopRef.current
      )

      if (outcome.cancelled) setError('Review stopped before the last position was searched.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Review failed')
    } finally {
      queue.dispose()
      queueRef.current = null
      setRunning(false)
    }
  }, [depth, pauseLiveAnalysis, rootId, running, scope, settings, source, tree])

  const stop = useCallback(() => {
    stopRef.current = true
    queueRef.current?.stop()
  }, [])

  const clear = useCallback(() => {
    stopRef.current = true
    queueRef.current?.stop()
    setResults({})
    setLines(new Map())
    setError(null)
    setProgress({ done: 0, total: 0 })
  }, [])

  const workload = useMemo(() => reviewWorkload(tree, rootId, scope), [rootId, scope, tree])

  const graph = useMemo<GraphPoint[]>(() => buildGraph(tree, rootId, lines, results), [lines, results, rootId, tree])

  const summaries = useMemo<{ white: SideSummary; black: SideSummary }>(() => {
    const byColor: Record<'w' | 'b', MoveEvaluation[]> = { w: [], b: [] }
    for (const [nodeId, review] of Object.entries(results)) {
      const node = tree[nodeId]
      if (node?.color) byColor[node.color].push(review)
    }
    return { white: summarizeMoves(byColor.w), black: summarizeMoves(byColor.b) }
  }, [results, tree])

  const keyMoments = useMemo<KeyMoment[]>(() => {
    const moments: KeyMoment[] = []
    for (const [nodeId, review] of Object.entries(results)) {
      const node = tree[nodeId]
      if (!node?.san || !node.color || !gradeMeta[review.grade].notable) continue
      moments.push({
        nodeId,
        ply: node.ply,
        san: node.san,
        color: node.color,
        grade: review.grade,
        accuracy: review.accuracy,
        beforeLabel: review.beforeLabel,
        afterLabel: review.afterLabel
      })
    }
    return moments.sort((a, b) => a.ply - b.ply)
  }, [results, tree])

  const reviewed = Object.keys(results).length > 0

  return { scope, setScope, depth, setDepth, running, start, stop, clear, progress, workload, graph, summaries, keyMoments, results, reviewed, error }
}
