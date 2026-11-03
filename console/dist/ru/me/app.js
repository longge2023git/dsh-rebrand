/* Persian/English console for the DeepSeek-FA gateway.
   Same origin as the API, so the New API session cookie authenticates every call. */
/* global DICT */

const requestLang = new URLSearchParams(location.search).get('lang')
const storedLang = localStorage.getItem('console-lang')
const defaultLang = document.documentElement.dataset.defaultLang || 'fa'
const LANG = ['fa', 'ru', 'en'].includes(requestLang)
  ? requestLang
  : (['fa', 'ru', 'en'].includes(storedLang) ? storedLang : defaultLang)
const D = DICT[LANG]
const numberLocale = LANG === 'fa' ? 'fa-IR' : 'en-US'

const state = { quotaPerUnit: 500000, page: 1, pageSize: 20, emailVerification: false, turnstile: false, tokens: [] }

const $ = (id) => document.getElementById(id)
const num = (value) => new Intl.NumberFormat(numberLocale).format(Math.round(Number(value) || 0))

/** Resolve a dotted dictionary key, substituting {placeholders}. */
function t(path, vars = {}) {
  if (!path) return ''
  const value = path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), D)
  if (typeof value !== 'string') return path
  return value.replace(/\{(\w+)\}/g, (_, key) => (vars[key] === undefined ? '' : String(vars[key])))
}

const credit = (quota) => (Number(quota || 0) / state.quotaPerUnit).toFixed(2)
/** Per-call costs are often far below 0.01 credits, so keep more decimals there. */
const cost = (quota) => {
  const value = Number(quota || 0) / state.quotaPerUnit
  if (value === 0) return '0'
  if (value < 0.0001) return value.toFixed(6)
  return value < 0.01 ? value.toFixed(4) : value.toFixed(2)
}
/** Gateway writes -1 for ratios a request did not use. */
const val = (value) => (value === undefined || value === null || value === -1 ? '—' : value)
const stamp = (seconds) => (seconds
  ? new Date(seconds * 1000).toLocaleString(numberLocale, { dateStyle: 'short', timeStyle: 'short' })
  : '—')

/** Apply dictionary text to every tagged node and align the document direction. */
function applyI18n() {
  document.documentElement.lang = LANG
  document.documentElement.dir = D.dir
  localStorage.setItem('console-lang', LANG)
  document.querySelectorAll('[data-i18n]').forEach((node) => {
    node.textContent = t(node.dataset.i18n)
  })
  document.querySelectorAll('[data-i18n-placeholder]').forEach((node) => {
    node.setAttribute('placeholder', t(node.dataset.i18nPlaceholder))
  })
  // Cross-links between login/register keep the flow parameters (next, dsh, aff).
  document.querySelectorAll('[data-carry]').forEach((node) => {
    const base = node.dataset.carry || node.getAttribute('href').split('?')[0]
    node.setAttribute('href', `${base}${location.search}`)
  })
  document.querySelectorAll('[data-i18n-aria]').forEach((node) => {
    const label = t(node.dataset.i18nAria)
    node.setAttribute('aria-label', label)
    node.setAttribute('title', label)
  })
  document.querySelectorAll('[data-lang-link]').forEach((node) => {
    // Keep every other query parameter: dropping tx (desktop sign-in), dsh (register →
    // authorize) or aff (invite) turns a language switch into a broken flow.
    const params = new URLSearchParams(location.search)
    params.set('lang', node.dataset.langLink)
    node.setAttribute('href', `${location.pathname}?${params.toString()}${location.hash}`)
    node.setAttribute('aria-current', String(node.dataset.langLink === LANG))
  })
  if (document.body.dataset.pageTitle) {
    document.title = `${t(document.body.dataset.pageTitle)} · ${D.brand}`
  }
}

class Unauthorized extends Error {}

/** New API requires the signed-in user id on every authenticated call; the SPA
    keeps it in localStorage under `user`, which is same-origin for us too. */
function sessionUserId() {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null')
    const id = Number(user?.id)
    return Number.isFinite(id) && id > 0 ? id : 0
  } catch {
    return 0
  }
}

/** Call one gateway endpoint and unwrap its envelope. */
async function api(path, options = {}) {
  const userId = sessionUserId()
  if (userId === 0) throw new Unauthorized(path)
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: {
      'New-Api-User': String(userId),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...options,
  })
  if (response.status === 401) throw new Unauthorized(path)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || t('errors.generic'))
  }
  return payload.data
}

/** Show the sign-in prompt when the session is missing or expired. */
function needLogin() {
  $('auth').hidden = false
  $('app').hidden = true
}

/** Wire an action that surfaces failures in the page hint. */
async function guard(action) {
  try {
    await action()
  } catch (error) {
    if (error instanceof Unauthorized) return needLogin()
    const hint = document.querySelector('.hint')
    if (hint) hint.textContent = String(error.message || error)
    else console.error(error)
  }
}

