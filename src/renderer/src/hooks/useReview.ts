import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import { asAiError } from '@shared/ai'
import { explainMove, gradeMeta, summarizeMoves, type BlunderFacts, type ExplanationKind, type SideSummary } from '@shared/review'
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
  liveAnalysisOn: boolean
  pauseLiveAnalysis: () => void
  resumeLiveAnalysis: () => void
}

export default function useReview({ tree, rootId, source, settings, liveAnalysisOn, pauseLiveAnalysis, resumeLiveAnalysis }: Props) {
  const [scope, setScope] = useState<ReviewScope>('line')
  const [depth, setDepth] = useState(12)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<ReviewProgress>({ done: 0, total: 0 })
  const [lines, setLines] = useState<LinesByFen>(() => new Map())
  const [results, setResults] = useState<Record<string, EvaluationParts>>({})
  const [error, setError] = useState<string | null>(null)
  const [arrowsOn, setArrowsOn] = useState(true)
  const [explainOn, setExplainOn] = useState(false)
  const [aiText, setAiText] = useState<Record<string, string>>({})
  const [aiBusy, setAiBusy] = useState<Record<string, boolean>>({})
  const [aiError, setAiError] = useState<Record<string, string>>({})

  const stopRef = useRef(false)
  const queueRef = useRef<SearchQueue | null>(null)

  const resetAi = useCallback(() => {
    setAiText({})
    setAiBusy({})
    setAiError({})
  }, [])

  useEffect(() => {
    return () => {
      stopRef.current = true
      queueRef.current?.stop()
    }
  }, [])

  const start = useCallback(async () => {
    if (running) return

    const wasLive = liveAnalysisOn
    pauseLiveAnalysis()
    setError(null)
    setResults({})
    setLines(new Map())
    setProgress({ done: 0, total: 0 })
    resetAi()
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
      if (wasLive) resumeLiveAnalysis()
    }
  }, [depth, liveAnalysisOn, pauseLiveAnalysis, resetAi, resumeLiveAnalysis, rootId, running, scope, settings, source, tree])

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
    resetAi()
  }, [resetAi])

  const toggleArrows = useCallback(() => setArrowsOn((on) => !on), [])
  const toggleExplain = useCallback(() => setExplainOn((on) => !on), [])

  useEffect(() => {
    setResults({})
    setLines(new Map())
    setError(null)
    setProgress({ done: 0, total: 0 })
    resetAi()
  }, [resetAi, rootId])

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

  const momentFacts = useCallback(
    (nodeId: string): (BlunderFacts & { kind: ExplanationKind }) | null => {
      const node = tree[nodeId]
      const result = results[nodeId]
      if (!node?.san || !node.parentId || !result) return null
      if (result.grade !== 'blunder' && result.grade !== 'brilliant') return null
      const parentFen = tree[node.parentId].fen
      const searched = lines.get(parentFen)
      const top = searched?.find((line) => line.multipv === 1) ?? searched?.[0]
      const best = top?.pv?.[0]
      let bestSan: string | null = null
      if (best && best.length >= 4) {
        try {
          bestSan = new Chess(parentFen).move({ from: best.slice(0, 2), to: best.slice(2, 4), promotion: best.slice(4, 5) || undefined })?.san ?? null
        } catch {
          bestSan = null
        }
      }
      return {
        playedSan: node.san,
        bestSan,
        loss: result.loss,
        beforeLabel: result.beforeLabel,
        afterLabel: result.afterLabel,
        kind: result.grade === 'brilliant' ? 'brilliant' : 'blunder'
      }
    },
    [lines, results, tree]
  )

  const explanations = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    for (const [nodeId, result] of Object.entries(results)) {
      if (result.grade !== 'blunder' && result.grade !== 'brilliant') continue
      const facts = momentFacts(nodeId)
      if (facts) map[nodeId] = explainMove(facts)
    }
    return map
  }, [momentFacts, results])

  const explainWithAi = useCallback(
    async (nodeId: string) => {
      const node = tree[nodeId]
      const facts = momentFacts(nodeId)
      if (!node?.parentId || !facts) return
      setAiBusy((busy) => ({ ...busy, [nodeId]: true }))
      setAiError((errors) => ({ ...errors, [nodeId]: '' }))
      try {
        const answer = await window.studio.ai.explain({ fen: tree[node.parentId].fen, ...facts })
        setAiText((texts) => ({ ...texts, [nodeId]: answer.text }))
      } catch (error) {
        const ai = asAiError(error)
        setAiError((errors) => ({ ...errors, [nodeId]: ai?.message ?? 'AI explanation failed.' }))
      } finally {
        setAiBusy((busy) => ({ ...busy, [nodeId]: false }))
      }
    },
    [momentFacts, tree]
  )

  const reviewed = Object.keys(results).length > 0

  return {
    scope,
    setScope,
    depth,
    setDepth,
    running,
    start,
    stop,
    clear,
    progress,
    workload,
    graph,
    summaries,
    keyMoments,
    results,
    reviewed,
    error,
    lines,
    arrowsOn,
    toggleArrows,
    explainOn,
    toggleExplain,
    explanations,
    aiText,
    aiBusy,
    aiError,
    explainWithAi
  }
}
