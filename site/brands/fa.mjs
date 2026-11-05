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
      version: '0.2.1-rc.2.20261106.1',
      arch: 'arm64',
      size: '256 MiB',
      file: 'deepseek-fa-0.2.1-rc.2.20261106.1-mac-arm64-unsigned.dmg',
      sha256: '95700d2d1c2c57251099ef0a782498c364b49552e85927de3020555cb3a501b8',
    },
  ],
  windows: {
    slug: 'deepseek-fa-win-x64-unsigned',
    exe: '/downloads/deepseek-fa-win-x64-unsigned.exe',
    manifest: '/downloads/deepseek-fa-win-x64-unsigned.json',
  },
}
