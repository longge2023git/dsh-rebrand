#!/usr/bin/env node
/**
 * Mini-site E2E runner.
 *
 *   node tools/e2e/run.mjs --mode local --brand fa
 *   node tools/e2e/run.mjs --mode live  --brand both
 *
 * local: serves console/dist/<brand> with mocked APIs (no data, no production impact)
 * live:  real gateway, creates temp users; set E2E_SSH_FA / E2E_SSH_RU to auto-delete them
 */
import { createServer } from 'node:net'
import { Checker, BRANDS, cleanupUsers } from './lib.mjs'
import { serve } from './serve.mjs'
import { runSite } from './suites/site.mjs'
import { runConsoleLocal } from './suites/console-local.mjs'
import { runConsoleLive } from './suites/console-live.mjs'
import { runDesktop } from './suites/desktop.mjs'
import { runSecurity } from './suites/security.mjs'

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
  if (value.startsWith('--')) pairs.push([value.slice(2), all[index + 1] ?? 'true'])
  return pairs
}, []))

const mode = args.mode ?? 'local'
const suite = args.suite ?? 'all'
const brands = args.brand === 'both' ? ['fa', 'ru'] : [args.brand ?? 'fa']
if (!['local', 'live'].includes(mode)) throw new Error('--mode local|live')
for (const brand of brands) if (!BRANDS[brand]) throw new Error(`unknown brand ${brand}`)

const DB = { fa: '/opt/dsh-gateway/data/one-api.db', ru: '/opt/dsh-gateway-ru/data/one-api.db' }
const freePort = () => new Promise((resolve) => {
  const server = createServer().listen(0, () => {
    const { port } = server.address()
    server.close(() => resolve(port))
  })
})

const failures = []
for (const brandId of brands) {
  const brand = BRANDS[brandId]
  const checker = new Checker(`${brandId}/${mode}`)
  const users = []
  let server
  try {
    if (mode === 'local') {
      const port = await freePort()
      server = await serve(`console/dist/${brandId}`, port)
      brand.app = `http://127.0.0.1:${port}`
    }
    if (mode === 'live') {
      if (suite === 'all' || suite === 'site') await runSite({ brand, checker })
      if (suite === 'all' || suite === 'console') await runConsoleLive({ brand, checker, users })
      if (suite === 'all' || suite === 'desktop') await runDesktop({ brand, checker, users })
      if (suite === 'all' || suite === 'security') await runSecurity({ brand, checker, users })
    } else {
      await runConsoleLocal({ base: brand.app, brand, checker })
    }
  } catch (error) {
    checker.check('未捕获异常', false, error.message)
  } finally {
    if (server) server.close()
    if (mode === 'live') cleanupUsers(brandId, users, DB[brandId])
    if (!checker.summary()) failures.push(checker.tag)
  }
}

console.log(failures.length === 0 ? '\n全部套件通过' : `\n失败套件: ${failures.join(', ')}`)
process.exitCode = failures.length === 0 ? 0 : 1
