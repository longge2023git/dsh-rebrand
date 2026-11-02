/** Page rendering for the static brand sites. No runtime dependencies. */

const WHALE = '<svg viewBox="0 0 1024 1024" aria-hidden="true"><path fill="currentColor" d="M512 64a448 448 0 1 0 0 896 448 448 0 0 0 0-896Zm0 104a344 344 0 0 1 148 652c-6-70-36-126-92-166-40-29-88-46-136-52-34-4-58-30-58-64 0-38 32-68 70-64 40 4 66 34 74 70 6 26 30 44 56 40 30-4 50-32 44-62-14-70-76-122-150-118-80 4-140 72-136 152 2 40 18 76 44 104-30 12-56 32-74 60a344 344 0 0 1 210-552Z"/></svg>'

/**
 * Replace `{{brand}}` tokens in a copy value.
 * @param {string} value Copy string, possibly containing tokens.
 * @param {{ name: string }} brand Brand whose name fills the token.
 * @returns {string} Copy with tokens expanded.
 */
const fill = (value, brand) => String(value).replaceAll('{{brand}}', brand.name)

/**
 * Expand every string inside a nested copy object.
 * @param {unknown} value Copy tree.
 * @param {{ name: string }} brand Brand whose name fills the tokens.
 * @returns {unknown} Copy tree with tokens expanded.
 */
function fillDeep(value, brand) {
  if (typeof value === 'string') return fill(value, brand)
  if (Array.isArray(value)) return value.map((item) => fillDeep(item, brand))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, fillDeep(item, brand)]))
  }
  return value
}

/**
 * Build the locale prefix used by URLs: the default locale lives at the root.
 * @param {{ defaultLocale: string }} brand Brand configuration.
 * @param {string} locale Locale being rendered.
 * @returns {string} '' for the default locale, '/<locale>' otherwise.
 */
export const prefixOf = (brand, locale) => (locale === brand.defaultLocale ? '' : `/${locale}`)

/**
 * Resolve an absolute path for one page in one locale.
 * @param {{ defaultLocale: string }} brand Brand configuration.
 * @param {string} locale Locale being rendered.
 * @param {string} page Page id: '' for home, otherwise 'download' or 'docs'.
 * @returns {string} Absolute URL path.
 */
export const pathOf = (brand, locale, page) => {
  const prefix = prefixOf(brand, locale)
  if (!page) return `${prefix}/`
  return `${prefix}/${page}`
}

/**
 * Render one full page.
 * @param {object} options Render inputs.
 * @param {object} options.brand Brand configuration.
 * @param {object} options.copy Locale copy, already filled.
 * @param {string} options.locale Locale being rendered.
 * @param {string} options.page Page id ('' | 'download' | 'docs').
 * @param {string} options.body Page body HTML.
 * @returns {string} Complete HTML document.
 */
export function layout({ brand, copy, locale, page, body }) {
  const other = brand.locales.find((item) => item !== locale)
  const otherPath = pathOf(brand, other, page)
  const otherLabel = { fa: 'FA', ru: 'RU', en: 'EN' }[other] ?? other.toUpperCase()
  const here = pathOf(brand, locale, page)
  const navLink = (id, label) => {
    const href = pathOf(brand, locale, id)
    const current = id === page ? ' aria-current="page"' : ''
    return `<a href="${href}"${current}>${label}</a>`
  }
  const langLink = `<div class="lang"><a href="${otherPath}" hreflang="${other}" lang="${other}">${otherLabel}</a></div>`

  return `<!doctype html>
<html lang="${locale}" dir="${copy.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${copy.meta.title}</title>
<meta name="description" content="${copy.meta.description}">
<meta property="og:title" content="${copy.meta.title}">
<meta property="og:description" content="${copy.meta.description}">
<meta property="og:type" content="website">
<link rel="stylesheet" href="/styles.css">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="canonical" href="https://${brand.domain}${here}">
</head>
<body>
<main>
  <header class="site">
    <a class="brand" href="${pathOf(brand, locale, '')}">${WHALE}${brand.name}</a>
    <nav class="links">
      ${navLink('', copy.nav.home)}
      ${navLink('download', copy.nav.download)}
      ${navLink('docs', copy.nav.docs)}
      <a class="app" href="${brand.appUrl}">${copy.nav.app}</a>
      ${langLink}
    </nav>
  </header>
  ${body}
  <footer class="site">
    <span>${brand.name} · ${brand.domain}</span>
    <span>© ${new Date().getFullYear()} ${brand.name}. ${copy.footer.rights}</span>
  </footer>
</main>
</body>
</html>
`
}

