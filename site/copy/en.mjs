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
  nav: { home: 'Home', download: 'Download', docs: 'Getting started', signIn: 'Sign in', signUp: 'Sign up' },
  home: {
    lead: 'Chat, files, and automation in one desktop app.',
    intro:
      'Work with DeepSeek models straight from your desktop: send files and images, and create API keys for your own tools.',
    ctaDownload: 'Download the app',
    ctaDownloadMac: 'Download for macOS',
    ctaDownloadWin: 'Download for Windows',
    ctaRegister: 'Create account',
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
        body: 'A key is created automatically when you sign in — copy it from the console and use it in your own agent or application.',
      },
    ],
    stepsTitle: 'Start in three steps',
    steps: [
      { title: 'Install', body: 'Download the app and install it on macOS.' },
      { title: 'Sign in', body: 'Register with email or sign in to your account.' },
      { title: 'Start using it', body: 'Your API key is created on sign-in — use it in your own tool.' },
    ],
  },
  download: {
    lead: 'Builds are unsigned — allow the app in your security settings on first launch.',
    buttonWin: 'Download for Windows',
    button: 'Download for macOS',
    versionLabel: 'Version',
    sizeLabel: 'Size',
    shaLabel: 'SHA-256',
    windowsTitle: 'Windows · x64',
    soon: 'Coming soon',
    installTitle: 'Install',
    installSteps: [
      'macOS: open the dmg and drag {{brand}} into Applications. Windows: run the exe.',
      'If the system blocks it: macOS — System Settings → Privacy & Security → Open Anyway; Windows — More info → Run anyway.',
      'After signing in, your account and models connect automatically.',
    ],
    consoleHint: 'Account and API keys are managed in the',
    consoleLinkLabel: 'console',
    consoleHintEnd: '.',
  },
  docs: {
    lead: 'Signing in creates your API key automatically — point your tool at the base URL and use that key.',
    steps: [
      { title: 'Sign in', body: 'Register or sign in from the app.' },
      { title: 'Key is ready', body: 'In the console keys section, copy the key created at sign-in.' },
      { title: 'Connect', body: 'Set the base URL and that key in your agent or application.' },
    ],
    baseUrlLabel: 'Base URL',
    exampleTitle: 'Request example',
    note: 'Usage and balance are visible in the console.',
    consoleLinkLabel: 'Open console',
  },
  notFound: {
    title: 'Page not found',
    body: 'This address does not exist or has moved.',
    home: 'Back to home',
    download: 'Download page',
  },
  footer: { rights: 'All rights reserved.' },
}
