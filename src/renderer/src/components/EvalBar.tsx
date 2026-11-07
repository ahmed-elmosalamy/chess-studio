type Props = {
  whiteChance: number
  label: string
  running: boolean
}

export default function EvalBar({ whiteChance, label, running }: Props) {
  const fill = Math.min(98, Math.max(2, whiteChance))

  return (
    <div className="flex h-full w-full flex-col gap-1">
      <div data-testid="eval-bar" className="relative flex flex-1 flex-col justify-end overflow-hidden rounded" title={`White win chance ${whiteChance.toFixed(1)}%`}>
        <div className="absolute inset-0 bg-[var(--square-dark)]" />
        <div data-testid="eval-fill" className="relative w-full bg-[var(--square-light)] transition-[height] duration-200" style={{ height: `${fill}%` }} />
        {running && <span className="absolute inset-x-0 top-0 h-[2px] animate-pulse bg-accent" />}
      </div>
      <span data-testid="eval-score" className="shrink-0 text-center font-mono text-[9px] font-semibold text-muted">
        {label || '—'}
      </span>
    </div>
  )
}