/**
 * Home page body: hero, features, and the three-step onboarding.
 * @param {object} brand Brand configuration.
 * @param {object} copy Locale copy.
 * @returns {string} Page body HTML.
 */
export const homeBody = (brand, copy) => {
  const features = copy.home.features
    .map((item) => `<article class="card"><h3>${item.title}</h3><p>${item.body}</p></article>`)
    .join('\n      ')
  const steps = copy.home.steps
    .map((item) => `<article class="card"><h3>${item.title}</h3><p>${item.body}</p></article>`)
    .join('\n      ')

  return `<section class="hero">
    <h1>${brand.name}</h1>
    <p class="lead">${copy.home.lead}</p>
    <p class="intro">${copy.home.intro}</p>
    <div class="actions">
      <a class="button" href="${pathOf(brand, copy.lang, 'download')}">${copy.home.ctaDownload}</a>
      <a class="button secondary" href="${brand.appUrl}">${copy.home.ctaApp}</a>
    </div>
  </section>

  <section>
    <h2>${copy.home.featuresTitle}</h2>
    <div class="grid">
      ${features}
    </div>
  </section>

  <section>
    <h2>${copy.home.stepsTitle}</h2>
    <div class="steps">
      ${steps}
    </div>
  </section>`
}

/**
 * Download page body: one card per platform, checksums, and install notes.
 * @param {object} brand Brand configuration.
 * @param {object} copy Locale copy.
 * @returns {string} Page body HTML.
 */
export const downloadBody = (brand, copy) => {
  const cards = brand.downloads
    .map((item) => `<article class="card dl-card">
      <h3>${item.platform}</h3>
      <p class="meta">${copy.download.versionLabel} ${item.version} · ${item.arch} · ${item.size}</p>
      <a class="button" href="/downloads/${item.file}" download>${copy.download.button}</a>
      <p class="sha">${copy.download.shaLabel}: <code>${item.sha256}</code></p>
    </article>`)
    .join('\n    ')

  const windows = brand.windows === 'soon'
    ? `<article class="card dl-card">
      <h3>${copy.download.windowsTitle}</h3>
      <p class="meta">&nbsp;</p>
      <span class="soon">${copy.download.soon}</span>
    </article>`
    : ''

  const notes = copy.download.installSteps.map((step) => `<li>${step}</li>`).join('\n        ')

  return `<section class="hero">
    <h1>${copy.nav.download}</h1>
    <p class="intro">${copy.download.lead}</p>
  </section>

  <section>
    <div class="grid">
      ${cards}
      ${windows}
    </div>
  </section>

  <section>
    <h2>${copy.download.installTitle}</h2>
    <div class="notes">
      <ol>
        ${notes}
      </ol>
      <p>${copy.download.consoleHint} <a href="${brand.consoleUrl}">${copy.download.consoleLinkLabel}</a>${copy.download.consoleHintEnd}</p>
    </div>
  </section>`
}

/**
 * Getting-started page body: console steps, base URL, and a request example.
 * @param {object} brand Brand configuration.
 * @param {object} copy Locale copy.
 * @returns {string} Page body HTML.
 */
export const docsBody = (brand, copy) => {
  const steps = copy.docs.steps
    .map((item) => `<article class="card"><h3>${item.title}</h3><p>${item.body}</p></article>`)
    .join('\n      ')

  const example = `curl ${brand.appUrl}/v1/chat/completions \\
  -H "Authorization: Bearer $DEEPSEEK_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"deepseek-flash","messages":[{"role":"user","content":"hello"}],"stream":true}'`

  return `<section class="hero">
    <h1>${copy.nav.docs}</h1>
    <p class="intro">${copy.docs.lead}</p>
  </section>

  <section>
    <div class="steps">
      ${steps}
    </div>
  </section>

  <section>
    <h2>${copy.docs.baseUrlLabel}</h2>
    <div class="base-url"><code>${brand.appUrl}/v1</code></div>
  </section>

  <section>
    <h2>${copy.docs.exampleTitle}</h2>
    <pre>${example}</pre>
    <p class="notes">${copy.docs.note} <a href="${brand.consoleUrl}">${copy.docs.consoleLinkLabel}</a></p>
  </section>`
}

export { fillDeep }
