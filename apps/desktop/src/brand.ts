/** DeepSeek-RU identity used by the packaged Electron shell. */

/** User-facing product name; packaging scripts use the same value from `config/brand.mjs`. */
export const PRODUCT_NAME = 'DeepSeek-RU'
/** Harness home directory for the branded installation; the official `~/.dsh` stays untouched. */
export const HOME_DIR_NAME = '.deepseek-ru'
/** Gateway origin: account, inference, release notices, and download links. */
export const PLATFORM_ORIGIN = 'https://deepseek-ru.org'

/** First-run profile overlay that points both account and inference at the gateway. */
export const DESKTOP_PROFILE_PATCH = `- id: deepseek-account
  name: '@deepseek-ai/dsh-deepseek-account-platform'
  config:
    platformOrigin: ${PLATFORM_ORIGIN}
    inferenceOrigin: ${PLATFORM_ORIGIN}
    usagePath: /me/
    topUpPath: /me/topup
    desktopPlatform: !!js "ctx.get('profileContext')?.name === 'desktop' && ['darwin', 'win32'].includes(process.platform) ? process.platform : null"

- id: llm-deepseek-account
  name: '@deepseek-ai/dsh-llm-deepseek-account'
  config:
    baseURL: ${PLATFORM_ORIGIN}/v1
`
