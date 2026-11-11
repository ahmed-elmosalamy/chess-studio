import { gradeMeta, type ReviewGrade } from '@shared/review'

export default function GradeBadge({ grade, size = 'sm' }: { grade: ReviewGrade; size?: 'sm' | 'md' }) {
  const meta = gradeMeta[grade]
  return (
    <span
      data-testid="grade-badge"
      role="img"
      aria-label={meta.label}
      title={meta.label}
      className={`inline-flex shrink-0 items-center justify-center rounded-[3px] font-bold leading-none text-white ${
        size === 'sm' ? 'h-4 w-4 text-[9px]' : 'h-[18px] w-[18px] text-2xs'
      }`}
      style={{ backgroundColor: meta.color }}
    >
      {meta.glyph}
    </span>
  )
}