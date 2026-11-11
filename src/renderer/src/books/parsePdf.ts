import type { ParsedBook } from '@shared/book'
import { loadDocument } from './pdfDocument.ts'
import { buildBlocks, type TextLine } from './parseText.ts'

type Item = { str: string; x: number; y: number; width: number; size: number }

function median(values: number[]): number {
  if (values.length === 0) return 10
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function toLines(page: number, items: Item[]): TextLine[] {
  const groups = new Map<number, Item[]>()
  for (const item of items) {
    const key = Math.round(item.y / 2) * 2
    const bucket = groups.get(key) ?? []
    bucket.push(item)
    groups.set(key, bucket)
  }

  const lines: TextLine[] = []
  for (const [y, bucket] of groups) {
    bucket.sort((a, b) => a.x - b.x)
    let text = ''
    let previousEnd = Number.NaN
    for (const item of bucket) {
      const gap = item.x - previousEnd
      const needsSpace = Number.isFinite(gap) && gap > item.size * 0.18 && !/\s$/.test(text) && !/^\s/.test(item.str)
      text += `${needsSpace ? ' ' : ''}${item.str}`
      previousEnd = item.x + item.width
    }
    const clean = text.replace(/\s+/g, ' ').trim()
    if (!clean) continue
    lines.push({ page, text: clean, y, x: bucket[0].x, size: Math.round(median(bucket.map((item) => item.size)) * 2) / 2 })
  }
  return lines
}

export async function parsePdf(data: Uint8Array, onProgress?: (page: number, total: number) => void): Promise<ParsedBook> {
  const doc = await loadDocument(data)
  const pageCount = doc.numPages
  const lines: TextLine[] = []

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = await doc.getPage(pageNumber)
    const content = await page.getTextContent()
    const items: Item[] = []
    for (const raw of content.items) {
      if (!('str' in raw) || !raw.str.trim()) continue
      const transform = raw.transform
      const size = Math.hypot(transform[2], transform[3]) || raw.height || 10
      items.push({ str: raw.str, x: transform[4], y: transform[5], width: raw.width, size })
    }
    lines.push(...toLines(pageNumber, items))
    page.cleanup()
    onProgress?.(pageNumber, pageCount)
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  await doc.destroy()
  const { blocks, outline } = buildBlocks(lines)
  const hasText = blocks.some((block) => block.kind !== 'heading' || block.text.length > 0)
  if (!hasText) throw new Error('No readable text found in this PDF')
  return { schemaVersion: 1, pageCount, source: 'text', outline, blocks }
}
