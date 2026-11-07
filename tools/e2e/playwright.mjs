/**
 * Resolve playwright-core without adding it to the repository dependencies.
 * Point E2E_PLAYWRIGHT at a local install, e.g.
 *   E2E_PLAYWRIGHT=/tmp/pw/node_modules/playwright-core/index.mjs
 */
export const { chromium } = await import(process.env.E2E_PLAYWRIGHT || 'playwright-core')
