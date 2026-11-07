import type { ReactNode } from 'react'
import type { Color } from 'chess.js'
import DiagnosticsCard from './DiagnosticsCard.tsx'
import EnginePanel from './EnginePanel.tsx'
import LibraryPanel from './LibraryPanel.tsx'
import OpeningsPanel from './OpeningsPanel.tsx'
import ReviewPanel from './ReviewPanel.tsx'
import SettingsPanel from './SettingsPanel.tsx'
import StudyPanel, { type PaletteSelection } from './StudyPanel.tsx'
import type { WorkspaceId } from './NavRail.tsx'
import type { ChessGame } from '../hooks/useChessGame.ts'
import type { Openings } from '../hooks/useOpenings.ts'
import type { Tablebase } from '../hooks/useTablebase.ts'
import type { Theme } from '../hooks/usePreferences.ts'
import type useEngine from '../hooks/useEngine.ts'
import type useLibrary from '../hooks/useLibrary.ts'
import type useReview from '../hooks/useReview.ts'

type Engine = ReturnType<typeof useEngine>
type Review = ReturnType<typeof useReview>
type Library = ReturnType<typeof useLibrary>

type Props = {
  active: WorkspaceId
  theme: Theme
  onToggleTheme: () => void
  soundEnabled: boolean
  onToggleSound: () => void
  engine: Engine
  review: Review
  library: Library
  openings: Openings
  tablebase: Tablebase
  game: ChessGame
  armed: PaletteSelection | null
  onArm: (selection: PaletteSelection | null) => void
  onPlayMove: (uci: string) => void
  currentPgn: string
  canSave: boolean
  onOpenGame: (pgn: string) => void
  currentId: string
  onNavigate: (nodeId: string) => void
  onWorkspace: (id: WorkspaceId) => void
  fen: string
  turn: Color
}

export default function RightPanel({ active, theme, onToggleTheme, soundEnabled, onToggleSound, engine, review, library, openings, tablebase, game, armed, onArm, onPlayMove, currentPgn, canSave, onOpenGame, currentId, onNavigate, onWorkspace, fen, turn }: Props) {
  const content = (): ReactNode => {
    if (active === 'review') return <ReviewPanel review={review} source={engine.source} currentId={currentId} onNavigate={onNavigate} />
    if (active === 'analysis') return <EnginePanel engine={engine} fen={fen} turn={turn} reviewRunning={review.running} />
    if (active === 'library') return <LibraryPanel library={library} currentPgn={currentPgn} canSave={canSave} onOpenGame={onOpenGame} />
    if (active === 'study') return <StudyPanel game={game} armed={armed} onArm={onArm} tablebase={tablebase} onPlayMove={onPlayMove} />
    if (active === 'openings') return <OpeningsPanel openings={openings} onPlayMove={onPlayMove} onWorkspace={onWorkspace} />
    if (active === 'settings')
      return <SettingsPanel theme={theme} onToggleTheme={onToggleTheme} soundEnabled={soundEnabled} onToggleSound={onToggleSound} engine={engine} openings={openings} onWorkspace={onWorkspace} />
    return null
  }

  return (
    <aside className="flex w-[344px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-line bg-bg p-3">
      {content()}

      <DiagnosticsCard soundEnabled={soundEnabled} engineName={engine.status.name} engineState={engine.status.state} />
    </aside>
  )
}