async function loadStatus() {
  try {
    const status = await (await fetch('/api/status')).json()
    const data = status?.data || {}
    const unit = Number(data.quota_per_unit)
    if (Number.isFinite(unit) && unit > 0) state.quotaPerUnit = unit
    // The gateway decides whether registration needs an emailed code; the form follows it.
    state.emailVerification = data.email_verification === true
    state.turnstile = data.turnstile_check === true
  } catch {
    /* keep the default unit */
  }
}

async function startUsage() {
  applyI18n()
  await loadStatus()
  await guard(async () => {
    const me = await api('/api/user/self')
    $('auth').hidden = true
    $('app').hidden = false
    if ($('sign-out')) $('sign-out').hidden = false
    const displayName = me.display_name && me.display_name !== me.username ? me.display_name : ''
    $('who').textContent = t('usage.greeting', { name: displayName || me.email || me.username || '—' })
    $('balance').textContent = credit(me.quota)
    $('used').textContent = credit(me.used_quota)
    $('requests').textContent = num(me.request_count)
    renderInvite(me)
    await loadAnnouncements()
    await loadLogs()
  })
}

/** Per-call billing breakdown: the gateway stores ratios and cache figures in `other`. */
function detailHtml(item) {
  let other = {}
  try {
    other = typeof item.other === 'string' ? JSON.parse(item.other) : (item.other || {})
  } catch {
    other = {}
  }
  const rows = [
    ['detail.model', item.model_name || '—'],
    ['detail.group', item.group || '—'],
    ['detail.path', val(other.request_path)],
    ['detail.billing', val(other.billing_source)],
    ['detail.modelRatio', val(other.model_ratio)],
    ['detail.groupRatio', val(other.user_group_ratio ?? other.group_ratio)],
    ['detail.completionRatio', val(other.completion_ratio)],
    ['detail.cacheRatio', val(other.cache_ratio)],
    ['detail.cacheCreationRatio', val(other.cache_creation_ratio)],
    ['detail.cacheTokens', other.cache_tokens == null ? '—' : num(other.cache_tokens)],
    ['detail.cacheCreationTokens', other.cache_creation_tokens == null ? '—' : num(other.cache_creation_tokens)],
    ['detail.modelPrice', Number(other.model_price) > 0 ? credit(Number(other.model_price) * state.quotaPerUnit) : '—'],
    ['detail.promptTokens', num(item.prompt_tokens)],
    ['detail.completionTokens', num(item.completion_tokens)],
    ['detail.firstByte', other.frt == null || Number(other.frt) < 0 ? '—' : t('detail.millis', { value: num(other.frt) })],
    ['detail.duration', t('detail.seconds', { value: Number(item.use_time || 0).toFixed(2) })],
    ['detail.stream', item.is_stream ? t('detail.yes') : t('detail.no')],
    ['detail.conversion', val(other.request_conversion)],
    ['detail.key', item.token_name || '—'],
    ['detail.channel', item.channel_name || item.channel || '—'],
    ['detail.cost', cost(item.quota)],
    ['detail.raw', num(item.quota)],
    ['detail.requestId', item.request_id || '—'],
  ]
  return `<div class="detail-grid">${rows.map(([label, value]) =>
    `<div><span>${t(label)}</span><strong dir="auto">${value}</strong></div>`).join('')}</div>`
}


/** Invitation card: the user's own aff code, share link, and invite counters. */
function renderInvite(me) {
  const section = $('invite')
  if (!section || !me.aff_code) return
  const link = `${location.origin}/me/register?aff=${encodeURIComponent(me.aff_code)}`
  $('aff-code').textContent = me.aff_code
  $('aff-count').textContent = num(me.aff_count || 0)
  $('aff-quota').textContent = credit(me.aff_quota || 0)
  $('aff-link').textContent = link
  section.hidden = false
  $('aff-copy').onclick = () => flashCopied($('aff-copy'), me.aff_code)
  $('aff-link-copy').onclick = () => flashCopied($('aff-link-copy'), link)

  // Invite credit becomes spendable balance only through /api/user/aff_transfer,
  // and the gateway refuses transfers below one quota_per_unit.
  const transfer = $('aff-transfer')
  const transferable = Number(me.aff_quota || 0) >= state.quotaPerUnit
  transfer.hidden = !transferable
  transfer.onclick = () => guard(async () => {
    await api('/api/user/aff_transfer', { method: 'POST', body: JSON.stringify({ quota: Number(me.aff_quota) }) })
    const fresh = await api('/api/user/self')
    $('balance').textContent = credit(fresh.quota)
    renderInvite(fresh)
  })
}

/** Copy text and briefly confirm on the button itself. */
async function flashCopied(button, value) {
  await copyText(value)
  const original = t('invite.copy')
  button.textContent = t('invite.copied')
  setTimeout(() => { button.textContent = original }, 1500)
}

