/**
 * Persian copy for the DeepSeek-FA site. `{{brand}}` is replaced with the brand
 * name at build time so the same copy can be reused by another brand if needed.
 */
export default {
  lang: 'fa',
  dir: 'rtl',
  switchLabel: 'EN',
  meta: {
    title: '{{brand}} — دستیار هوش مصنوعی برای دسکتاپ',
    description:
      'برنامه دسکتاپ {{brand}}: گفت‌وگو با مدل‌های DeepSeek، کار با فایل و تصویر، و ساخت کلید API برای ابزارهای خودتان.',
  },
  nav: { home: 'خانه', download: 'دانلود', docs: 'راهنما', app: 'ورود به برنامه' },
  home: {
    lead: 'چت، فایل و خودکارسازی در یک برنامه دسکتاپ.',
    intro:
      'با {{brand}} مستقیم از دسکتاپ خود با مدل‌های DeepSeek کار کنید؛ فایل و تصویر بفرستید و برای ابزارهای شخصی خود کلید API بسازید.',
    ctaDownload: 'دانلود برای macOS',
    ctaApp: 'ورود به برنامه',
    featuresTitle: 'چه کاری انجام می‌دهد',
    features: [
      {
        title: 'گفت‌وگو با مدل‌های DeepSeek',
        body: 'پاسخ سریع با پشتیبانی از استدلال، متن طولانی و ادامهٔ گفت‌وگو در چند نشست.',
      },
      {
        title: 'فایل و تصویر',
        body: 'فایل و تصویر را مستقیم در گفت‌وگو بفرستید و نتیجه را در همان‌جا بگیرید.',
      },
      {
        title: 'کلید API برای ابزارهای شما',
        body: 'یک کلید بسازید و از DeepSeek API در agent یا برنامهٔ خودتان استفاده کنید.',
      },
    ],
    stepsTitle: 'در سه گام شروع کنید',
    steps: [
      { title: 'نصب', body: 'برنامه را دانلود و روی macOS نصب کنید.' },
      { title: 'ورود', body: 'با ایمیل ثبت‌نام کنید یا وارد حساب خود شوید.' },
      { title: 'کلید API', body: 'در کنسول کلید بسازید و در ابزار دلخواه خود قرار دهید.' },
    ],
  },
  download: {
    lead: 'نسخه‌ها بدون امضای Apple هستند؛ در اولین اجرا برنامه را در تنظیمات امنیتی مجاز کنید.',
    button: 'دانلود برای macOS',
    versionLabel: 'نسخه',
    sizeLabel: 'حجم',
    shaLabel: 'SHA-256',
    windowsTitle: 'Windows · x64',
    soon: 'به‌زودی',
    installTitle: 'راهنمای نصب',
    installSteps: [
      'فایل dmg را باز کنید و {{brand}} را به پوشهٔ Applications بکشید.',
      'اگر macOS اجرا را مسدود کرد: System Settings → Privacy & Security → Open Anyway را بزنید، یا روی برنامه راست‌کلیک کرده و Open را انتخاب کنید.',
      'پس از ورود، مدل‌ها و حساب شما به‌صورت خودکار متصل می‌شوند.',
    ],
    consoleHint: 'حساب و کلید API از طریق',
    consoleLinkLabel: 'کنسول',
    consoleHintEnd: 'مدیریت می‌شود.',
  },
  docs: {
    lead: 'برای استفاده از DeepSeek API در ابزار خود، یک کلید بسازید و آدرس پایه را تنظیم کنید.',
    steps: [
      { title: 'ورود به کنسول', body: 'با همان حسابی که در برنامه ثبت‌نام کرده‌اید وارد کنسول شوید.' },
      { title: 'ساخت کلید', body: 'در بخش کلیدها یک کلید جدید بسازید و آن را کپی کنید.' },
      { title: 'اتصال', body: 'آدرس پایه و کلید را در agent یا برنامهٔ خود قرار دهید.' },
    ],
    baseUrlLabel: 'آدرس پایه',
    exampleTitle: 'نمونهٔ درخواست',
    note: 'مصرف و موجودی را می‌توانید در کنسول ببینید.',
    consoleLinkLabel: 'باز کردن کنسول',
  },
  footer: { rights: 'همهٔ حقوق محفوظ است.' },
}
