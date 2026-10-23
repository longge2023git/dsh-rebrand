/** DeepSeek-FA desktop identity shared by the Electron shell and packaging scripts. */
export const PRODUCT_NAME = 'DeepSeek-FA'
export const PACKAGE_SLUG = 'deepseek-fa'
export const APP_ID = 'com.deepseek-fa.harness'
export const HOME_DIR_NAME = '.deepseek-fa'
export const PROTOCOL_SCHEME = 'dsh'
export const GATEWAY_ORIGIN = 'https://ds.openrouters.org'

/** First-run desktop profile overlay for the DeepSeek-FA gateway. */
export const DESKTOP_PROFILE_PATCH = `- id: deepseek-account
  name: '@deepseek-ai/dsh-deepseek-account-platform'
  config:
    platformOrigin: ${GATEWAY_ORIGIN}
    inferenceOrigin: ${GATEWAY_ORIGIN}
    usagePath: /console/log
    topUpPath: /console/topup
    desktopPlatform: !!js "ctx.get('profileContext')?.name === 'desktop' && ['darwin', 'win32'].includes(process.platform) ? process.platform : null"

- id: llm-deepseek-account
  name: '@deepseek-ai/dsh-llm-deepseek-account'
  config:
    baseURL: ${GATEWAY_ORIGIN}/v1
`
