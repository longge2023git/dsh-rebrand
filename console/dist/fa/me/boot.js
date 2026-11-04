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
  if (typeof start === 'function') start()
})()
