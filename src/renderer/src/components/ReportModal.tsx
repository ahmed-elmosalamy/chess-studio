import { useEffect, useRef, useState } from 'react'
import { Download, X } from 'lucide-react'
import { drawReportCard, type ReportModel } from '../report/reportCard.ts'

const CARD_WIDTH = 1200
const CARD_HEIGHT = 1600
const EXPORT_DPR = 2

type Props = { model: ReportModel; onClose: () => void }

function fileName(model: ReportModel): string {
  const clean = (value: string): string =>
    value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40) || 'game'
  return `${clean(model.players.white)} vs ${clean(model.players.black)} report.png`
}

export default function ReportModal({ model, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    drawReportCard(ctx, model, { width: CARD_WIDTH, height: CARD_HEIGHT, dpr: 1 })
  }, [model])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const save = async (): Promise<void> => {
    setSaving(true)
    setStatus(null)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = CARD_WIDTH * EXPORT_DPR
      canvas.height = CARD_HEIGHT * EXPORT_DPR
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        setStatus('Could not render the report.')
        return
      }
      drawReportCard(ctx, model, { width: CARD_WIDTH, height: CARD_HEIGHT, dpr: EXPORT_DPR })
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) {
        setStatus('Could not render the report.')
        return
      }
      const bytes = new Uint8Array(await blob.arrayBuffer())
      const saved = await window.studio.library.exportReport(bytes, fileName(model))
      setStatus(saved ? `Saved to ${saved}` : 'Save cancelled.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Saving the report failed.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" role="dialog" aria-modal="true" aria-label="Game report">
      <div data-testid="report-modal" className="flex max-h-full w-full max-w-[640px] flex-col gap-3 rounded-xl border border-line bg-bg p-4 shadow-2xl">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold">Game report</div>
            <div className="text-2xs text-muted">A shareable card for this review.</div>
          </div>
          <button
            data-testid="report-close"
            type="button"
            aria-label="Close report"
            onClick={onClose}
            className="no-drag rounded-md border border-line bg-surface-2 p-1 text-muted transition-colors hover:text-text"
          >
            <X size={14} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-line bg-surface-2 p-2">
          <canvas
            data-testid="report-canvas"
            data-title={model.title}
            data-accuracy-white={model.accuracy.white}
            data-accuracy-black={model.accuracy.black}
            ref={canvasRef}
            width={CARD_WIDTH}
            height={CARD_HEIGHT}
            className="mx-auto block w-full max-w-[480px] rounded-md"
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <span data-testid="report-status" className="min-w-0 truncate text-2xs text-muted">
            {status ?? 'PNG · 2400 × 3200'}
          </span>
          <button
            data-testid="report-save"
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="no-drag flex items-center gap-1 rounded-md border border-accent bg-accent px-3 py-1.5 text-[11px] font-semibold text-bg transition-opacity disabled:opacity-60"
          >
            <Download size={12} /> {saving ? 'Saving…' : 'Save PNG'}
          </button>
        </div>
      </div>
    </div>
  )
}
