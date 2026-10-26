// One-off helper: compose the vv-worker installer brand assets from the HD mascot.
// Run from apps/desktop so `sharp` resolves. Output goes to scripts/.generated-brand for review.
import { mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const markPath = join(here, '../../../custom/vv-worker-assets/source/vv-worker-mark.png')
const outDir = join(here, '.generated-brand')
mkdirSync(outDir, { recursive: true })

/** Compose a horizontal installer header. */
async function brand(width, height, textColor) {
  const markHeight = Math.round(height * 0.72)
  const mark = await sharp(markPath).trim().resize({ height: markHeight, fit: 'inside' }).png().toBuffer()
  const meta = await sharp(mark).metadata()
  const markWidth = meta.width ?? markHeight
  const x = Math.round(width * 0.04)
  const textX = x + markWidth + Math.round(width * 0.035)
  const fontSize = Math.round(height * 0.29)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <image href="data:image/png;base64,${mark.toString('base64')}" x="${x}" y="${Math.round((height - markHeight) / 2)}" width="${markWidth}" height="${markHeight}"/>
  <text x="${textX}" y="${Math.round(height / 2 + fontSize * 0.34)}" fill="${textColor}" font-family="Arial, 'Segoe UI', sans-serif" font-size="${fontSize}" font-weight="700" letter-spacing="1">vv-worker</text>
</svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}

/** Compose the uninstaller sidebar. */
async function sidebar() {
  const mark = await sharp(markPath).trim().resize({ height: 240, fit: 'inside' }).png().toBuffer()
  const meta = await sharp(mark).metadata()
  const width = meta.width ?? 120
  const x = Math.round((164 - width) / 2)
  const y = Math.round((314 - 240) / 2)
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="164" height="314" viewBox="0 0 164 314"><image href="data:image/png;base64,${mark.toString('base64')}" x="${x}" y="${y}" width="${width}" height="240"/></svg>`)).png().toBuffer()
}

for (const [file, width, height, color] of [
  ['brand.png', 600, 196, '#0f1115'],
  ['brand-2x.png', 1200, 392, '#0f1115'],
  ['brand-dark.png', 600, 196, '#ffffff'],
  ['brand-dark-2x.png', 1200, 392, '#ffffff'],
]) {
  await sharp(await brand(width, height, color)).toFile(join(outDir, file))
  console.log(`wrote ${file}`)
}
await sharp(await sidebar()).toFile(join(outDir, 'uninstaller-sidebar.png'))
console.log('wrote uninstaller-sidebar.png')
