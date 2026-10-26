/** vv-worker identity used by the packaged Electron shell. */

/** User-facing product name; packaging scripts use the same value from `config/brand.mjs`. */
export const PRODUCT_NAME = 'vv-worker'
/** Harness home directory for the branded installation; the official `~/.dsh` stays untouched. */
export const HOME_DIR_NAME = '.vv-worker'
/** First-run profile overlay that points both account and inference at the gateway. */
export const DESKTOP_PROFILE_PATCH = `- id: deepseek-account
  name: '@deepseek-ai/dsh-deepseek-account-platform'
  config:
    platformOrigin: https://vvworker.51vv.com
    inferenceOrigin: https://vvworker.51vv.com
    usagePath: /console/log
    topUpPath: /console/topup
    desktopPlatform: !!js "ctx.get('profileContext')?.name === 'desktop' && ['darwin', 'win32'].includes(process.platform) ? process.platform : null"

- id: llm-deepseek-account
  name: '@deepseek-ai/dsh-llm-deepseek-account'
  config:
    baseURL: https://vvworker.51vv.com/v1

- id: agent-default-model
  config:
    provider: deepseek-account
    model: deepseek-flash
`
