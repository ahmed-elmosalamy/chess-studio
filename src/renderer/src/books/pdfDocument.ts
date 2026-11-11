import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PDFDocumentProxy } from 'pdfjs-dist'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

/* JBIG2 and OpenJPEG decoders live with the other bundled OCR assets. */
const WASM_URL = new URL('ocr/pdfjs/', document.baseURI).href

export function loadDocument(data: Uint8Array): Promise<PDFDocumentProxy> {
  return pdfjs.getDocument({ data, wasmUrl: WASM_URL }).promise
}
