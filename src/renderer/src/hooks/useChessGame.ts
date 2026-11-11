import { useCallback, useEffect, useMemo, useState } from 'react'
import { Chess } from 'chess.js'
import { addChild, patchNode, pruneFrom, siblingDirection, lastDescendant, type MoveInput, type Tree } from '../chess/tree.ts'
import { demoGame, START_FEN, treeFromPgn, tryMove, type GameDoc } from '../chess/game.ts'
import { loadSession, saveSession } from '../chess/session.ts'
import { playSound } from '../audio/sounds.ts'

export type ArrowColor = 'green' | 'red' | 'blue' | 'orange'
export type Arrow = { from: string; to: string; color: ArrowColor }

export type PendingPromotion = { from: string; to: string; color: 'w' | 'b' }

function emptyDoc(): GameDoc {
  const doc = treeFromPgn('')
  return { ...doc, headers: {} }
}

export default function useChessGame(soundEnabled: boolean) {
  const [doc, setDoc] = useState<GameDoc>(() => loadSession(localStorage) ?? emptyDoc())
  const [selected, setSelected] = useState<string | null>(null)
  const [arrows, setArrows] = useState<Arrow[]>([])
  const [highlighted, setHighlighted] = useState<string[]>([])
  const [flipped, setFlipped] = useState(false)
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null)

  const { tree, currentId } = doc
  const currentNode = tree[currentId]
  const fen = currentNode.fen

  useEffect(() => {
    const timer = setTimeout(() => saveSession(doc, localStorage), 400)
    return () => clearTimeout(timer)
  }, [doc])

  const chess = useMemo(() => new Chess(fen), [fen])
  const turn = chess.turn()
  const legalFromSelected = useMemo(
    () => (selected ? chess.moves({ square: selected as never, verbose: true }) : []),
    [chess, selected]
  )

  const checkSquare = useMemo(() => {
    if (!chess.isCheck()) return null
    for (const row of chess.board()) {
      for (const cell of row) {
        if (cell && cell.type === 'k' && cell.color === chess.turn()) return cell.square
      }
    }
    return null
  }, [chess])

  const announce = useCallback(
    (move: MoveInput, afterFen: string) => {
      if (!soundEnabled) return
      const position = new Chess(afterFen)
      if (position.isCheckmate() || position.isStalemate() || position.isDraw()) playSound('gameEnd')
      else if (move.san.includes('#') || position.isCheck()) playSound('check')
      else if (move.flags.includes('c') || move.flags.includes('e')) playSound('capture')
      else playSound('move')
    },
    [soundEnabled]
  )

  const commit = useCallback(
    (input: MoveInput) => {
      setDoc((previous) => {
        const parentId = previous.currentId
        const existing = previous.tree[parentId].childIds.find((childId) => {
          const child = previous.tree[childId]
          return child.from === input.from && child.to === input.to && (child.promotion ?? null) === (input.promotion ?? null)
        })

        if (existing) {
          announce(input, previous.tree[existing].fen)
          return { ...previous, currentId: existing }
        }

        const added = addChild(previous.tree, parentId, input)
        announce(input, input.fen)
        return { ...previous, tree: added.tree, currentId: added.nodeId }
      })
      setSelected(null)
      setArrows([])
      setHighlighted([])
    },
    [announce]
  )

  const requestMove = useCallback(
    (from: string, to: string, promotion?: 'q' | 'r' | 'b' | 'n') => {
      const candidates = chess.moves({ square: from as never, verbose: true }).filter((move) => move.to === to)
      if (candidates.length === 0) {
        if (soundEnabled) playSound('illegal')
        setSelected(null)
        return
      }

      if (candidates.some((move) => move.promotion) && !promotion) {
        setPendingPromotion({ from, to, color: chess.turn() })
        return
      }

      const input = tryMove(tree, currentId, promotion ? { from, to, promotion } : { from, to })
      if (!input) {
        if (soundEnabled) playSound('illegal')
        setSelected(null)
        return
      }
      commit(input)
    },
    [chess, commit, currentId, soundEnabled, tree]
  )

  const pointerToSquare = useCallback(
    (square: string) => {
      if (pendingPromotion) return
      const pieceHere = chess.get(square as never)

      if (selected && selected !== square && legalFromSelected.some((move) => move.to === square)) {
        requestMove(selected, square)
        return
      }

      if (pieceHere && pieceHere.color === turn) {
        if (selected === square) setSelected(null)
        else {
          setSelected(square)
          if (soundEnabled) playSound('select')
        }
        return
      }

      setSelected(null)
    },
    [chess, legalFromSelected, pendingPromotion, requestMove, selected, soundEnabled, turn]
  )

  const navigate = useCallback((nodeId: string) => {
    setDoc((previous) => (previous.tree[nodeId] ? { ...previous, currentId: nodeId } : previous))
    setSelected(null)
    setArrows([])
    setHighlighted([])
  }, [])

  const step = useCallback(
    (action: 'prev' | 'next' | 'first' | 'last' | 'sibling-prev' | 'sibling-next') => {
      setDoc((previous) => {
        const node = previous.tree[previous.currentId]
        let target: string | null = null

        if (action === 'prev') target = node.parentId
        if (action === 'next') target = node.childIds[0] ?? null
        if (action === 'first') target = previous.rootId
        if (action === 'last') target = lastDescendant(previous.tree, previous.currentId)
        if (action === 'sibling-prev') target = siblingDirection(previous.tree, previous.currentId, -1)
        if (action === 'sibling-next') target = siblingDirection(previous.tree, previous.currentId, 1)

        if (!target || !previous.tree[target]) return previous
        return { ...previous, currentId: target }
      })
      setSelected(null)
      setArrows([])
      setHighlighted([])
    },
    []
  )

  const deleteCurrent = useCallback(() => {
    setDoc((previous) => {
      const node = previous.tree[previous.currentId]
      if (!node.parentId) return previous
      const pruned = pruneFrom(previous.tree, previous.currentId)
      return { ...previous, tree: pruned.tree, currentId: node.parentId }
    })
    setSelected(null)
  }, [])

  const setComment = useCallback((comment: string) => {
    setDoc((previous) => ({ ...previous, tree: patchNode(previous.tree, previous.currentId, { comment }) }))
  }, [])

  const setNag = useCallback((nag: string | null) => {
    setDoc((previous) => ({ ...previous, tree: patchNode(previous.tree, previous.currentId, { nag }) }))
  }, [])

  const setHeaders = useCallback((patch: Record<string, string>) => {
    setDoc((previous) => ({ ...previous, headers: { ...previous.headers, ...patch } }))
  }, [])

  const addArrow = useCallback((arrow: Arrow) => setArrows((previous) => [...previous, arrow]), [])
  const toggleHighlight = useCallback(
    (square: string) => setHighlighted((previous) => (previous.includes(square) ? previous.filter((item) => item !== square) : [...previous, square])),
    []
  )
  const clearAnnotations = useCallback(() => {
    setArrows([])
    setHighlighted([])
  }, [])

  const loadDemo = useCallback(() => {
    const loaded = demoGame()
    setDoc({ ...loaded, currentId: loaded.rootId })
    setSelected(null)
    setArrows([])
    setHighlighted([])
  }, [])

  const loadPgnText = useCallback((pgnText: string) => {
    const loaded = treeFromPgn(pgnText)
    setDoc({ ...loaded, currentId: loaded.rootId })
    setSelected(null)
  }, [])

  const newGame = useCallback((startFen = START_FEN) => {
    const loaded = treeFromPgn('')
    const fresh = { ...loaded, tree: { ...loaded.tree, [loaded.rootId]: { ...loaded.tree[loaded.rootId], fen: startFen } } }
    setDoc({ ...fresh, headers: {}, currentId: fresh.rootId })
    setSelected(null)
  }, [])

  const resolvePromotion = useCallback(
    (piece: 'q' | 'r' | 'b' | 'n' | null) => {
      if (!pendingPromotion) return
      const { from, to } = pendingPromotion
      setPendingPromotion(null)
      if (piece) requestMove(from, to, piece)
    },
    [pendingPromotion, requestMove]
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select, button, a'))) return

      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault()
          step('prev')
          break
        case 'ArrowRight':
          event.preventDefault()
          step('next')
          break
        case 'ArrowUp':
          event.preventDefault()
          step('sibling-next')
          break
        case 'ArrowDown':
          event.preventDefault()
          step('sibling-prev')
          break
        case 'Home':
          event.preventDefault()
          step('first')
          break
        case 'End':
          event.preventDefault()
          step('last')
          break
        case 'Backspace':
        case 'Delete':
          event.preventDefault()
          deleteCurrent()
          break
        case 'f':
          setFlipped((current) => !current)
          break
        case 'Escape':
          setSelected(null)
          setPendingPromotion(null)
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [deleteCurrent, step])

  const boardPieces = useMemo(() => {
    const pieces: { square: string; type: string; color: 'w' | 'b' }[] = []
    for (const row of chess.board()) {
      for (const cell of row) {
        if (cell) pieces.push({ square: cell.square, type: cell.type, color: cell.color })
      }
    }
    return pieces
  }, [chess])

  const positionStatus = useMemo(() => {
    if (chess.isCheckmate()) return 'Checkmate'
    if (chess.isStalemate()) return 'Stalemate'
    if (chess.isThreefoldRepetition()) return 'Draw by repetition'
    if (chess.isInsufficientMaterial()) return 'Draw, insufficient material'
    if (chess.isDraw()) return 'Draw'
    if (chess.isCheck()) return 'Check'
    return 'Normal'
  }, [chess])

  return {
    tree: tree as Tree,
    rootId: doc.rootId,
    currentId,
    headers: doc.headers,
    fen,
    turn,
    ply: currentNode.ply,
    lastMove: currentNode.from && currentNode.to ? { from: currentNode.from, to: currentNode.to } : null,
    boardPieces,
    selected,
    setSelected,
    legalTargets: legalFromSelected.map((move) => ({ to: move.to, capture: move.flags.includes('c') || move.flags.includes('e') })),
    checkSquare,
    positionStatus,
    arrows,
    highlighted,
    flipped,
    pendingPromotion,
    pointerToSquare,
    requestMove,
    navigate,
    step,
    deleteCurrent,
    setComment,
    setNag,
    setHeaders,
    addArrow,
    toggleHighlight,
    clearAnnotations,
    setFlipped,
    loadDemo,
    loadPgnText,
    newGame,
    resolvePromotion
  }
}

export type ChessGame = ReturnType<typeof useChessGame>
