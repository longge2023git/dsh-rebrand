/** DeepSeek-FA site brand: Persian-first, RTL. */
export default {
  id: 'fa',
  name: 'DeepSeek-FA',
  domain: 'www.deepseekfa.com',
  appUrl: 'https://deepseekfa.com',
  accent: '#3b82f6',
  defaultLocale: 'fa',
  locales: ['fa', 'en'],
  consoleUrl: 'https://deepseekfa.com/me/keys',
  auth: {
    login: 'https://deepseekfa.com/me/login',
    register: 'https://deepseekfa.com/me/register',
  },
  downloads: [
    {
      platform: 'macOS · Apple Silicon',
      version: '0.2.1-rc.2.20261102.1',
      arch: 'arm64',
      size: '256 MiB',
      file: 'deepseek-fa-0.2.1-rc.2.20261102.1-mac-arm64-unsigned.dmg',
      sha256: '6cc062ace86249520c0bfa1ee20b6999f9b821dc46e02a4a09771aafe0a6ae90',
    },
  ],
  windows: {
    slug: 'deepseek-fa-win-x64-unsigned',
    exe: '/downloads/deepseek-fa-win-x64-unsigned.exe',
    manifest: '/downloads/deepseek-fa-win-x64-unsigned.json',
  },
}
