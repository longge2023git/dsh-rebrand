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
      version: '0.2.1-rc.2.20261106.1',
      arch: 'arm64',
      size: '253 MiB',
      file: 'deepseek-ru-0.2.1-rc.2.20261106.1-mac-arm64-unsigned.dmg',
      sha256: '43c48b04b83271381b9a72ad4f9d4dce097f727d1daf4ece37687905ed78a521',
    },
  ],
  windows: {
    slug: 'deepseek-ru-win-x64-unsigned',
    exe: '/downloads/deepseek-ru-win-x64-unsigned.exe',
    manifest: '/downloads/deepseek-ru-win-x64-unsigned.json',
  },
}
