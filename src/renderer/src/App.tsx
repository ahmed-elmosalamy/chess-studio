import { useEffect, useMemo, useState } from 'react'
import { placePiece } from '@shared/fen'
import { uciToMove } from '@shared/openings'
import CommandPalette from './components/CommandPalette.tsx'
import NavRail, { workspaces, type WorkspaceId } from './components/NavRail.tsx'
import BooksWorkspace from './components/BooksWorkspace.tsx'
import RightPanel from './components/RightPanel.tsx'
import ShortcutSheet from './components/ShortcutSheet.tsx'
import StatusBar from './components/StatusBar.tsx'
import TitleBar from './components/TitleBar.tsx'
import Workspace from './components/Workspace.tsx'
import { BOARD_THEMES } from './components/board/boardThemes.ts'
import type { Placement } from './components/board/ChessBoard.tsx'
import type { PaletteSelection } from './components/StudyPanel.tsx'
import type { CommandItem } from './ui/commands.ts'
import { pgnFromTree } from './chess/game.ts'
import useChessGame from './hooks/useChessGame.ts'
import useEngine from './hooks/useEngine.ts'
import useBooks from './hooks/useBooks.ts'
import useLibrary from './hooks/useLibrary.ts'
import useOpenings from './hooks/useOpenings.ts'
import usePlay from './hooks/usePlay.ts'
import useReview from './hooks/useReview.ts'
import useTablebase from './hooks/useTablebase.ts'
import useTrainer from './hooks/useTrainer.ts'
import { usePreferences } from './hooks/usePreferences.ts'