async function loadLogs() {
  const data = await api(`/api/log/self?p=${state.page}&page_size=${state.pageSize}&type=0`)
  const rows = (data.items || []).filter((item) => Number(item.quota) !== 0 || item.model_name)
  const body = $('rows')
  if (rows.length === 0) {
    body.innerHTML = `<tr><td colspan="6" class="empty">${t('common.empty')}</td></tr>`
  } else {
    body.innerHTML = rows.map((item, index) => `<tr>
      <td>${stamp(item.created_at)}</td>
      <td dir="ltr">${item.model_name || '—'}</td>
      <td>${num(item.prompt_tokens)}</td>
      <td>${num(item.completion_tokens)}</td>
      <td>${cost(item.quota)}</td>
      <td class="actions"><button type="button" data-detail="${index}">${t('common.details')}</button></td>
    </tr>
    <tr class="detail" data-panel="${index}" hidden><td colspan="6">${detailHtml(item)}</td></tr>`).join('')
  }
  const total = Number(data.total || 0)
  const pages = Math.max(1, Math.ceil(total / state.pageSize))
  $('pageinfo').textContent = t('common.page', { page: num(state.page), pages: num(pages) })
  $('prev').textContent = t('common.prev')
  $('next').textContent = t('common.next')
  $('prev').disabled = state.page <= 1
  $('next').disabled = state.page >= pages
}

async function startKeys() {
  applyI18n()
  await loadStatus()
  await guard(async () => {
    await api('/api/user/self')
    $('auth').hidden = true
    $('app').hidden = false
    if ($('sign-out')) $('sign-out').hidden = false
    await loadKeys()
  })
}


/** Open the edit dialog for one key, prefilled from the loaded list. */
function openKeyEditor(id) {
  const token = state.tokens.find((item) => String(item.id) === String(id))
  if (!token) return
  const dialog = $('edit-dialog')
  const form = $('edit-form')
  form.dataset.id = String(token.id)
  form.name.value = token.name ?? ''
  form.unlimited.checked = Boolean(token.unlimited_quota)
  form.quota.value = token.unlimited_quota ? '' : (Number(token.remain_quota || 0) / state.quotaPerUnit).toFixed(2)
  form.expiry.value = token.expired_time > 0 ? new Date(token.expired_time * 1000).toISOString().slice(0, 10) : ''
  form.allowIps.value = token.allow_ips ?? ''
  $('edit-error').hidden = true
  dialog.showModal()
}

/** Persist the edited key through PUT /api/token/. */
async function saveKeyEdit(event) {
  event.preventDefault()
  const form = $('edit-form')
  const id = Number(form.dataset.id)
  const token = state.tokens.find((item) => item.id === id)
  if (!token) return
  const unlimited = form.unlimited.checked
  const quota = unlimited ? 0 : Math.round(Number(form.quota.value || 0) * state.quotaPerUnit)
  if (!unlimited && (!Number.isFinite(quota) || quota < 0)) {
    return showEditError(t('errors.generic'))
  }
  const expiry = form.expiry.value ? Math.floor(new Date(form.expiry.value + 'T00:00:00').getTime() / 1000) : -1
  try {
    await api('/api/token/', {
      method: 'PUT',
      body: JSON.stringify({
        id,
        name: form.name.value.trim() || token.name,
        remain_quota: quota,
        unlimited_quota: unlimited,
        expired_time: expiry,
        allow_ips: form.allowIps.value.trim(),
        model_limits_enabled: false,
        model_limits: '',
        status: token.status,
      }),
    })
    $('edit-dialog').close()
    await loadKeys()
  } catch (error) {
    showEditError(error instanceof Unauthorized ? t('auth.needLoginKeys') : errorText(error.message))
  }
}

/** Inline error inside the edit dialog. */
function showEditError(message) {
  const box = $('edit-error')
  box.textContent = message
  box.hidden = false
}

document.addEventListener('click', (event) => {
  const edit = event.target.closest('[data-edit]')
  if (edit) return openKeyEditor(edit.dataset.edit)
  if (event.target.closest('#edit-cancel')) $('edit-dialog').close()
})

async function loadKeys() {
  const data = await api('/api/token/?p=1&size=100')
  const tokens = data.items || []
  state.tokens = tokens
  const body = $('rows')
  if (tokens.length === 0) {
    body.innerHTML = `<tr><td colspan="5" class="empty">${t('common.empty')}</td></tr>`
    return
  }
  body.innerHTML = tokens.map((token) => {
    const masked = `sk-${String(token.key).slice(0, 6)}…${String(token.key).slice(-4)}`
    const status = token.status === 1 ? t('keys.active') : t('keys.inactive')
    return `<tr>
      <td>${token.name || '—'}</td>
      <td dir="ltr"><code>${masked}</code></td>
      <td>${credit(token.used_quota)}</td>
      <td>${status}</td>
      <td class="actions">
        <button type="button" data-edit="${token.id}">${t('keys.edit')}</button>
        <button type="button" data-copy="${token.key}">${t('common.copy')}</button>
        <button type="button" class="danger" data-delete="${token.id}">${t('common.remove')}</button>
      </td>
    </tr>`
  }).join('')
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value)
  } catch {
    const area = document.createElement('textarea')
    area.value = value
    document.body.append(area)
    area.select()
    document.execCommand('copy')
    area.remove()
  }
}


