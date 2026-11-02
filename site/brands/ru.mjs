/** DeepSeek-RU site brand: Russian-first, LTR. */
export default {
  id: 'ru',
  name: 'DeepSeek-RU',
  domain: 'www.deepseek-ru.org',
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
      version: '0.2.1-rc.2.20261031.1',
      arch: 'arm64',
      size: '253 MiB',
      file: 'deepseek-ru-0.2.1-rc.2.20261031.1-mac-arm64-unsigned.dmg',
      sha256: 'bb149280dbea57b22ad1525ce7c140fb6b25ee1bb6fc9cd15e47a9de773d3893',
    },
  ],
  windows: {
    slug: 'deepseek-ru-win-x64-unsigned',
    exe: '/downloads/deepseek-ru-win-x64-unsigned.exe',
    manifest: '/downloads/deepseek-ru-win-x64-unsigned.json',
  },
}
