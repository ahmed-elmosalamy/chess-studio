import { gradeMeta, reviewOrder } from '@shared/review'
import type { GradeCounts, ReviewGrade, SideSummary } from '@shared/review'
import { phaseAccuracy } from '../chess/phases.ts'
import type { PhaseAccuracy } from '../chess/phases.ts'
import type { EvaluationParts, GraphPoint } from '../chess/review.ts'
import type { Tree } from '../chess/tree.ts'

export type ReportMomentInput = {
  ply: number
  san: string
  color: 'w' | 'b'
  grade: ReviewGrade
  nodeId?: string
  accuracy?: number
  beforeLabel?: string
  afterLabel?: string
}

export type ReportMoment = { ply: number; san: string; color: 'w' | 'b'; grade: ReviewGrade; label: string }

export type ReportModel = {
  title: string
  players: { white: string; black: string }
  result: string
  date: string | null
  accuracy: { white: number; black: number }
  acpl: { white: number | null; black: number | null }
  phases: PhaseAccuracy
  gradeCounts: { white: GradeCounts; black: GradeCounts }
  moments: ReportMoment[]
  sparkline: number[]
}

export type BuildReportInput = {
  headers: Record<string, string>
  tree: Tree
  rootId: string
  results: Record<string, EvaluationParts>
  summaries: { white: SideSummary; black: SideSummary }
  keyMoments: ReportMomentInput[]
  graph: GraphPoint[]
}

const MOMENT_PRIORITY: ReviewGrade[] = ['blunder', 'missedWin', 'mistake', 'brilliant', 'great', 'inaccuracy']
const MOMENT_LIMIT = 5
const SPARK_LIMIT = 80

export function buildReportModel({ headers, tree, results, summaries, keyMoments, graph }: BuildReportInput): ReportModel {
  const white = headers.White?.trim() || 'White'
  const black = headers.Black?.trim() || 'Black'

  return {
    title: `${white} vs ${black}`,
    players: { white, black },
    result: headers.Result?.trim() || '*',
    date: headers.Date?.trim() || null,
    accuracy: { white: summaries.white.accuracy, black: summaries.black.accuracy },
    acpl: { white: summaries.white.acpl, black: summaries.black.acpl },
    phases: phaseAccuracy(results, tree, 0),
    gradeCounts: { white: summaries.white.counts, black: summaries.black.counts },
    moments: rankMoments(keyMoments),
    sparkline: downsample(graph, SPARK_LIMIT)
  }
}

/** Worst grades first so the card always leads with what cost the game, then chronology inside a grade. */
function rankMoments(moments: ReportMomentInput[]): ReportMoment[] {
  return moments
    .map((moment) => ({
      ply: moment.ply,
      san: moment.san,
      color: moment.color,
      grade: moment.grade,
      label: gradeMeta[moment.grade].label
    }))
    .sort((a, b) => MOMENT_PRIORITY.indexOf(a.grade) - MOMENT_PRIORITY.indexOf(b.grade) || a.ply - b.ply)
    .slice(0, MOMENT_LIMIT)
}

function downsample(graph: GraphPoint[], limit: number): number[] {
  if (graph.length === 0) return []
  if (graph.length <= limit) return graph.map((point) => point.whiteChance)
  return Array.from({ length: limit }, (_, index) => {
    const source = Math.round((index * (graph.length - 1)) / (limit - 1))
    return graph[source].whiteChance
  })
}

const GRADE_COLORS: Record<ReviewGrade, string> = {
  book: '#9ca3af',
  brilliant: '#22d3ee',
  great: '#34d399',
  best: '#4ade80',
  excellent: '#a3e635',
  good: '#94a3b8',
  inaccuracy: '#fbbf24',
  mistake: '#fb923c',
  blunder: '#f87171',
  missedWin: '#f472b6'
}

const INK = '#e5e7eb'
const MUTED = '#94a3b8'
const PANEL = '#1e293b'
const ACCENT = '#38bdf8'

type Ctx = CanvasRenderingContext2D

function text(ctx: Ctx, value: string, x: number, y: number, font: string, color: string = INK, align: CanvasTextAlign = 'left'): void {
  ctx.font = font
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(value, x, y)
}

function panel(ctx: Ctx, x: number, y: number, width: number, height: number): void {
  ctx.fillStyle = PANEL
  ctx.fillRect(x, y, width, height)
}