/** Toggle a password field between masked and plain text. */
/** Clear the gateway session and the local user cache, then return to sign-in. */
async function signOut() {
  try {
    await fetch('/api/user/logout', { credentials: 'same-origin' })
  } catch {
    // Local sign-out still proceeds when the request fails.
  }
  localStorage.removeItem('user')
  localStorage.removeItem('console-lang')
  location.replace('/me/login')
}

document.addEventListener('click', (event) => {
  if (event.target.closest('#sign-out')) {
    void signOut()
    return
  }
  const button = event.target.closest('[data-eye]')
  if (!button) return
  const input = button.parentElement?.querySelector('input')
  if (!input) return
  const revealed = input.type === 'password'
  input.type = revealed ? 'text' : 'password'
  button.setAttribute('aria-pressed', String(revealed))
  const label = t(revealed ? 'auth.hidePassword' : 'auth.showPassword')
  button.setAttribute('aria-label', label)
  button.setAttribute('title', label)
})

document.addEventListener('click', (event) => {
  const copy = event.target.closest('[data-copy]')
  if (copy) {
    copyText(copy.dataset.copy).then(() => {
      const original = t('common.copy')
      copy.textContent = t('common.copied')
      setTimeout(() => { copy.textContent = original }, 1500)
    })
    return
  }
  const remove = event.target.closest('[data-delete]')
  if (remove) {
    guard(async () => {
      await api(`/api/token/${remove.dataset.delete}`, { method: 'DELETE' })
      await loadKeys()
    })
    return
  }
  const trigger = event.target.closest('[data-detail]')
  if (trigger) {
    const panel = document.querySelector(`[data-panel="${trigger.dataset.detail}"]`)
    if (!panel) return
    panel.hidden = !panel.hidden
    trigger.textContent = panel.hidden ? t('common.details') : t('common.close')
  }
})

/** Map the gateway's English/Chinese auth errors onto the active language. */
const AUTH_ERROR_PATTERNS = [
  [/User\.Username.*max|username.*max/i, 'errors.usernameTooLong'],
  [/User\.Password.*max|password.*max/i, 'errors.passwordRange'],
  [/User\.Password.*min|at least 8/i, 'errors.passwordRange'],
  [/username or password is empty|用户名或密码为空/i, 'errors.emptyCredentials'],
  [/username or password is incorrect|用户名或密码错误/i, 'errors.wrongCredentials'],
  [/password login has been disabled|关闭了密码登录/i, 'errors.loginDisabled'],
  [/registration has been disabled|关闭了新用户注册/i, 'errors.registerDisabled'],
  [/username already exists|用户名已存在/i, 'errors.exists'],
  [/verification code.*(error|invalid|expired)|验证码.*(错误|失效|过期)/i, 'errors.badCode'],
  [/email.*(already|taken|used|occupied)|邮箱.*(已被|已存在|占用)/i, 'errors.emailTaken'],
  [/(send|sending).*(mail|email).*fail|邮件发送失败/i, 'errors.sendFailed'],
  [/邮箱地址未注册|email.*not registered/i, 'account.emailNotFound'],
  [/重置链接非法或已过期|reset link.*(invalid|expired)/i, 'account.resetInvalid'],
]

function errorText(message) {
  const text = String(message || '').trim()
  if (!text) return t('errors.generic')
  for (const [pattern, key] of AUTH_ERROR_PATTERNS) if (pattern.test(text)) return t(key)
  return t('errors.raw', { message: text })
}

/** Show an inline error under the form. */
function showFormError(message) {
  const box = $('error')
  if (!box) return
  box.textContent = message
  box.hidden = false
}

/** Where to go after authenticating: finish a desktop sign-in first, then ?next=, then the fallback. */
function finishAuth(fallback) {
  const params = new URLSearchParams(location.search)
  const pending = params.get('dsh')
  if (pending) return `/me/dsh?tx=${encodeURIComponent(pending)}`
  const next = params.get('next')
  if (next && next.startsWith('/') && !next.startsWith('//')) return next
  return fallback
}

/** Remember the signed-in user so the console can set the New-Api-User header. */
function rememberUser(data) {
  localStorage.setItem('user', JSON.stringify(data))
}


