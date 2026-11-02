/* Persian/English console for the DeepSeek-FA gateway.
   Same origin as the API, so the New API session cookie authenticates every call. */
/* global DICT */

const requestLang = new URLSearchParams(location.search).get('lang')
const storedLang = localStorage.getItem('console-lang')
const LANG = ['fa', 'en'].includes(requestLang)
  ? requestLang
  : (['fa', 'en'].includes(storedLang) ? storedLang : 'fa')
const D = DICT[LANG]
const numberLocale = LANG === 'fa' ? 'fa-IR' : 'en-US'

const state = { quotaPerUnit: 500000, page: 1, pageSize: 20 }

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
  document.querySelectorAll('[data-lang-link]').forEach((node) => {
    node.setAttribute('href', `?lang=${node.dataset.langLink}`)
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
    const unit = Number(status?.data?.quota_per_unit)
    if (Number.isFinite(unit) && unit > 0) state.quotaPerUnit = unit
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
    const displayName = me.display_name && me.display_name !== me.username ? me.display_name : ''
    $('who').textContent = t('usage.greeting', { name: displayName || me.email || me.username || '—' })
    $('balance').textContent = credit(me.quota)
    $('used').textContent = credit(me.used_quota)
    $('requests').textContent = num(me.request_count)
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
    await loadKeys()
  })
}

async function loadKeys() {
  const data = await api('/api/token/?p=1&size=100')
  const tokens = data.items || []
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

/** Where to go after signing in: honour ?next= on the same origin only. */
function nextUrl() {
  const next = new URLSearchParams(location.search).get('next')
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/me/'
}

/** Remember the signed-in user so the console can set the New-Api-User header. */
function rememberUser(data) {
  localStorage.setItem('user', JSON.stringify(data))
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
      const payload = await response.json().catch(() => ({}))
      if (!payload.success) return showFormError(errorText(payload.message))
      if (payload.data?.require_2fa) return showFormError(t('errors.twoFactor'))
      rememberUser(payload.data || {})
      location.replace(nextUrl())
    } catch {
      showFormError(t('errors.network'))
    }
  })
}

async function startRegister() {
  applyI18n()
  const form = $('auth-form')
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const username = form.username.value.trim()
    const password = form.password.value
    // Mirror model.User: `username max=20` (no minimum, no format rule), `password min=8,max=20`.
    const runes = (value) => Array.from(value).length
    if (!username) return showFormError(t('errors.requiredUsername'))
    if (runes(username) > 20) return showFormError(t('errors.usernameTooLong'))
    if (runes(password) < 8 || runes(password) > 20) return showFormError(t('errors.passwordRange'))
    if (password !== form.confirm.value) return showFormError(t('errors.mismatch'))
    try {
      const response = await fetch('/api/user/register', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
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
      location.replace('/me/keys')
    } catch {
      showFormError(t('errors.network'))
    }
  })
}

for (const [id, step] of [['prev', -1], ['next', 1]]) {
  const button = $(id)
  if (!button) continue
  button.addEventListener('click', () => {
    state.page = Math.max(1, state.page + step)
    guard(loadLogs)
  })
}