export function drawReportCard(ctx: Ctx, model: ReportModel, size: { width: number; height: number; dpr: number }): void {
  const width = size.width
  const height = size.height

  ctx.scale(size.dpr, size.dpr)

  ctx.fillStyle = '#0b1220'
  ctx.fillRect(0, 0, width, height)

  ctx.fillStyle = ACCENT
  ctx.fillRect(0, 0, width, 12)

  text(ctx, model.title, 64, 104, 'bold 52px system-ui, sans-serif')
  const subtitle = model.date ? `${model.result} · ${model.date}` : model.result
  text(ctx, subtitle, 64, 148, '28px system-ui, sans-serif', MUTED)

  ctx.fillStyle = '#1f2937'
  ctx.fillRect(64, 186, width - 128, 2)

  accuracyBlock(ctx, 'White', model.players.white, model.accuracy.white, model.acpl.white, 64, 226, 512)
  accuracyBlock(ctx, 'Black', model.players.black, model.accuracy.black, model.acpl.black, 624, 226, 512)

  text(ctx, 'Accuracy by phase', 64, 468, 'bold 32px system-ui, sans-serif')
  const phaseRows = phaseLines(model.phases)
  phaseRows.forEach((row, index) => {
    const y = 512 + index * 40
    text(ctx, row.side, 64, y, '26px system-ui, sans-serif', MUTED)
    text(ctx, row.phase, 240, y, '26px system-ui, sans-serif')
    text(ctx, row.detail, width - 64, y, '26px system-ui, sans-serif', row.side === 'White' ? INK : MUTED, 'right')
  })

  text(ctx, 'Move grades', 64, 736, 'bold 32px system-ui, sans-serif')
  gradeColumn(ctx, 'White', model.gradeCounts.white, 64, 782)
  gradeColumn(ctx, 'Black', model.gradeCounts.black, 624, 782)

  text(ctx, 'Key moments', 64, 1010, 'bold 32px system-ui, sans-serif')
  model.moments.forEach((moment, index) => {
    const y = 1054 + index * 44
    text(ctx, `${moment.ply}. ${moment.san}`, 64, y, '28px system-ui, sans-serif')
    text(ctx, moment.color === 'w' ? 'White' : 'Black', 300, y, '24px system-ui, sans-serif', MUTED)
    text(ctx, moment.label, width - 64, y, '26px system-ui, sans-serif', GRADE_COLORS[moment.grade], 'right')
  })

  text(ctx, 'Evaluation', 64, 1300, 'bold 32px system-ui, sans-serif')
  sparkline(ctx, model.sparkline, 64, 1330, width - 128, 190)

  text(ctx, 'Generated by Chess Studio', 64, height - 40, '22px system-ui, sans-serif', MUTED)
}

function accuracyBlock(ctx: Ctx, side: string, player: string, accuracy: number, acpl: number | null, x: number, y: number, width: number): void {
  panel(ctx, x, y, width, 200)
  text(ctx, side, x + 28, y + 44, '24px system-ui, sans-serif', MUTED)
  text(ctx, player, x + 28, y + 78, 'bold 30px system-ui, sans-serif')
  text(ctx, `${accuracy}%`, x + 28, y + 168, 'bold 64px system-ui, sans-serif', ACCENT)
  text(ctx, acpl === null ? '–' : `ACPL ${acpl}`, x + width - 28, y + 168, '26px system-ui, sans-serif', MUTED, 'right')
}

function phaseLines(phases: PhaseAccuracy): { side: string; phase: string; detail: string }[] {
  const lines: { side: string; phase: string; detail: string }[] = []
  for (const [side, label] of [['white', 'White'], ['black', 'Black']] as const) {
    for (const phase of ['opening', 'middlegame', 'endgame'] as const) {
      const stats = phases[side][phase]
      if (!stats) continue
      const plies = `${stats.plies} ${stats.plies === 1 ? 'move' : 'moves'}`
      const acpl = stats.acpl === null ? '' : ` · ACPL ${stats.acpl}`
      lines.push({ side: label, phase: `${phase[0].toUpperCase()}${phase.slice(1)}`, detail: `${stats.accuracy}% · ${plies}${acpl}` })
    }
  }
  return lines
}

function gradeColumn(ctx: Ctx, side: string, counts: GradeCounts, x: number, y: number): void {
  text(ctx, side, x, y, '24px system-ui, sans-serif', MUTED)
  const grades = reviewOrder.filter((grade) => grade !== 'book' && counts[grade] > 0)
  if (grades.length === 0) {
    text(ctx, 'No graded moves', x, y + 40, '24px system-ui, sans-serif', MUTED)
    return
  }

  const max = Math.max(...grades.map((grade) => counts[grade]))
  grades.forEach((grade, index) => {
    const row = y + 36 + index * 34
    text(ctx, gradeMeta[grade].label, x, row, '24px system-ui, sans-serif')
    text(ctx, String(counts[grade]), x + 220, row, '24px system-ui, sans-serif', MUTED)
    ctx.fillStyle = '#334155'
    ctx.fillRect(x + 270, row - 18, 190, 18)
    ctx.fillStyle = GRADE_COLORS[grade]
    ctx.fillRect(x + 270, row - 18, Math.round((counts[grade] / max) * 190), 18)
  })
}

function sparkline(ctx: Ctx, points: number[], x: number, y: number, width: number, height: number): void {
  panel(ctx, x, y, width, height)

  ctx.strokeStyle = '#334155'
  ctx.beginPath()
  ctx.moveTo(x, y + height / 2)
  ctx.lineTo(x + width, y + height / 2)
  ctx.stroke()

  if (points.length === 0) {
    text(ctx, 'No evaluations', x + 24, y + height / 2 + 32, '24px system-ui, sans-serif', MUTED)
    return
  }

  const plotX = x + 24
  const plotY = y + 24
  const plotWidth = width - 48
  const plotHeight = height - 48
  const step = points.length === 1 ? 0 : plotWidth / (points.length - 1)

  ctx.strokeStyle = ACCENT
  ctx.beginPath()
  points.forEach((value, index) => {
    const px = plotX + index * step
    const py = plotY + (1 - Math.min(100, Math.max(0, value)) / 100) * plotHeight
    if (index === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  })
  ctx.stroke()

  text(ctx, 'White %', x + width - 20, y + 30, '20px system-ui, sans-serif', MUTED, 'right')
}