/** Desktop app sign-in: complete the DSH transaction from this console session. */
async function startDsh() {
  applyI18n()
  const tx = new URLSearchParams(location.search).get('tx')
  const stateLabel = $('dsh-state')
  if (!tx) {
    stateLabel.textContent = t('errors.dshTx')
    return
  }
  const registerLink = $('register-link')
  if (registerLink) registerLink.href = `/me/register?dsh=${encodeURIComponent(tx)}`

  const complete = async () => {
    const response = await fetch('/api/dsh/complete', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'New-Api-User': String(sessionUserId()) },
      body: JSON.stringify({ tx }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const message = payload?.error?.message || t('errors.generic')
      stateLabel.textContent = /两步验证|2FA|two-factor/i.test(message) ? t('errors.dsh2fa') : message
      return
    }
    // The gateway answers with {code, data:{biz_data:{redirect}}}; the redirect is dsh://.
    const redirect = payload?.data?.biz_data?.redirect
    if (!redirect) {
      stateLabel.textContent = t('errors.generic')
      return
    }
    stateLabel.textContent = t('dsh.done')
    const open = $('open-app')
    open.href = redirect
    $('done').hidden = false
    location.href = redirect
  }

  if (sessionUserId() > 0) {
    await complete()
    return
  }

  stateLabel.textContent = t('dsh.loginFirst')
  const form = $('auth-form')
  form.hidden = false
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const username = form.username.value.trim()
    const password = form.password.value
    if (!username) return showFormError(t('errors.requiredUsername'))
    if (!password) return showFormError(t('errors.requiredPassword'))
    try {
      const response = await fetch('/api/user/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (response.status === 429) return showFormError(t('errors.rateLimited'))
      const payload = await response.json().catch(() => ({}))
      if (!payload.success) return showFormError(errorText(payload.message))
      if (payload.data?.require_2fa) return startTwoFactorLogin(async () => { await complete() })
      rememberUser(payload.data || {})
      await complete()
    } catch {
      showFormError(t('errors.network'))
    }
  })
}


/** Top-up page: current balance, redeem-code form, and past top-ups. */
async function startTopup() {
  applyI18n()
  const form = $('redeem')
  // Bind before any await: a fast submit must never fall through to a native GET.
  const statusReady = loadStatus()
  form?.addEventListener('submit', async (event) => {
    event.preventDefault()
    await statusReady
    const code = form.code.value.trim()
    if (!code) return
    try {
      const result = await api('/api/user/topup', { method: 'POST', body: JSON.stringify({ key: code }) })
      form.code.value = ''
      const added = Number(result) > 0 ? credit(result) : ''
      showTopupMessage(`${t('topup.redeemed')}${added ? ' (+' + added + ')' : ''}`, true)
      await loadTopup()
    } catch (error) {
      showTopupMessage(error instanceof Unauthorized ? t('auth.needLoginUsage') : errorText(error.message), false)
    }
  })
  await guard(async () => {
    const me = await api('/api/user/self')
    $('auth').hidden = true
    $('app').hidden = false
    if ($('sign-out')) $('sign-out').hidden = false
    $('balance').textContent = credit(me.quota)
    await loadTopup()
  })
}

/** Render one line of feedback under the redeem form. */
function showTopupMessage(text, ok) {
  const box = $('message')
  box.textContent = text
  box.hidden = false
  box.classList.toggle('ok', ok)
  box.classList.toggle('bad', !ok)
}

/** Load the paginated top-up history. */
async function loadTopup() {
  const data = await api('/api/user/topup/self?p=1&page_size=20')
  const rows = data.items ?? []
  const body = $('rows')
  if (rows.length === 0) {
    body.innerHTML = `<tr><td colspan="4" class="empty">${t('common.empty')}</td></tr>`
    return
  }
  body.innerHTML = rows.map((item) => {
    const status = item.status === 'success' ? t('topup.statusSuccess')
      : item.status === 'failed' ? t('topup.statusFailed') : t('topup.statusPending')
    return `<tr>
      <td>${stamp(item.create_time)}</td>
      <td>${item.money > 0 ? '$' + Number(item.money).toFixed(2) : credit(item.amount)}</td>
      <td>${item.payment_method === 'redeem' ? t('topup.methodRedeem') : (item.payment_method || '—')}</td>
      <td>${status}</td>
    </tr>`
  }).join('')
}


/** Account page: rotate the password of the signed-in account. */

/** Render the one-time backup codes list. */
function renderBackupCodes(codes) {
  const list = $('twofa-backup')
  list.innerHTML = codes.map((code) => `<li><code dir="ltr">${code}</code></li>`).join('')
}

/** Show a 2FA management error. */
function showTwofaError(message) {
  const box = $('twofa-error')
  box.textContent = message
  box.hidden = false
}

/** Load whether 2FA is enabled for this account. */
async function loadTwofa() {
  const status = await api('/api/user/2fa/status').catch(() => null)
  const enabled = Boolean(status?.enabled)
  $('twofa-off').hidden = enabled
  $('twofa-on').hidden = !enabled
  $('twofa-setup').hidden = true
}

