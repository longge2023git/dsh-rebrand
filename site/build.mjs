#!/usr/bin/env node
/**
 * Build the per-brand static sites.
 *
 * Usage:
 *   node site/build.mjs              # every brand into site/dist/<brand>
 *   node site/build.mjs fa           # one brand only
 *
 * Output layout (per brand):
 *   dist/<brand>/index.html  download.html  docs.html  styles.css  favicon.svg
 *   dist/<brand>/en/index.html  en/download.html  en/docs.html
 */
import { mkdir, writeFile, readFile, cp, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import faBrand from './brands/fa.mjs'
import ruBrand from './brands/ru.mjs'
import faCopy from './copy/fa.mjs'
import ruCopy from './copy/ru.mjs'
import enCopy from './copy/en.mjs'
import { layout, homeBody, downloadBody, docsBody, prefixOf, fillDeep } from './src/render.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const outRoot = join(here, 'dist')

const brands = [faBrand, ruBrand]
const copies = { fa: faCopy, ru: ruCopy, en: enCopy }

const pages = [
  { id: '', file: 'index.html', body: homeBody },
  { id: 'download', file: 'download.html', body: downloadBody },
  { id: 'docs', file: 'docs.html', body: docsBody },
]

const only = process.argv[2]
const selected = only ? brands.filter((brand) => brand.id === only) : brands
if (selected.length === 0) {
  console.error(`unknown brand ${JSON.stringify(only)}; expected one of ${brands.map((brand) => brand.id).join(', ')}`)
  process.exit(1)
}

const styles = await readFile(join(here, 'src', 'styles.css'), 'utf8')
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><path fill="#3b82f6" d="M512 64a448 448 0 1 0 0 896 448 448 0 0 0 0-896Zm0 104a344 344 0 0 1 148 652c-6-70-36-126-92-166-40-29-88-46-136-52-34-4-58-30-58-64 0-38 32-68 70-64 40 4 66 34 74 70 6 26 30 44 56 40 30-4 50-32 44-62-14-70-76-122-150-118-80 4-140 72-136 152 2 40 18 76 44 104-30 12-56 32-74 60a344 344 0 0 1 210-552Z"/></svg>\n`

await rm(outRoot, { recursive: true, force: true })

for (const brand of selected) {
  const brandOut = join(outRoot, brand.id)
  await mkdir(brandOut, { recursive: true })
  await writeFile(join(brandOut, 'styles.css'), styles)
  await writeFile(join(brandOut, 'favicon.svg'), favicon)
  await writeFile(join(brandOut, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: https://${brand.domain}/sitemap.xml\n`)

  const urls = []
  for (const locale of brand.locales) {
    const raw = copies[locale]
    if (!raw) throw new Error(`missing copy for locale ${locale} (brand ${brand.id})`)
    const copy = fillDeep(raw, brand)
    const prefix = prefixOf(brand, locale)
    const dir = prefix ? join(brandOut, prefix.slice(1)) : brandOut
    await mkdir(dir, { recursive: true })

    for (const page of pages) {
      const body = page.body(brand, copy)
      const html = layout({ brand, copy, locale, page: page.id, body })
      await writeFile(join(dir, page.file), html)
      urls.push(`https://${brand.domain}${prefix === '' ? '/' : `${prefix}/`}${page.file === 'index.html' ? '' : page.file}`)
    }
  }

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((url) => `  <url><loc>${url}</loc></url>`)
    .join('\n')}\n</urlset>\n`
  await writeFile(join(brandOut, 'sitemap.xml'), sitemap)

  console.log(`built ${brand.id}: ${brand.locales.length} locales, ${urls.length} pages -> ${resolve(brandOut)}`)
}

if (!only) {
  console.log('\nDeploy: rsync -a --delete site/dist/<brand>/ root@<host>:/var/www/<brand>-site/')
}
