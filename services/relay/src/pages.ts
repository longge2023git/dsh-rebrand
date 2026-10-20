/** Server-rendered pages for the relay's browser surfaces. */
import { escapeHtml } from './security.ts'

const STYLE = `
  :root { color-scheme: light dark; --bg:#f6f7f9; --card:#fff; --text:#16181d; --muted:#5b6270; --line:#dfe3ea; --accent:#2f6fed; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0f1115; --card:#171a20; --text:#e9ecf1; --muted:#9aa2b1; --line:#2a2f39; --accent:#7aa2ff; } }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:var(--bg); color:var(--text);
    font:15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
  main { width:min(420px, calc(100vw - 32px)); background:var(--card); border:1px solid var(--line); border-radius:14px; padding:28px; }
  h1 { font-size:20px; margin:0 0 6px; } p { margin:0 0 18px; color:var(--muted); }
  label { display:block; font-size:13px; margin:14px 0 6px; color:var(--muted); }
  input { width:100%; padding:10px 12px; border:1px solid var(--line); border-radius:9px; background:transparent; color:inherit; font:inherit; }
  button { width:100%; margin-top:20px; padding:11px 14px; border:0; border-radius:9px; background:var(--accent); color:#fff; font:inherit; font-weight:600; cursor:pointer; }
  button.secondary { background:transparent; color:var(--accent); border:1px solid var(--line); }
  .error { color:#d33; font-size:13px; margin-top:12px; }
  .switch { margin-top:16px; font-size:13px; color:var(--muted); text-align:center; }
  .switch a { color:var(--accent); text-decoration:none; }
  .note { font-size:12px; color:var(--muted); margin-top:18px; }
`

function layout(title: string, body: string): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title><style>${STYLE}</style></head>
<body><main>${body}</main></body></html>`
}

/** Render the sign-in or registration form for one transaction. */
export function authorizePage(input: {
  readonly brand: string
  readonly tx: string
  readonly csrf: string
  readonly mode: 'login' | 'register'
  readonly email: string
  readonly message?: string
  readonly allowRegistration: boolean
}): string {
  const register = input.mode === 'register'
  const title = register ? `注册 ${input.brand}` : `登录 ${input.brand}`
  const switchHref = `/dsh/authorize?tx=${encodeURIComponent(input.tx)}&mode=${register ? 'login' : 'register'}`
  const switchText = register ? '已有账号？去登录' : '没有账号？去注册'
  return layout(title, `
    <h1>${escapeHtml(title)}</h1>
    <p>授权 DSH 使用你的账号。登录成功后会自动回到应用。</p>
    <form method="post" action="/dsh/authorize">
      <input type="hidden" name="tx" value="${escapeHtml(input.tx)}">
      <input type="hidden" name="csrf" value="${escapeHtml(input.csrf)}">
      <input type="hidden" name="mode" value="${register ? 'register' : 'login'}">
      <label for="email">邮箱</label>
      <input id="email" name="email" type="email" autocomplete="email" required value="${escapeHtml(input.email)}">
      <label for="password">密码</label>
      <input id="password" name="password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" minlength="8" required>
      ${input.message === undefined ? '' : `<div class="error">${escapeHtml(input.message)}</div>`}
      <button type="submit">${register ? '注册并登录' : '登录'}</button>
    </form>
    ${input.allowRegistration ? `<div class="switch"><a href="${escapeHtml(switchHref)}">${switchText}</a></div>` : ''}
    <div class="note">本服务为 DSH 本地参考中转站，仅用于开发与联调。</div>
  `)
}

/** Render the post-login completion page. */
export function authorizedPage(brand: string): string {
  return layout('授权完成', `
    <h1>${escapeHtml(brand)}</h1>
    <p>登录已完成，可以关闭此窗口回到 DSH。</p>
    <div class="note">如果没有自动返回，请关闭标签页并在应用内重试。</div>
  `)
}

/** Render a simple informational page. */
export function simplePage(input: {
  readonly brand: string
  readonly title: string
  readonly body: string
  readonly email?: string
}): string {
  return layout(input.title, `
    <h1>${escapeHtml(input.title)}</h1>
    <p>${escapeHtml(input.body)}</p>
    ${input.email === undefined ? '' : `<div class="note">当前账号：${escapeHtml(input.email)}</div>`}
    <div class="note">${escapeHtml(input.brand)} · 本地参考实现</div>
  `)
}

/** Render an error page. */
export function errorPage(brand: string, message: string): string {
  return layout('请求无效', `
    <h1>请求无效</h1>
    <p>${escapeHtml(message)}</p>
    <div class="note">${escapeHtml(brand)}</div>
  `)
}