/** Wire the 2FA section on the account page. */
function wireTwofa() {
  $('twofa-start')?.addEventListener('click', async () => {
    $('twofa-error').hidden = true
    try {
      const data = await api('/api/user/2fa/setup', { method: 'POST' })
      $('twofa-secret').textContent = data.secret
      renderBackupCodes(data.backup_codes ?? [])
      $('twofa-saved').checked = false
      $('twofa-code').value = ''
      $('twofa-off').hidden = true
      $('twofa-setup').hidden = false
    } catch (error) {
      showTwofaError(error instanceof Unauthorized ? t('auth.needLoginUsage') : errorText(error.message))
    }
  })

  $('twofa-copy-secret')?.addEventListener('click', () => {
    navigator.clipboard?.writeText($('twofa-secret').textContent ?? '').then(() => flashCopied($('twofa-copy-secret'))).catch(() => {})
  })

  $('twofa-copy-backup')?.addEventListener('click', () => {
    const codes = Array.from($('twofa-backup').querySelectorAll('code')).map((node) => node.textContent).join('\n')
    navigator.clipboard?.writeText(codes).then(() => flashCopied($('twofa-copy-backup'))).catch(() => {})
  })

  $('twofa-confirm')?.addEventListener('click', async () => {
    $('twofa-error').hidden = true
    if (!$('twofa-saved').checked) return showTwofaError(t('twofa.errSaved'))
    const code = $('twofa-code').value.trim()
    if (!/^\d{6}$/.test(code)) return showTwofaError(t('twofa.errCode'))
    try {
      await api('/api/user/2fa/enable', { method: 'POST', body: JSON.stringify({ code }) })
      await loadTwofa()
      $('twofa-on').querySelector('.hint').textContent = t('twofa.on')
    } catch (error) {
      showTwofaError(errorText(error.message))
    }
  })

  $('twofa-disable')?.addEventListener('click', async () => {
    $('twofa-error').hidden = true
    const code = $('twofa-manage-code').value.trim()
    if (!code) return showTwofaError(t('twofa.errManage'))
    try {
      await api('/api/user/2fa/disable', { method: 'POST', body: JSON.stringify({ code }) })
      $('twofa-manage-code').value = ''
      await loadTwofa()
    } catch (error) {
      showTwofaError(errorText(error.message))
    }
  })

  $('twofa-regen')?.addEventListener('click', async () => {
    $('twofa-error').hidden = true
    const code = $('twofa-manage-code').value.trim()
    if (!code) return showTwofaError(t('twofa.errManage'))
    try {
      const data = await api('/api/user/2fa/backup_codes', { method: 'POST', body: JSON.stringify({ code }) })
      $('twofa-manage-code').value = ''
      renderBackupCodes(data.backup_codes ?? data ?? [])
      $('twofa-setup').hidden = false
      $('twofa-saved').checked = false
      $('twofa-code').hidden = true
      $('twofa-confirm').hidden = true
      $('twofa-copy-backup').hidden = false
      $('twofa-backup').scrollIntoView({ block: 'center' })
    } catch (error) {
      showTwofaError(errorText(error.message))
    }
  })
}

/** After a password login the gateway may ask for a second factor. */
function startTwoFactorLogin(onSuccess) {
  const form = $('twofa-form')
  if (!form) return
  $('auth-form').hidden = true
  form.hidden = false
  form.querySelector('input').focus()
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const box = $('twofa-login-error')
    box.hidden = true
    const code = $('twofa-login-code').value.trim()
    if (!code) return
    try {
      const response = await fetch('/api/user/login/2fa', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      if (response.status === 429) {
        box.textContent = t('errors.rateLimited')
        box.hidden = false
        return
      }
      const payload = await response.json().catch(() => ({}))
      if (!payload.success) {
        box.textContent = errorText(payload.message)
        box.hidden = false
        return
      }
      rememberUser(payload.data || {})
      await onSuccess()
    } catch {
      box.textContent = t('errors.network')
      box.hidden = false
    }
  })
}

async function startAccount() {
  applyI18n()
  const form = $('password-form')
  const statusReady = loadStatus()
  form?.addEventListener('submit', async (event) => {
    event.preventDefault()
    await statusReady
    const current = form.current.value
    const password = form.password.value
    const runes = (value) => Array.from(value).length
    if (!current) return showFormError(t('errors.requiredPassword'))
    if (runes(password) < 8 || runes(password) > 20) return showFormError(t('errors.passwordRange'))
    if (password !== form.confirm.value) return showFormError(t('errors.mismatch'))
    if (password === current) return showFormError(t('account.same'))
    try {
      const response = await fetch('/api/user/password', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'New-Api-User': String(sessionUserId()) },
        body: JSON.stringify({ original_password: current, password }),
      })
      if (response.status === 429) return showFormError(t('errors.rateLimited'))
      const payload = await response.json().catch(() => ({}))
      if (!payload.success) {
        const message = String(payload.message ?? '')
        return showFormError(/原密码|current password|текущий пароль/i.test(message) ? t('account.wrongCurrent') : errorText(message))
      }
      form.reset()
      $('saved').hidden = false
      $('error').hidden = true
    } catch {
      showFormError(t('errors.network'))
    }
  })
  wireTwofa()
  await guard(async () => {
    await api('/api/user/self')
    $('auth').hidden = true
    $('app').hidden = false
    if ($('sign-out')) $('sign-out').hidden = false
    await loadTwofa()
  })
}

