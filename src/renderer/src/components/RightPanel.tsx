import type { ReactNode } from 'react'
import type { Color } from 'chess.js'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import EnginePanel from './EnginePanel.tsx'
import LibraryPanel from './LibraryPanel.tsx'
import OpeningsPanel from './OpeningsPanel.tsx'
import PlayPanel from './PlayPanel.tsx'
import ReviewPanel from './ReviewPanel.tsx'
import SettingsPanel from './SettingsPanel.tsx'
import StudyPanel, { type PaletteSelection } from './StudyPanel.tsx'
import TrainerPanel from './TrainerPanel.tsx'
import { workspaces, type WorkspaceId } from './NavRail.tsx'
import type { ChessGame } from '../hooks/useChessGame.ts'
import type { Openings } from '../hooks/useOpenings.ts'
import type { Tablebase } from '../hooks/useTablebase.ts'
import type { Theme } from '../hooks/usePreferences.ts'
import type { BoardThemeId } from './board/boardThemes.ts'
import type useEngine from '../hooks/useEngine.ts'
import type useLibrary from '../hooks/useLibrary.ts'
import type usePlay from '../hooks/usePlay.ts'
import type useReview from '../hooks/useReview.ts'
import type useTrainer from '../hooks/useTrainer.ts'

type Engine = ReturnType<typeof useEngine>
type Review = ReturnType<typeof useReview>
type Library = ReturnType<typeof useLibrary>
type Trainer = ReturnType<typeof useTrainer>
type Play = ReturnType<typeof usePlay>

type Props = {
  active: WorkspaceId
  theme: Theme
  onToggleTheme: () => void
  soundEnabled: boolean
  onToggleSound: () => void
  boardTheme: BoardThemeId
  onBoardTheme: (theme: BoardThemeId) => void
  showCoordinates: boolean
  onToggleCoordinates: () => void
  engine: Engine
  review: Review
  library: Library
  trainer: Trainer
  play: Play
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
  railOpen: boolean
  onToggleRail: () => void
  fen: string
  turn: Color
}

export default function RightPanel({ active, theme, onToggleTheme, soundEnabled, onToggleSound, boardTheme, onBoardTheme, showCoordinates, onToggleCoordinates, engine, review, library, trainer, play, openings, tablebase, game, armed, onArm, onPlayMove, currentPgn, canSave, onOpenGame, currentId, onNavigate, onWorkspace, railOpen, onToggleRail, fen, turn }: Props) {
  const current = workspaces.find((workspace) => workspace.id === active)
  const content = (): ReactNode => {
    if (active === 'review')
      return (
        <ReviewPanel
          review={review}
          game={game}
          trainer={trainer}
          source={engine.source}
          currentId={currentId}
          onNavigate={onNavigate}
          playActive={play.active}
          onOpenLibrary={() => onWorkspace('library')}
          onImportPgn={() => {
            onWorkspace('library')
            void library.importFiles()
          }}
          onGoPlay={() => onWorkspace('play')}
        />
      )
    if (active === 'play') return <PlayPanel play={play} game={game} library={library} currentPgn={currentPgn} onWorkspace={onWorkspace} />
    if (active === 'analysis') return <EnginePanel engine={engine} fen={fen} turn={turn} reviewRunning={review.running} />
    if (active === 'library') return <LibraryPanel library={library} currentPgn={currentPgn} canSave={canSave} onOpenGame={onOpenGame} />
    if (active === 'study') return <StudyPanel game={game} armed={armed} onArm={onArm} tablebase={tablebase} onPlayMove={onPlayMove} />
    if (active === 'trainer') return <TrainerPanel trainer={trainer} game={game} playActive={play.active} />
    if (active === 'openings') return <OpeningsPanel openings={openings} onPlayMove={onPlayMove} onWorkspace={onWorkspace} />
    if (active === 'settings')
      return (
        <SettingsPanel
          theme={theme}
          onToggleTheme={onToggleTheme}
          soundEnabled={soundEnabled}
          onToggleSound={onToggleSound}
          boardTheme={boardTheme}
          onBoardTheme={onBoardTheme}
          showCoordinates={showCoordinates}
          onToggleCoordinates={onToggleCoordinates}
          engine={engine}
          openings={openings}
          onWorkspace={onWorkspace}
        />
      )
    return null
  }

  if (!railOpen) {
    const Icon = current?.icon
    return (
      <aside data-testid="rail-strip" className="flex w-11 shrink-0 flex-col items-center gap-2 border-l border-line bg-bg py-3">
        <button
          data-testid="rail-open"
          type="button"
          onClick={onToggleRail}
          title="Show panel (Ctrl+B)"
          aria-label="Show panel"
          className="no-drag flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-text"
        >
          <ChevronLeft size={15} />
        </button>
        {Icon && (
          <span data-testid="rail-strip-icon" className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-2 text-accent-soft" title={current?.label}>
            <Icon size={16} />
          </span>
        )}
      </aside>
    )
  }

  return (
    <aside data-testid="rail" className="flex w-[344px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-line bg-bg p-3">
      <div className="flex shrink-0 items-center justify-between px-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{current?.label ?? 'Panel'}</span>
        <button
          data-testid="rail-close"
          type="button"
          onClick={onToggleRail}
          title="Hide panel (Ctrl+B)"
          aria-label="Hide panel"
          className="no-drag flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-text"
        >
          <ChevronRight size={15} />
        </button>
      </div>
      {content()}
    </aside>
  )
}