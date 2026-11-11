import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const outDir = join(root, 'src', 'renderer', 'public', 'ocr')

/* every file the offline OCR path reads at runtime */
const assets = [
  ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'core/tesseract-core-simd-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm', 'core/tesseract-core-simd-lstm.wasm'],
  ['@tesseract.js-data/eng/4.0.0/eng.traineddata.gz', 'lang/eng.traineddata.gz'],
  ['pdfjs-dist/wasm/jbig2.wasm', 'pdfjs/jbig2.wasm'],
  ['pdfjs-dist/wasm/openjpeg.wasm', 'pdfjs/openjpeg.wasm']
]

const versions = {}
for (const name of ['tesseract.js', 'tesseract.js-core', '@tesseract.js-data/eng', 'pdfjs-dist']) {
  const pkg = JSON.parse(await readFile(join(root, 'node_modules', name, 'package.json'), 'utf8'))
  versions[name] = pkg.version
}

await mkdir(outDir, { recursive: true })
for (const [from, to] of assets) {
  await mkdir(dirname(join(outDir, to)), { recursive: true })
  const source = join(root, 'node_modules', from)
  try {
    await copyFile(source, join(outDir, to))
  } catch (error) {
    throw new Error(`OCR asset ${from} could not be copied: ${error.message}`)
  }
}

await writeFile(join(outDir, 'versions.json'), `${JSON.stringify({ ...versions, files: assets.map(([, to]) => to) }, null, 2)}\n`, 'utf8')
console.log(`ocr assets ready: ${assets.length} files, tesseract.js ${versions['tesseract.js']}, pdfjs ${versions['pdfjs-dist']}`)