/** Forgot-password page: ask the gateway to email a reset link. */
function startForgot() {
  applyI18n()
  const form = $('forgot-form')
  form?.addEventListener('submit', async (event) => {
    event.preventDefault()
    const email = form.email.value.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showFormError(t('errors.emailInvalid'))
    try {
      const response = await fetch(`/api/reset_password?email=${encodeURIComponent(email)}`)
      const payload = await response.json().catch(() => ({}))
      if (response.status === 429) return showFormError(t('errors.rateLimited'))
      if (!payload.success) {
        // The gateway cannot send mail until SMTP is configured.
        return showFormError(/smtp|mail|邮件|发送/i.test(String(payload.message)) ? t('account.resetUnavailable') : errorText(payload.message))
      }
      $('error').hidden = true
      $('sent').hidden = false
      form.reset()
    } catch {
      showFormError(t('errors.network'))
    }
  })
}

/** Reset page: exchange the emailed token for a generated password. */
async function startReset() {
  applyI18n()
  const params = new URLSearchParams(location.search)
  const email = params.get('email') ?? ''
  const token = params.get('token') ?? ''
  const stateLabel = $('state')
  if (!email || !token) {
    stateLabel.textContent = t('account.resetInvalid')
    return
  }
  try {
    const response = await fetch('/api/user/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, token }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!payload.success) {
      stateLabel.textContent = t('account.resetInvalid')
      return
    }
    stateLabel.hidden = true
    $('password').textContent = String(payload.data ?? '')
    $('result').hidden = false
    $('copy').onclick = () => flashCopied($('copy'), String(payload.data ?? ''))
  } catch {
    stateLabel.textContent = t('errors.network')
  }
}


/** Pricing page: ratio-based models rendered as USD per million tokens. */
async function startPricing() {
  applyI18n()
  const body = $('rows')
  try {
    const response = await fetch('/api/pricing')
    const payload = await response.json().catch(() => ({}))
    const models = Array.isArray(payload?.data) ? payload.data : []
    if (models.length === 0) {
      body.innerHTML = `<tr><td colspan="3" class="empty">${t('pricing.empty')}</td></tr>`
      return
    }
    // One ratio unit is $2 per million tokens on this deployment.
    const unitPrice = 2
    body.innerHTML = models.map((model) => {
      const ratio = Number(model.model_ratio ?? 0)
      const completion = Number(model.completion_ratio ?? 1)
      const fixed = Number(model.model_price ?? 0)
      if (fixed > 0) {
        return `<tr><td dir="ltr">${model.model_name}</td><td colspan="2">$${fixed.toFixed(2)} ${t('pricing.perCall')}</td></tr>`
      }
      return `<tr>
        <td dir="ltr">${model.model_name}</td>
        <td>$${(ratio * unitPrice).toFixed(2)}</td>
        <td>$${(ratio * completion * unitPrice).toFixed(2)}</td>
      </tr>`
    }).join('')
  } catch {
    body.innerHTML = `<tr><td colspan="3" class="empty">${t('errors.network')}</td></tr>`
  }
}

/** Announcements banner: newest three, dismissible per browser. */
async function loadAnnouncements() {
  const host = $('announcements')
  if (!host) return
  try {
    const status = await (await fetch('/api/status')).json()
    const data = status?.data ?? {}
    if (!data.announcements_enabled) return
    const items = Array.isArray(data.announcements) ? data.announcements.slice(0, 3) : []
    const dismissed = localStorage.getItem('ann-dismissed') ?? ''
    const visible = items.filter((item) => `${item.publishDate ?? ''}|${String(item.content ?? '').slice(0, 30)}` !== dismissed)
    if (visible.length === 0) return
    const item = visible[0]
    host.innerHTML = `<div class="card announce"><strong>${t('announce.title')}</strong>
      <div class="announce-body">${String(item.content ?? '')}</div>
      <div class="announce-foot"><span>${item.publishDate ?? ''}</span>
      <button type="button" class="linkish" id="ann-dismiss">${t('announce.dismiss')}</button></div></div>`
    host.hidden = false
    $('ann-dismiss').onclick = () => {
      localStorage.setItem('ann-dismissed', `${item.publishDate ?? ''}|${String(item.content ?? '').slice(0, 30)}`)
      host.hidden = true
    }
  } catch {
    // Announcements are optional; a failure must not break the page.
  }
}

async function startLogin() {
  applyI18n()
  const form = $('auth-form')
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const username = form.username.value.trim()
    const password = form.password.value
    if (!username) return showFormError(t('errors.requiredUsername'))
    if (!password) return showFormError(t('errors.requiredPassword'))
    try {
      const response = await fetch('/api/user/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (response.status === 429) return showFormError(t('errors.rateLimited'))
      const payload = await response.json().catch(() => ({}))
      if (!payload.success) return showFormError(errorText(payload.message))
      if (payload.data?.require_2fa) return startTwoFactorLogin(async () => { location.replace(finishAuth('/me/')) })
      rememberUser(payload.data || {})
      location.replace(finishAuth('/me/'))
    } catch {
      showFormError(t('errors.network'))
    }
  })
}


