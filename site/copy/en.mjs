/**
 * English copy shared by both brands. `{{brand}}` is replaced at build time.
 */
export default {
  lang: 'en',
  dir: 'ltr',
  switchLabel: 'RU',
  meta: {
    title: '{{brand}} — desktop assistant for DeepSeek models',
    description:
      'The {{brand}} desktop app: chat with DeepSeek models, work with files and images, and create API keys for your own tools.',
  },
  nav: { home: 'Home', download: 'Download', docs: 'Getting started', app: 'Open app' },
  home: {
    lead: 'Chat, files, and automation in one desktop app.',
    intro:
      'Work with DeepSeek models straight from your desktop: send files and images, and create API keys for your own tools.',
    ctaDownload: 'Download for macOS',
    ctaApp: 'Open app',
    featuresTitle: 'What it does',
    features: [
      {
        title: 'Chat with DeepSeek models',
        body: 'Fast answers with reasoning support, long inputs, and conversations you can continue in separate sessions.',
      },
      {
        title: 'Files and images',
        body: 'Send files and images directly in the conversation and get the result in place.',
      },
      {
        title: 'API keys for your tools',
        body: 'Create a key and use the DeepSeek API from your own agent or application.',
      },
    ],
    stepsTitle: 'Start in three steps',
    steps: [
      { title: 'Install', body: 'Download the app and install it on macOS.' },
      { title: 'Sign in', body: 'Register with email or sign in to your account.' },
      { title: 'API key', body: 'Create a key in the console and paste it into your tool.' },
    ],
  },
  download: {
    lead: 'Builds are unsigned — allow the app in your security settings on first launch.',
    button: 'Download for macOS',
    versionLabel: 'Version',
    sizeLabel: 'Size',
    shaLabel: 'SHA-256',
    windowsTitle: 'Windows · x64',
    soon: 'Coming soon',
    installTitle: 'Install',
    installSteps: [
      'Open the dmg and drag {{brand}} into Applications.',
      'If macOS blocks the launch: System Settings → Privacy & Security → Open Anyway, or right-click the app and choose Open.',
      'After signing in, your account and models connect automatically.',
    ],
    consoleHint: 'Account and API keys are managed in the',
    consoleLinkLabel: 'console',
    consoleHintEnd: '.',
  },
  docs: {
    lead: 'To use the DeepSeek API from your own tool, create a key and point it at the base URL.',
    steps: [
      { title: 'Open the console', body: 'Sign in with the same account you use in the app.' },
      { title: 'Create a key', body: 'Open the keys section, create a key, and copy it.' },
      { title: 'Connect', body: 'Set the base URL and the key in your agent or application.' },
    ],
    baseUrlLabel: 'Base URL',
    exampleTitle: 'Request example',
    note: 'Usage and balance are visible in the console.',
    consoleLinkLabel: 'Open console',
  },
  footer: { rights: 'All rights reserved.' },
}
