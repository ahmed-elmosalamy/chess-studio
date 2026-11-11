import type { WorkspaceId } from '../components/NavRail.tsx'

export type PanelKind = 'evalBar' | 'graph' | 'moveList'
export type WorkspaceLayout = Record<PanelKind, boolean>

const BOARD_ONLY: WorkspaceLayout = { evalBar: false, graph: false, moveList: true }
const ANALYSIS: WorkspaceLayout = { evalBar: true, graph: false, moveList: true }
const DEFAULT_LAYOUT: WorkspaceLayout = ANALYSIS

const LAYOUTS: Record<WorkspaceId, WorkspaceLayout> = {
  review: { evalBar: true, graph: true, moveList: true },
  play: BOARD_ONLY,
  analysis: ANALYSIS,
  study: BOARD_ONLY,
  trainer: BOARD_ONLY,
  books: BOARD_ONLY,
  library: BOARD_ONLY,
  openings: BOARD_ONLY,
  settings: { evalBar: false, graph: false, moveList: false }
}

export function layoutFor(workspace: string): WorkspaceLayout {
  return LAYOUTS[workspace as WorkspaceId] ?? DEFAULT_LAYOUT
}

export function parseRailPreference(raw: string | null): boolean {
  return raw !== 'closed'
}
