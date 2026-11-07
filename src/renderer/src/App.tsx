import { useEffect, useMemo, useState } from 'react'
import { placePiece } from '@shared/fen'
import { uciToMove } from '@shared/openings'
import NavRail, { type WorkspaceId } from './components/NavRail.tsx'
import RightPanel from './components/RightPanel.tsx'
import StatusBar from './components/StatusBar.tsx'
import TitleBar from './components/TitleBar.tsx'
import Workspace from './components/Workspace.tsx'
import type { Placement } from './components/board/ChessBoard.tsx'
import type { PaletteSelection } from './components/StudyPanel.tsx'
import { pgnFromTree } from './chess/game.ts'
import useChessGame from './hooks/useChessGame.ts'
import useEngine from './hooks/useEngine.ts'
import useLibrary from './hooks/useLibrary.ts'
import useOpenings from './hooks/useOpenings.ts'
import useReview from './hooks/useReview.ts'
import useTablebase from './hooks/useTablebase.ts'
import { usePreferences } from './hooks/usePreferences.ts'

export default function App() {
  const { theme, soundEnabled, toggleTheme, toggleSound } = usePreferences()
  const [active, setActive] = useState<WorkspaceId>('review')
  const game = useChessGame(soundEnabled)
  const engine = useEngine(game.fen, game.turn)
  const library = useLibrary()
  const openings = useOpenings(game, active === 'openings')
  const tablebase = useTablebase(game, active === 'study')
  const review = useReview({
    tree: game.tree,
    rootId: game.rootId,
    source: engine.source,
    settings: engine.settings,
    pauseLiveAnalysis: engine.disable
  })

  const currentPgn = useMemo(() => pgnFromTree(game.tree, game.rootId, game.headers), [game.tree, game.rootId, game.headers])
  const canSave = game.tree[game.rootId].childIds.length > 0
  const openGame = (pgn: string): void => {
    game.loadPgnText(pgn)
    setActive('review')
  }
  const playExplorerMove = (uci: string): void => {
    const { from, to, promotion } = uciToMove(uci)
    game.requestMove(from, to, promotion)
  }

  const [armed, setArmed] = useState<PaletteSelection | null>(null)
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

  const rootFen = game.tree[game.rootId].fen
  const newGame = game.newGame
  const placement = useMemo<Placement | undefined>(() => {
    if (active !== 'study' || !armed) return undefined
    const piece = armed === 'eraser' ? null : armed
    return {
      piece,
      onPlace: (square) => {
        const next = placePiece(rootFen, square, piece)
        if (next) newGame(next)
      }
    }
  }, [active, armed, rootFen, newGame])

  return (
    <div className="flex h-full flex-col">
      <TitleBar theme={theme} soundEnabled={soundEnabled} onToggleTheme={toggleTheme} onToggleSound={toggleSound} />
      <div className="flex min-h-0 flex-1">
        <NavRail active={active} onSelect={setActive} />
        <Workspace game={game} engine={engine} review={review} placement={placement} />
        <RightPanel
          active={active}
          theme={theme}
          onToggleTheme={toggleTheme}
          soundEnabled={soundEnabled}
          onToggleSound={toggleSound}
          engine={engine}
          review={review}
          library={library}
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
          fen={game.fen}
          turn={game.turn}
        />
      </div>
      <StatusBar active={active} game={game} engine={engine} review={review} />
    </div>
  )
}
