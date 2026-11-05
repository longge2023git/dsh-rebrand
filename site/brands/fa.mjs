/** DeepSeek-FA site brand: Persian-first, RTL. */
export default {
  id: 'fa',
  name: 'DeepSeek-FA',
  domain: 'deepseekfa.com',
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
      version: '0.2.1-rc.2.20261105.2',
      arch: 'arm64',
      size: '256 MiB',
      file: 'deepseek-fa-0.2.1-rc.2.20261105.2-mac-arm64-unsigned.dmg',
      sha256: '83ac1c0d507a6202376e6a4e0f34ccf4685f2d55434a0f86adf8b9b248e758a9',
    },
  ],
  windows: {
    slug: 'deepseek-fa-win-x64-unsigned',
    exe: '/downloads/deepseek-fa-win-x64-unsigned.exe',
    manifest: '/downloads/deepseek-fa-win-x64-unsigned.json',
  },
}
