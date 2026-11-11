import { createWorker } from 'tesseract.js'
import type { OcrWord } from '@shared/book'
import type { OcrEngine, Raster } from './ocrPdf.ts'

const asset = (path: string): string => new URL(`ocr/${path}`, document.baseURI).href

export async function createOcrEngine(): Promise<OcrEngine> {
  const worker = await createWorker('eng', 1, {
    workerPath: asset('worker.min.js'),
    corePath: asset('core/tesseract-core-simd-lstm.wasm.js'),
    langPath: asset('lang')
  })

  return {
    recognize: async (raster: Raster) => {
      const started = performance.now()
      const { data } = await worker.recognize(raster.image as HTMLCanvasElement, {}, { blocks: true, text: false })
      const words: OcrWord[] = []
      for (const block of data.blocks ?? []) {
        for (const paragraph of block.paragraphs ?? []) {
          for (const line of paragraph.lines ?? []) {
            for (const word of line.words ?? []) {
              if (word.text?.trim()) words.push({ text: word.text, bbox: word.bbox })
            }
          }
        }
      }
      return { words, confidence: Math.round(data.confidence ?? 0), ms: Math.round(performance.now() - started) }
    },
    dispose: async () => {
      await worker.terminate()
    }
  }
}
