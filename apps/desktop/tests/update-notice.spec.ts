import { expect, it, vi } from 'vitest'
import { isNewerRelease, parseReleaseNotice, startUpdateNotice } from '../src/update-notice.ts'

it('accepts a published release document and rejects unusable ones', () => {
  expect(parseReleaseNotice({ latest: '0.2.1-rc.2.20261105.2', downloadUrl: 'https://deepseekfa.com/download' }))
    .toEqual({ latest: '0.2.1-rc.2.20261105.2', downloadUrl: 'https://deepseekfa.com/download' })
  expect(parseReleaseNotice({ latest: 'not-a-version', downloadUrl: 'https://x.test/' })).toBeNull()
  expect(parseReleaseNotice({ latest: '1.0.0', downloadUrl: 'javascript:alert(1)' })).toBeNull()
  expect(parseReleaseNotice(null)).toBeNull()
})

it('compares release versions including prereleases', () => {
  expect(isNewerRelease('0.2.1-rc.2.20261105.2', '0.2.1-rc.2.20261105.1')).toBe(true)
  expect(isNewerRelease('0.2.1-rc.2.20261105.1', '0.2.1-rc.2.20261105.1')).toBe(false)
  expect(isNewerRelease('0.2.1-rc.1', '0.2.1-rc.2')).toBe(false)
  expect(isNewerRelease('0.3.0', '0.2.1-rc.2')).toBe(true)
  expect(isNewerRelease('garbage', '0.2.1')).toBe(false)
})

it('shows a newer release once and stays quiet after dismissal', async () => {
  const show = vi.fn()
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ latest: '0.2.1-rc.2.20261105.2', downloadUrl: 'https://x.test/download' }), { status: 200 }))
  let skipped: string | undefined
  const stop = startUpdateNotice({ endpoint: 'https://x.test/version.json', currentVersion: '0.2.1-rc.2.20261105.1', show, fetchImpl: fetchImpl as unknown as typeof fetch, intervalMs: 10_000, initialDelayMs: 0 })
  await vi.waitFor(() => { expect(show).toHaveBeenCalledTimes(1) })
  stop()

  const quiet = vi.fn()
  skipped = '0.2.1-rc.2.20261105.2'
  const stopQuiet = startUpdateNotice({
    endpoint: 'https://x.test/version.json', currentVersion: '0.2.1-rc.2.20261105.1', show: quiet,
    skippedVersion: () => skipped, fetchImpl: fetchImpl as unknown as typeof fetch, intervalMs: 10_000, initialDelayMs: 0,
  })
  await new Promise((resolve) => setTimeout(resolve, 50))
  expect(quiet).not.toHaveBeenCalled()
  stopQuiet()
})

it('silently ignores a missing release file', async () => {
  const show = vi.fn()
  const fetchImpl = vi.fn(async () => new Response('not found', { status: 404 }))
  const stop = startUpdateNotice({ endpoint: 'https://x.test/version.json', currentVersion: '1.0.0', show, fetchImpl: fetchImpl as unknown as typeof fetch, intervalMs: 10_000, initialDelayMs: 0 })
  await new Promise((resolve) => setTimeout(resolve, 50))
  expect(show).not.toHaveBeenCalled()
  stop()
})
