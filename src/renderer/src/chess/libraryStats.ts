import type { LibraryEntry } from '@shared/library'

export type SideRecord = { wins: number; draws: number; losses: number; games: number; score: number }
export type OpeningFamily = SideRecord & { family: string }
export type EloBucket = { label: string; min: number; max: number | null; count: number }
export type RecentForm = { games: number; score: number; results: ('W' | 'D' | 'L')[] }

export type LibraryStats = {
  byColor: { white: SideRecord; black: SideRecord }
  byOpeningFamily: OpeningFamily[]
  eloBuckets: EloBucket[]
  recentForm: RecentForm
}

type Outcome = 'W' | 'D' | 'L'

const ELO_EDGES: { label: string; min: number; max: number | null }[] = [
  { label: '<1000', min: 0, max: 999 },
  { label: '1000-1199', min: 1000, max: 1199 },
  { label: '1200-1399', min: 1200, max: 1399 },
  { label: '1400-1599', min: 1400, max: 1599 },
  { label: '1600-1799', min: 1600, max: 1799 },
  { label: '1800-1999', min: 1800, max: 1999 },
  { label: '2000-2199', min: 2000, max: 2199 },
  { label: '2200+', min: 2200, max: null }
]

const RECENT_LIMIT = 10

function outcomeOf(result: string, color: 'w' | 'b'): Outcome | null {
  if (result === '1/2-1/2' || result === '½-½') return 'D'
  if (result === '1-0') return color === 'w' ? 'W' : 'L'
  if (result === '0-1') return color === 'w' ? 'L' : 'W'
  return null
}

function emptyRecord(): SideRecord {
  return { wins: 0, draws: 0, losses: 0, games: 0, score: 0 }
}

function addOutcome(record: SideRecord, outcome: Outcome): void {
  if (outcome === 'W') record.wins += 1
  else if (outcome === 'D') record.draws += 1
  else record.losses += 1
  record.games += 1
  record.score = Math.round(((record.wins + record.draws / 2) / record.games) * 1000) / 10
}

function familyOf(entry: LibraryEntry): string {
  const eco = entry.eco?.trim()
  if (eco) return eco
  const words = entry.opening
    ?.trim()
    .split(/\s+/)
    .map((word) => word.replace(/[,:;.]+$/, ''))
    .filter(Boolean) ?? []
  if (words.length > 0) return words.slice(0, 2).join(' ')
  return 'Unknown'
}

export function libraryStats(entries: LibraryEntry[]): LibraryStats {
  const white = emptyRecord()
  const black = emptyRecord()
  const families = new Map<string, OpeningFamily>()
  const eloBuckets: EloBucket[] = ELO_EDGES.map((edge) => ({ ...edge, count: 0 }))
  const recent: { savedAt: number; outcome: Outcome }[] = []

  for (const entry of entries) {
    const whiteOutcome = outcomeOf(entry.result, 'w')
    const blackOutcome = outcomeOf(entry.result, 'b')

    if (whiteOutcome) addOutcome(white, whiteOutcome)
    if (blackOutcome) addOutcome(black, blackOutcome)

    if (whiteOutcome) {
      const family = familyOf(entry)
      const record = families.get(family) ?? { family, ...emptyRecord() }
      addOutcome(record, whiteOutcome)
      families.set(family, record)
      recent.push({ savedAt: entry.savedAt, outcome: whiteOutcome })
    }

    for (const elo of [entry.whiteElo, entry.blackElo]) {
      if (elo === undefined) continue
      const bucket = eloBuckets.find((edge) => elo >= edge.min && (edge.max === null || elo <= edge.max))
      if (bucket) bucket.count += 1
    }
  }

  const latest = recent
    .slice()
    .sort((a, b) => a.savedAt - b.savedAt)
    .slice(-RECENT_LIMIT)

  const recentRecord = emptyRecord()
  for (const game of latest) addOutcome(recentRecord, game.outcome)

  return {
    byColor: { white, black },
    byOpeningFamily: [...families.values()].sort((a, b) => b.games - a.games || a.family.localeCompare(b.family)),
    eloBuckets,
    recentForm: { games: recentRecord.games, score: recentRecord.score, results: latest.map((game) => game.outcome) }
  }
}
