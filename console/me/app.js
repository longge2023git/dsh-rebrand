/* Minimal Persian console for the DeepSeek-FA gateway.
   Same origin as the API, so the New API session cookie authenticates every call. */

const state = { quotaPerUnit: 500000, page: 1, pageSize: 20 }

const $ = (id) => document.getElementById(id)
const num = (value) => new Intl.NumberFormat('fa-IR').format(Math.round(Number(value) || 0))
const credit = (quota) => (Number(quota || 0) / state.quotaPerUnit).toFixed(2)
/** Per-call costs are often far below 0.01 credits, so keep four decimals there. */
const cost = (quota) => {
  const value = Number(quota || 0) / state.quotaPerUnit
  if (value === 0) return '0'
  if (value < 0.0001) return value.toFixed(6)
  return value < 0.01 ? value.toFixed(4) : value.toFixed(2)
}
/** Gateway writes -1 for ratios a request did not use. */
const val = (value) => (value === undefined || value === null || value === -1 ? '—' : value)
const stamp = (seconds) => (seconds
  ? new Date(seconds * 1000).toLocaleString('fa-IR', { dateStyle: 'short', timeStyle: 'short' })
  : '—')

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
    throw new Error(payload.message || `خطا در ${path}`)
  }
  return payload.data
}

/** Show the sign-in prompt when the session is missing or expired. */
function needLogin() {
  $('auth').hidden = false
  $('app').hidden = true
}

/** Wire a click handler that surfaces failures in the page hint. */
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


/** Map the gateway's English/Chinese auth errors onto Persian copy. */
const AUTH_ERRORS = [
  // Field-specific length errors first: New API reports `Key: 'User.Username' ... max`.
  [/User\.Username.*max|username.*max/i, 'نام کاربری حداکثر ۲۰ نویسه است.'],
  [/User\.Password.*max|password.*max/i, 'گذرواژه حداکثر ۲۰ نویسه است.'],
  [/User\.Password.*min|at least 8/i, 'گذرواژه حداقل ۸ نویسه است.'],
  [/username or password is empty|用户名或密码为空/i, 'نام کاربری یا گذرواژه خالی است.'],
  [/username or password is incorrect|用户名或密码错误/i, 'نام کاربری یا گذرواژه نادرست است.'],
  [/password login has been disabled|密码登录已被关闭|关闭了密码登录/i, 'ورود با گذرواژه توسط مدیر بسته شده است.'],
  [/registration has been disabled|关闭了新用户注册/i, 'ثبت‌نام بسته شده است.'],
  [/password registration has been disabled/i, 'ثبت‌نام با گذرواژه بسته شده است.'],
  [/username already exists|用户名已存在/i, 'این نام کاربری قبلاً ثبت شده است.'],
  [/at least 8|密码长度/i, 'گذرواژه باید بین ۸ تا ۲۰ نویسه باشد.'],
]

/** Translate one gateway auth error, keeping the raw text as a last resort. */
function persianError(message) {
  const text = String(message || '').trim()
  if (!text) return 'خطایی رخ داد. دوباره تلاش کنید.'
  for (const [pattern, copy] of AUTH_ERRORS) if (pattern.test(text)) return copy
  return `خطا: ${text}`
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
  const form = $('auth-form')
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const username = form.username.value.trim()
    const password = form.password.value
    if (!username) return showFormError('نام کاربری را وارد کنید.')
    if (!password) return showFormError('گذرواژه را وارد کنید.')
    const body = JSON.stringify({ username, password })
    try {
      const response = await fetch('/api/user/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
      const payload = await response.json().catch(() => ({}))
      if (!payload.success) return showFormError(persianError(payload.message))
      if (payload.data?.require_2fa) return showFormError('این حساب ورود دو مرحله‌ای دارد؛ فعلاً از کنسول اصلی وارد شوید.')
      rememberUser(payload.data || {})
      location.replace(nextUrl())
    } catch {
      showFormError('اتصال برقرار نشد. دوباره تلاش کنید.')
    }
  })
}

async function startRegister() {
  const form = $('auth-form')
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const username = form.username.value.trim()
    const password = form.password.value
    // Mirror model.User exactly: `username max=20` (no minimum, no format rule) and
    // `password min=8,max=20`. Count code points so the limit matches Go's rune count.
    const runes = (value) => Array.from(value).length
    if (!username) return showFormError('نام کاربری را وارد کنید.')
    if (runes(username) > 20) return showFormError('نام کاربری حداکثر ۲۰ نویسه است.')
    if (runes(password) < 8 || runes(password) > 20) return showFormError('گذرواژه باید بین ۸ تا ۲۰ نویسه باشد.')
    if (password !== form.confirm.value) return showFormError('گذرواژه‌ها یکسان نیستند.')
    try {
      const response = await fetch('/api/user/register', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!payload.success) return showFormError(persianError(payload.message))

      const login = await fetch('/api/user/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const session = await login.json().catch(() => ({}))
      if (!session.success) return showFormError('حساب ساخته شد؛ لطفاً از صفحهٔ ورود وارد شوید.')
      rememberUser(session.data || {})
      location.replace('/me/keys')
    } catch {
      showFormError('اتصال برقرار نشد. دوباره تلاش کنید.')
    }
  })
}