export default function App() {
  const { theme, soundEnabled, boardTheme, showCoordinates, railOpen, toggleTheme, toggleSound, setBoardTheme, toggleCoordinates, toggleRail } = usePreferences()
  const [active, setActive] = useState<WorkspaceId>('review')
  const game = useChessGame(soundEnabled)
  const engine = useEngine(game.fen, game.turn)
  const library = useLibrary()
  const books = useBooks()
  const openings = useOpenings(game, active === 'openings')
  const tablebase = useTablebase(game, active === 'study')
  const trainer = useTrainer()
  const review = useReview({
    tree: game.tree,
    rootId: game.rootId,
    source: engine.source,
    settings: engine.settings,
    liveAnalysisOn: engine.enabled,
    pauseLiveAnalysis: engine.disable,
    resumeLiveAnalysis: engine.enable
  })
  const play = usePlay({ game, engine, review })

  const currentPgn = useMemo(() => pgnFromTree(game.tree, game.rootId, game.headers), [game.tree, game.rootId, game.headers])
  const canSave = game.tree[game.rootId].childIds.length > 0
  const openGame = (pgn: string): void => {
    play.stop()
    game.loadPgnText(pgn)
    setActive('review')
  }
  const showPosition = (fen: string): void => {
    play.stop()
    game.newGame(fen)
  }
  const playExplorerMove = (uci: string): void => {
    const { from, to, promotion } = uciToMove(uci)
    game.requestMove(from, to, promotion)
  }

  const [armed, setArmed] = useState<PaletteSelection | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const armPalette = (selection: PaletteSelection | null): void => {
    setArmed(selection)
    game.setSelected(null)
  }

  useEffect(() => {
    if (active !== 'study') setArmed(null)
  }, [active])

  useEffect(() => {
    if (game.tree[game.rootId].childIds.length > 0) setArmed(null)
  }, [game.tree, game.rootId])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return
      setArmed(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'b' || event.repeat) return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select'))) return
      event.preventDefault()
      toggleRail()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleRail])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.repeat) return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select'))) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSheetOpen(false)
        setPaletteOpen((open) => !open)
        return
      }
      if (event.key === '?') {
        event.preventDefault()
        setPaletteOpen(false)
        setSheetOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const rootFen = game.tree[game.rootId].fen
  const newGame = game.newGame
  const placement = useMemo<Placement | undefined>(() => {
    if (active !== 'study' || !armed) return undefined
    const piece = armed === 'eraser' ? null : armed
    return {
      piece,
      onPlace: (square) => {
        const next = placePiece(rootFen, square, piece)
        if (next) {
          play.stop()
          newGame(next)
        }
      }
    }
  }, [active, armed, rootFen, newGame, play])

  const nextBoardTheme = (): void => {
    const index = BOARD_THEMES.findIndex((entry) => entry.id === boardTheme)
    const next = BOARD_THEMES[(index + 1) % BOARD_THEMES.length]
    setBoardTheme(next.id)
  }

  const commands: CommandItem[] = [
    ...workspaces.map((workspace) => ({
      id: `workspace-${workspace.id}`,
      label: `Open ${workspace.short}`,
      hint: workspace.label,
      group: 'Workspaces',
      run: () => setActive(workspace.id)
    })),
    { id: 'new-game', label: 'New game', hint: 'clear the board', group: 'Board', run: () => game.newGame() },
    { id: 'demo', label: 'Load demo game', group: 'Board', run: () => game.loadDemo() },
    { id: 'import', label: 'Import PGN', hint: 'into the library', group: 'Board', run: () => { setActive('library'); void library.importFiles() } },
    { id: 'flip', label: 'Flip board', group: 'Board', keys: 'F', run: () => game.setFlipped((flipped) => !flipped) },
    { id: 'copy-fen', label: 'Copy FEN', group: 'Board', run: () => void navigator.clipboard.writeText(game.fen) },
    { id: 'rail', label: 'Toggle right rail', group: 'View', keys: 'Ctrl B', run: toggleRail },
    { id: 'arrows', label: 'Toggle review arrows', group: 'View', run: review.toggleArrows },
    { id: 'theme', label: 'Toggle theme', group: 'View', run: toggleTheme },
    { id: 'sound', label: 'Toggle sound', group: 'View', run: toggleSound },
    { id: 'board-theme', label: 'Cycle board theme', hint: boardTheme, group: 'View', run: nextBoardTheme },
    { id: 'settings', label: 'Open Settings', group: 'Help', run: () => setActive('settings') },
    { id: 'shortcuts', label: 'Show keyboard shortcuts', group: 'Help', keys: '?', run: () => setSheetOpen(true) }
  ]

  return (
    <div className="flex h-full flex-col">
      <TitleBar
        workspace={active}
        theme={theme}
        soundEnabled={soundEnabled}
        onToggleTheme={toggleTheme}
        onToggleSound={toggleSound}
        onOpenPalette={() => setPaletteOpen(true)}
      />
      <div className="flex min-h-0 flex-1">
        <NavRail active={active} onSelect={setActive} />
        {active === 'books' ? (
          <BooksWorkspace books={books} game={game} onShowPosition={showPosition} />
        ) : (
          <>
            <Workspace active={active} game={game} engine={engine} review={review} placement={placement} showCoordinates={showCoordinates} extraArrow={trainer.hint ?? play.hint ?? null} />
        <RightPanel
          active={active}
          theme={theme}
          onToggleTheme={toggleTheme}
          soundEnabled={soundEnabled}
          onToggleSound={toggleSound}
          boardTheme={boardTheme}
          onBoardTheme={setBoardTheme}
          showCoordinates={showCoordinates}
          onToggleCoordinates={toggleCoordinates}
          engine={engine}
          review={review}
          library={library}
          trainer={trainer}
          play={play}
          openings={openings}
          tablebase={tablebase}
          onPlayMove={playExplorerMove}
          game={game}
          armed={armed}
          onArm={armPalette}
          currentPgn={currentPgn}
          canSave={canSave}
          onOpenGame={openGame}
          currentId={game.currentId}
          onNavigate={game.navigate}
          onWorkspace={setActive}
          railOpen={railOpen}
          onToggleRail={toggleRail}
          fen={game.fen}
          turn={game.turn}
        />
          </>
        )}
      </div>
      <StatusBar active={active} game={game} engine={engine} review={review} />
      {paletteOpen && <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />}
      {sheetOpen && <ShortcutSheet onClose={() => setSheetOpen(false)} />}
    </div>
  )
}
