type Props = {
  whiteChance: number
  label: string
  running: boolean
}

export default function EvalBar({ whiteChance, label, running }: Props) {
  const fill = Math.min(98, Math.max(2, whiteChance))

  return (
    <div data-testid="eval-bar" className="relative h-full w-full overflow-hidden rounded" title={`White win chance ${whiteChance.toFixed(1)}%`}>
      <div className="absolute inset-0 bg-[var(--square-dark)]" />
      <div data-testid="eval-fill" className="absolute inset-x-0 bottom-0 bg-[var(--square-light)] transition-[height] duration-200" style={{ height: `${fill}%` }} />
      <span data-testid="eval-mid" className="absolute inset-x-0 top-1/2 h-px bg-black/35" />
      {running && <span className="absolute inset-x-0 top-0 h-[2px] animate-pulse bg-accent" />}
      <span
        data-testid="eval-score"
        className="absolute inset-x-0 bottom-0.5 mx-auto w-max rounded-sm bg-black/55 px-1 py-px font-mono text-2xs font-semibold leading-none text-white/90"
      >
        {label || '—'}
      </span>
    </div>
  )
}
