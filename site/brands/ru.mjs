/** DeepSeek-RU site brand: Russian-first, LTR. */
export default {
  id: 'ru',
  name: 'DeepSeek-RU',
  domain: 'deepseek-ru.org',
  appUrl: 'https://deepseek-ru.org',
  accent: '#2f6fed',
  defaultLocale: 'ru',
  locales: ['ru', 'en'],
  consoleUrl: 'https://deepseek-ru.org/me/keys',
  auth: {
    login: 'https://deepseek-ru.org/me/login',
    register: 'https://deepseek-ru.org/me/register',
  },
  downloads: [
    {
      platform: 'macOS · Apple Silicon',
      version: '0.2.1-rc.2.20261103.1',
      arch: 'arm64',
      size: '253 MiB',
      file: 'deepseek-ru-0.2.1-rc.2.20261103.1-mac-arm64-unsigned.dmg',
      sha256: '0e5f4415e58b61671bbf90466cb7bbde4b856c6bbcf2c33eab109c65027bf369',
    },
  ],
  windows: {
    slug: 'deepseek-ru-win-x64-unsigned',
    exe: '/downloads/deepseek-ru-win-x64-unsigned.exe',
    manifest: '/downloads/deepseek-ru-win-x64-unsigned.json',
  },
}
