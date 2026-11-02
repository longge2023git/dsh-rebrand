/* Minimal Persian console for the DeepSeek-FA gateway.
   Same origin as the API, so the New API session cookie authenticates every call. */

const state = { quotaPerUnit: 500000, page: 1, pageSize: 20 }

const $ = (id) => document.getElementById(id)
const num = (value) => new Intl.NumberFormat('fa-IR').format(Math.round(Number(value) || 0))
const credit = (quota) => (Number(quota || 0) / state.quotaPerUnit).toFixed(2)
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

async function loadLogs() {
  const data = await api(`/api/log/self?p=${state.page}&page_size=${state.pageSize}&type=0`)
  const rows = (data.items || []).filter((item) => Number(item.quota) !== 0 || item.model_name)
  const body = $('rows')
  if (rows.length === 0) {
    body.innerHTML = '<tr><td colspan="5" class="empty">مصرفی ثبت نشده است.</td></tr>'
  } else {
    body.innerHTML = rows.map((item) => `<tr>
      <td>${stamp(item.created_at)}</td>
      <td dir="ltr">${item.model_name || '—'}</td>
      <td>${num(item.prompt_tokens)}</td>
      <td>${num(item.completion_tokens)}</td>
      <td>${credit(item.quota)}</td>
    </tr>`).join('')
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
