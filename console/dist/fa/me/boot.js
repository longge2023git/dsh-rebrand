/**
 * Boots the page named by <body data-page="...">. Keeping the dispatch here lets
 * the pages ship without inline scripts, so nginx can enforce a strict CSP.
 */
(() => {
  const starters = {
    usage: startUsage,
    keys: startKeys,
    login: startLogin,
    register: startRegister,
    dsh: startDsh,
    topup: startTopup,
    account: startAccount,
    forgot: startForgot,
    reset: startReset,
    pricing: startPricing,
  }
  const start = starters[document.body.dataset.page]
  // The desktop app's embedded view has no cookies; trade the exposed account token
  // for a session before the page reads anything.
  const ready = typeof bootstrapPlatformSession === 'function' && sessionUserId() === 0
    ? bootstrapPlatformSession().catch(() => false)
    : Promise.resolve(false)
  void ready.then(() => { if (typeof start === 'function') start() })
})()
