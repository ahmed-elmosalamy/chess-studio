import BookReader from './BookReader.tsx'
import BooksPanel from './BooksPanel.tsx'
import type { Books } from '../hooks/useBooks.ts'
import type { ChessGame } from '../hooks/useChessGame.ts'

type Props = {
  books: Books
  game: ChessGame
  onShowPosition: (fen: string) => void
}

export default function BooksWorkspace({ books, game, onShowPosition }: Props) {
  const open = books.openBook

  return (
    <section data-testid="books-workspace" className="flex min-w-0 flex-1 flex-col overflow-hidden bg-bg p-4">
      {open ? (
        <BookReader
          book={open}
          error={books.readerError}
          aiPaused={books.aiPaused}
          game={game}
          onClose={books.closeReader}
          onAnalyse={() => void books.analyseBook(open.meta.id)}
          onStop={books.stopReading}
          onNote={books.updateNote}
          onShowPosition={onShowPosition}
          onAnchor={books.setAnchor}
          onClearAnchor={books.clearAnchor}
          onReadChapter={(chapterId) => void books.readChapterWithAi(open.meta.id, chapterId)}
          onRereadPage={(page) => void books.rereadPageWithAi(open.meta.id, page)}
        />
      ) : (
        <BooksPanel books={books} />
      )}
    </section>
  )
}
