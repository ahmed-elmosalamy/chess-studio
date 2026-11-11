import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import type { Raster } from './ocrPdf.ts'

const POINTS_PER_INCH = 72

export async function rasterisePage(doc: PDFDocumentProxy, pageNumber: number, dpi: number): Promise<Raster> {
  const page: PDFPageProxy = await doc.getPage(pageNumber)
  const viewport = page.getViewport({ scale: dpi / POINTS_PER_INCH })
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable')
  await page.render({ canvas, canvasContext: context, viewport }).promise
  page.cleanup()
  return { page: pageNumber, dpi, width: canvas.width, height: canvas.height, image: canvas }
}

export function createRasteriser(doc: PDFDocumentProxy): (page: number, dpi: number) => Promise<Raster> {
  return (page, dpi) => rasterisePage(doc, page, dpi)
}

export type CropRect = { x: number; y: number; width: number; height: number }

/** A model-returned normalised box becomes a pixel rect, padded a little so piece edges survive. */
export function cropRect(width: number, height: number, box: number[], pad = 0.06): CropRect | null {
  if (!Array.isArray(box) || box.length !== 4) return null
  const [x0, y0, x1, y1] = box.map((value) => Number(value))
  if (![x0, y0, x1, y1].every(Number.isFinite)) return null
  if (!(x1 > x0) || !(y1 > y0)) return null
  const padX = (x1 - x0) * pad
  const padY = (y1 - y0) * pad
  const left = Math.max(0, Math.round((x0 - padX) * width))
  const top = Math.max(0, Math.round((y0 - padY) * height))
  const right = Math.min(width, Math.round((x1 + padX) * width))
  const bottom = Math.min(height, Math.round((y1 + padY) * height))
  if (right <= left || bottom <= top) return null
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/** Redraws the crop larger, so a small printed diagram reaches the model as a legible board. */
export function cropRaster(raster: Raster, rect: CropRect, scale: number): Raster {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(rect.width * scale))
  canvas.height = Math.max(1, Math.round(rect.height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(raster.image as CanvasImageSource, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height)
  return { page: raster.page, dpi: Math.round(raster.dpi * scale), width: canvas.width, height: canvas.height, image: canvas }
}
