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
      version: '0.2.1-rc.2.20261103.1',
      arch: 'arm64',
      size: '256 MiB',
      file: 'deepseek-fa-0.2.1-rc.2.20261103.1-mac-arm64-unsigned.dmg',
      sha256: '16475769b32de48e9cc61a243ea793187325314efc2598a920d8ffcd2ef4d7b4',
    },
  ],
  windows: {
    slug: 'deepseek-fa-win-x64-unsigned',
    exe: '/downloads/deepseek-fa-win-x64-unsigned.exe',
    manifest: '/downloads/deepseek-fa-win-x64-unsigned.json',
  },
}
