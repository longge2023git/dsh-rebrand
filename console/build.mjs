#!/usr/bin/env node
/**
 * Build the mini console for one brand.
 *
 * Usage: node console/build.mjs fa|ru
 * Output: console/dist/<brand>/me/{index,keys,login,register}.html + app.js/dict.js/styles.css/icon.svg
 *
 * Pages carry `{{brand}}`, `{{lang}}`, `{{dir}}`, `{{site}}`, `{{api}}` tokens so one set of
 * sources serves both the Persian and the Russian deployment.
 */
import { mkdir, readFile, writeFile, cp, rm, readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

const BRANDS = {
  fa: {
    brand: 'DeepSeek-FA',
    lang: 'fa',
    dir: 'rtl',
    site: 'https://www.deepseekfa.com',
    api: 'https://deepseekfa.com',
    icon: join(here, '..', 'site', 'assets', 'fa', 'icon.svg'),
  },
  ru: {
    brand: 'DeepSeek-RU',
    lang: 'ru',
    dir: 'ltr',
    site: 'https://www.deepseek-ru.org',
    api: 'https://deepseek-ru.org',
    icon: join(here, '..', 'site', 'assets', 'ru', 'icon.svg'),
  },
}

/** Strings a brand's pages must never contain: the other brand's identity. */
const FORBIDDEN = {
  fa: ['DeepSeek-RU', 'deepseek-ru.org'],
  ru: ['DeepSeek-FA', 'deepseekfa.com'],
}

const brandId = process.argv[2]
const brand = BRANDS[brandId]
if (!brand) {
  console.error(`unknown brand ${JSON.stringify(brandId)}; expected one of ${Object.keys(BRANDS).join(', ')}`)
  process.exit(1)
}

const out = join(here, 'dist', brandId, 'me')
const pages = ['index.html', 'keys.html', 'login.html', 'register.html']

await rm(join(here, 'dist', brandId), { recursive: true, force: true })
await mkdir(out, { recursive: true })

for (const page of pages) {
  let html = await readFile(join(here, 'me', page), 'utf8')
  for (const [token, value] of Object.entries(brand)) {
    if (typeof value !== 'string') continue
    html = html.replaceAll(`{{${token}}}`, value)
  }
  await writeFile(join(out, page), html)
}

for (const asset of ['app.js', 'dict.js', 'styles.css']) {
  await cp(join(here, 'me', asset), join(out, asset))
}
await cp(brand.icon, join(out, 'icon.svg'))

// Fail the build when a page still carries another brand's name/domain or an
// unresolved {{token}}. dict.js is shared on purpose and holds both brands, so it
// is not part of this check.
const problems = []
for (const page of pages) {
  const html = await readFile(join(out, page), 'utf8')
  for (const needle of FORBIDDEN[brandId]) {
    if (html.includes(needle)) problems.push(`${page}: 含有其它品牌字样 "${needle}"`)
  }
  const leftover = html.match(/\{\{[a-z]+\}\}/g)
  if (leftover) problems.push(`${page}: 未替换的占位符 ${[...new Set(leftover)].join(', ')}`)
}
if (problems.length > 0) {
  console.error(`console/${brandId} 构建校验失败：\n  ` + problems.join('\n  '))
  process.exit(1)
}

console.log(`built console/${brandId} -> ${resolve(out)}`)
