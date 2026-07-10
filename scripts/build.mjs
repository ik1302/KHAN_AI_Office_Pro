import { cp, mkdir, rm } from 'node:fs/promises'
import { build } from 'esbuild'

await rm('dist', { recursive: true, force: true })
await mkdir('dist', { recursive: true })
await cp('public/index.html', 'dist/index.html')
await cp('public/styles.css', 'dist/styles.css')
await cp('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'dist/pdf.worker.min.mjs')

await build({
  entryPoints: ['public/app.js'],
  bundle: true,
  format: 'esm',
  minify: true,
  outfile: 'dist/app.js',
  target: ['es2022'],
})
