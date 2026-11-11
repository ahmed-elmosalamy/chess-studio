import type { Raster } from './ocrPdf.ts'

/** Vision models take base64 JPEG, so the raster has to leave the canvas as an encoded data url. */
export async function toJpeg(raster: Raster, quality: number): Promise<string> {
  const canvas = raster.image as HTMLCanvasElement
  const dataUrl = canvas.toDataURL('image/jpeg', quality)
  const comma = dataUrl.indexOf(',')
  return dataUrl.slice(comma + 1)
}
