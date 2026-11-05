/**
 * Release notice for builds that cannot self-update: fetch the published version,
 * compare it with the running build, and hand the result to the caller's prompt.
 *
 * The electron-updater flow stays authoritative for signed installs; this module
 * only notifies, so it works for unsigned builds that Squirrel.Mac would reject.
 */
import { gt, valid } from 'semver'

/** Published release facts a build compares itself against. */
export interface ReleaseNotice {
  /** Published release version, for example `0.2.1-rc.2.20261105.2`. */
  readonly latest: string
  /** Page a user opens to download the build for their platform. */
  readonly downloadUrl: string
}

/**
 * Validate the published `/version.json` document.
 * @param value - Parsed JSON from the release endpoint.
 * @returns The notice, or `null` when the document is unusable.
 */
export function parseReleaseNotice(value: unknown): ReleaseNotice | null {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as { latest?: unknown; downloadUrl?: unknown }
  if (typeof candidate.latest !== 'string' || valid(candidate.latest) === null) return null
  if (typeof candidate.downloadUrl !== 'string' || !/^https?:\/\//u.test(candidate.downloadUrl)) return null
  return { latest: candidate.latest, downloadUrl: candidate.downloadUrl }
}

/**
 * Decide whether the published version supersedes the running build.
 * @param latest - Published version.
 * @param current - Running application version.
 * @returns True only when both versions parse and `latest` is greater.
 */
export function isNewerRelease(latest: string, current: string): boolean {
  if (valid(latest) === null || valid(current) === null) return false
  return gt(latest, current)
}

/** Side effects the scheduler needs; injected so tests avoid timers and network. */
export interface UpdateNoticeOptions {
  /** Absolute URL of the published `/version.json`. */
  readonly endpoint: string
  /** Version of the running build. */
  readonly currentVersion: string
  /** Called once per newer release that the user has not dismissed. */
  readonly show: (notice: ReleaseNotice) => void
  /** Version the user dismissed, if any. */
  readonly skippedVersion?: () => string | undefined
  /** Fetch implementation; defaults to the global one. */
  readonly fetchImpl?: typeof fetch
  /** Repeat interval; defaults to six hours. */
  readonly intervalMs?: number
  /** Delay before the first check so startup stays responsive. */
  readonly initialDelayMs?: number
}

/**
 * Start the notice loop.
 * @param options - Release endpoint, current version, and prompt callback.
 * @returns A function that stops further checks.
 */
export function startUpdateNotice(options: UpdateNoticeOptions): () => void {
  const { endpoint, currentVersion, show } = options
  const fetchImpl = options.fetchImpl ?? fetch
  const intervalMs = options.intervalMs ?? 6 * 60 * 60 * 1000
  const initialDelayMs = options.initialDelayMs ?? 5_000
  let stopped = false

  const check = async (): Promise<void> => {
    if (stopped) return
    try {
      const response = await fetchImpl(endpoint, { cache: 'no-store', redirect: 'follow' })
      if (!response.ok) return
      const notice = parseReleaseNotice(await response.json())
      if (notice === null || !isNewerRelease(notice.latest, currentVersion)) return
      if (options.skippedVersion?.() === notice.latest) return
      if (!stopped) show(notice)
    } catch {
      // A missing or unreachable release file must never surface as an error.
    }
  }

  const timer = setTimeout(() => { void check() }, initialDelayMs)
  const interval = setInterval(() => { void check() }, intervalMs)
  return () => {
    stopped = true
    clearTimeout(timer)
    clearInterval(interval)
  }
}
