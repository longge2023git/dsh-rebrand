/** Page rendering for the static brand sites. No runtime dependencies. */

/** Brand mark copied from the shipped desktop app icon. */
const logo = (version) => `<img class="logo" src="/assets/icon.svg?v=${version}" alt="" width="30" height="30">`

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
export function layout({ brand, copy, locale, page, body, version }) {
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
<meta property="og:site_name" content="${brand.name}">
<meta property="og:image" content="https://${brand.domain}/assets/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://${brand.domain}/assets/og.png">
<link rel="stylesheet" href="/styles.css?v=${version}">
<link rel="icon" href="/assets/icon.svg?v=${version}" type="image/svg+xml">
<link rel="icon" href="/assets/icon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="/assets/icon-180.png">
<link rel="canonical" href="https://${brand.domain}${here}">
</head>
<body>
<main>
  <header class="site">
    <a class="brand" href="${pathOf(brand, locale, '')}">${logo(version)}<span class="brand-name">${brand.name}</span></a>
    <nav class="links">
      ${navLink('', copy.nav.home)}
      ${navLink('download', copy.nav.download)}
      ${navLink('docs', copy.nav.docs)}
      <a class="app" href="${brand.auth.login}">${copy.nav.signIn}</a>
      <a class="app primary" href="${brand.auth.register}">${copy.nav.signUp}</a>
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
export const homeBody = (brand, copy, version) => {
  const features = copy.home.features
    .map((item) => `<article class="card"><h3>${item.title}</h3><p>${item.body}</p></article>`)
    .join('\n      ')
  const steps = copy.home.steps
    .map((item) => `<article class="card"><h3>${item.title}</h3><p>${item.body}</p></article>`)
    .join('\n      ')

  return `<section class="hero">
    <img class="hero-logo" src="/assets/icon.svg?v=${version}" alt="" width="84" height="84">
    <h1>${brand.name}</h1>
    <p class="lead">${copy.home.lead}</p>
    <p class="intro">${copy.home.intro}</p>
    <div class="actions">
      <a class="button" href="${pathOf(brand, copy.lang, 'download')}">${copy.home.ctaDownload}</a>
      <a class="button secondary" href="${brand.auth.register}">${copy.home.ctaRegister}</a>
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

/**
 * 404 body: one line of explanation and two ways out.
 * @param {object} brand Brand configuration.
 * @param {object} copy Locale copy.
 * @returns {string} Page body HTML.
 */
export const notFoundBody = (brand, copy) => `<section class="hero">
    <h1>${copy.notFound.title}</h1>
    <p class="intro">${copy.notFound.body}</p>
    <div class="actions">
      <a class="button" href="${pathOf(brand, copy.lang, '')}">${copy.notFound.home}</a>
      <a class="button secondary" href="${pathOf(brand, copy.lang, 'download')}">${copy.notFound.download}</a>
    </div>
  </section>`

export { fillDeep }