/** Registration email code: request one and run a 60s client-side cooldown. */
function wireSendCode() {
  const button = $('send-code')
  const emailInput = document.querySelector('input[name="email"]')
  if (!button || !emailInput) return
  let readyAt = 0
  button.addEventListener('click', async () => {
    if (Date.now() < readyAt) return
    const email = emailInput.value.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showFormError(t('errors.emailInvalid'))
    if (state.turnstile) return showFormError(t('errors.turnstile'))
    try {
      const response = await fetch(`/api/verification?email=${encodeURIComponent(email)}`)
      const payload = await response.json().catch(() => ({}))
      if (!payload.success) return showFormError(errorText(payload.message))
      readyAt = Date.now() + 60000
      button.disabled = true
      button.textContent = t('auth.codeSent')
      const tick = () => {
        const left = Math.ceil((readyAt - Date.now()) / 1000)
        if (left <= 0) {
          button.disabled = false
          button.textContent = t('auth.sendCode')
          return
        }
        button.textContent = t('auth.codeCooldown', { s: left })
        setTimeout(tick, 1000)
      }
      setTimeout(tick, 900)
    } catch {
      showFormError(t('errors.network'))
    }
  })
}


/** Registrations sign in by email; the stored username must fit `max=20`. */
function deriveUsername(email) {
  const local = String(email).split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'user'
  const suffix = Math.random().toString(36).slice(2, 6)
  return `${local}_${suffix}`.slice(0, 20)
}

async function startRegister() {
  applyI18n()
  const form = $('auth-form')
  // Bind the submit handler synchronously: awaiting the status request first would
  // let a fast click fall through to the native GET submit and put the password in
  // the URL. The handler itself waits for the status before validating.
  const statusReady = loadStatus()
  statusReady.then(() => {
    const emailOn = state.emailVerification === true
    $('email-field').hidden = !emailOn
    $('code-field').hidden = !emailOn
    // Username stays only as a fallback when email verification is off.
    $('username-field').hidden = emailOn
    if (emailOn) wireSendCode()
  })
  // Deep link from a share card: /me/register?aff=CODE
  const invitedBy = new URLSearchParams(location.search).get('aff')
    || new URLSearchParams(location.search).get('code')
  if (invitedBy && form.aff) form.aff.value = invitedBy.trim().slice(0, 16)
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    await statusReady
    const emailOn = state.emailVerification === true
    const password = form.password.value
    // Mirror model.User: `username max=20` (no minimum, no format rule), `password min=8,max=20`.
    const runes = (value) => Array.from(value).length
    if (runes(password) < 8 || runes(password) > 20) return showFormError(t('errors.passwordRange'))
    if (password !== form.confirm.value) return showFormError(t('errors.mismatch'))
    const email = emailOn ? form.email.value.trim() : ''
    const code = emailOn ? form.code.value.trim() : ''
    let username = ''
    if (emailOn) {
      if (!email) return showFormError(t('errors.emailRequired'))
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showFormError(t('errors.emailInvalid'))
      // Codes are the first six hex characters of a UUID, so letters a-f are valid.
      if (!/^[0-9a-fA-F]{6}$/.test(code)) return showFormError(t('errors.codeRequired'))
      // The gateway still stores a username; derive a stable one from the address.
      username = deriveUsername(email)
    } else {
      username = form.username.value.trim()
      if (!username) return showFormError(t('errors.requiredUsername'))
      if (runes(username) > 20) return showFormError(t('errors.usernameTooLong'))
    }
    try {
      const response = await fetch('/api/user/register', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          ...(emailOn ? { email, verification_code: code.toLowerCase() } : {}),
          ...(form.aff && form.aff.value.trim() ? { aff_code: form.aff.value.trim() } : {}),
        }),
      })
      if (response.status === 429) return showFormError(t('errors.rateLimited'))
      const payload = await response.json().catch(() => ({}))
      if (!payload.success) return showFormError(errorText(payload.message))

      const login = await fetch('/api/user/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const session = await login.json().catch(() => ({}))
      if (!session.success) return showFormError(t('errors.registerThenLogin'))
      rememberUser(session.data || {})
      location.replace(finishAuth('/me/keys'))
    } catch {
      showFormError(t('errors.network'))
    }
  })
}

/** Keys page: create a fresh token with the same defaults the SPA uses. */
const createForm = $('create')
if (createForm) {
  createForm.addEventListener('submit', (event) => {
    event.preventDefault()
    const input = $('name')
    guard(async () => {
      await api('/api/token/', {
        method: 'POST',
        body: JSON.stringify({
          name: input.value.trim() || new Date().toISOString().slice(0, 16),
          remain_quota: 0,
          expired_time: -1,
          unlimited_quota: true,
          model_limits_enabled: false,
          model_limits: '',
          allow_ips: '',
          group: '',
        }),
      })
      input.value = ''
      await loadKeys()
    })
  })
}

if ($('edit-form')) $('edit-form').addEventListener('submit', saveKeyEdit)

for (const [id, step] of [['prev', -1], ['next', 1]]) {
  const button = $(id)
  if (!button) continue
  button.addEventListener('click', () => {
    state.page = Math.max(1, state.page + step)
    guard(loadLogs)
  })
}