async function startUsage() {
  await loadStatus()
  await guard(async () => {
    const me = await api('/api/user/self')
    $('auth').hidden = true
    $('app').hidden = false
    $('who').textContent = me.display_name || me.username || me.email || 'کاربر'
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
    ['مدل', item.model_name || '—'],
    ['گروه', item.group || '—'],
    ['مسیر درخواست', val(other.request_path)],
    ['منبع صورتحساب', val(other.billing_source)],
    ['نسبت مدل', val(other.model_ratio)],
    ['نسبت گروه', val(other.user_group_ratio ?? other.group_ratio)],
    ['نسبت تکمیل', val(other.completion_ratio)],
    ['نسبت کش', val(other.cache_ratio)],
    ['نسبت ساخت کش', val(other.cache_creation_ratio)],
    ['توکن کش‌شده', other.cache_tokens == null ? '—' : num(other.cache_tokens)],
    ['توکن ساخت کش', other.cache_creation_tokens == null ? '—' : num(other.cache_creation_tokens)],
    ['قیمت مدل', Number(other.model_price) > 0 ? credit(Number(other.model_price) * state.quotaPerUnit) : '—'],
    ['توکن ورودی', num(item.prompt_tokens)],
    ['توکن خروجی', num(item.completion_tokens)],
    ['زمان پاسخ اول', other.frt == null || Number(other.frt) < 0 ? '—' : `${num(other.frt)} میلی‌ثانیه`],
    ['مدت', `${Number(item.use_time || 0).toFixed(2)} ثانیه`],
    ['جریان (stream)', item.is_stream ? 'بله' : 'خیر'],
    ['تبدیل درخواست', val(other.request_conversion)],
    ['کلید', item.token_name || '—'],
    ['کانال', item.channel_name || item.channel || '—'],
    ['هزینه', cost(item.quota)],
    ['واحد خام', num(item.quota)],
    ['شناسه درخواست', item.request_id || '—'],
  ]
  return `<div class="detail-grid">${rows.map(([label, value]) =>
    `<div><span>${label}</span><strong dir="auto">${value}</strong></div>`).join('')}</div>`
}

async function loadLogs() {
  const data = await api(`/api/log/self?p=${state.page}&page_size=${state.pageSize}&type=0`)
  const rows = (data.items || []).filter((item) => Number(item.quota) !== 0 || item.model_name)
  const body = $('rows')
  if (rows.length === 0) {
    body.innerHTML = '<tr><td colspan="6" class="empty">مصرفی ثبت نشده است.</td></tr>'
  } else {
    body.innerHTML = rows.map((item, index) => `<tr>
      <td>${stamp(item.created_at)}</td>
      <td dir="ltr">${item.model_name || '—'}</td>
      <td>${num(item.prompt_tokens)}</td>
      <td>${num(item.completion_tokens)}</td>
      <td>${cost(item.quota)}</td>
      <td class="actions"><button type="button" data-detail="${index}">جزئیات</button></td>
    </tr>
    <tr class="detail" data-panel="${index}" hidden><td colspan="6">${detailHtml(item)}</td></tr>`).join('')
  }
  const total = Number(data.total || 0)
  const pages = Math.max(1, Math.ceil(total / state.pageSize))
  $('pageinfo').textContent = `صفحهٔ ${num(state.page)} از ${num(pages)}`
  $('prev').disabled = state.page <= 1
  $('next').disabled = state.page >= pages
}

async function startKeys() {
  await loadStatus()
  await guard(async () => {
    await api('/api/user/self')
    $('auth').hidden = true
    $('app').hidden = false
    await loadKeys()
  })
}

async function loadKeys() {
  const data = await api(`/api/token/?p=1&size=100`)
  const tokens = data.items || []
  const body = $('rows')
  if (tokens.length === 0) {
    body.innerHTML = '<tr><td colspan="5" class="empty">کلیدی وجود ندارد.</td></tr>'
    return
  }
  body.innerHTML = tokens.map((token) => {
    const masked = `sk-${String(token.key).slice(0, 6)}…${String(token.key).slice(-4)}`
    const status = token.status === 1 ? 'فعال' : 'غیرفعال'
    return `<tr>
      <td>${token.name || '—'}</td>
      <td dir="ltr"><code>${masked}</code></td>
      <td>${credit(token.used_quota)}</td>
      <td>${status}</td>
      <td class="actions">
        <button type="button" data-copy="sk-${token.key}">کپی</button>
        <button type="button" class="danger" data-delete="${token.id}">حذف</button>
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
      copy.textContent = 'کپی شد'
      setTimeout(() => { copy.textContent = 'کپی' }, 1500)
    })
    return
  }
  const remove = event.target.closest('[data-delete]')
  if (remove) {
    guard(async () => {
      await api(`/api/token/${remove.dataset.delete}`, { method: 'DELETE' })
      await loadKeys()
    })
  }
})


document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-detail]')
  if (!trigger) return
  const panel = document.querySelector(`[data-panel="${trigger.dataset.detail}"]`)
  if (!panel) return
  panel.hidden = !panel.hidden
  trigger.textContent = panel.hidden ? 'جزئیات' : 'بستن'
})

document.addEventListener('submit', (event) => {
  if (event.target.id !== 'create') return
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

for (const [id, step] of [['prev', -1], ['next', 1]]) {
  const button = $(id)
  if (!button) continue
  button.addEventListener('click', () => {
    state.page = Math.max(1, state.page + step)
    guard(loadLogs)
  })
}
