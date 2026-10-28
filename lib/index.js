/**
 * dsh-pages —— 让模型把回答做成一页网页，直接在对话里能看能用。
 *
 *   工具  show_page({ title, html, page_id?, display? })：存一版页面；带 page_id 就是改那一页（存成新版本，旧版留着）。
 *         存好后在无头浏览器里体检（报错、空白、溢出、深色适配），结果一起回给模型
 *   路由  /dsh-pages/page?id=&v=&theme=：要 DSH 的登录态；回应头带 CSP sandbox，
 *         页面跑在不透明源里，碰不到 DSH 的接口和 cookie，也不能往外发请求（只能从几个 CDN 拉库和图标；别处的图片也不行）。
 *         送出去时在 <head> 最前面塞一小段脚本（runtime.js）：深浅色跟着 DSH、高度告诉外面、外部链接新窗口开
 *   接口  /dsh-pages/api/{list,meta,thumb,export,reveal,delete,state}：「我的页面」、版本、缩略图、导出、删（挪进回收站）、
 *         页面自己存的 localStorage（送页面时带上，见 runtime.js）
 *   客户端 对话里直接嵌页面 / 缩略图卡片，右侧栏看整页、翻版本、导出（见 client.js）
 *
 * 不 import 任何 @deepseek-ai/*（link 装法下解析不到），工具外壳按 dsh-tools 的产出手搓。
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import { dataDir, newId, readMeta, readVersion, saveVersion, noteCheck, listPages, thumbFile, trashPage, readState, writeState, ID_RE } from './store.js'
import { injectRuntime } from './runtime.js'
import { createBrowser } from './browser.js'
import { checkPage, shootPage, printPage } from './check.js'

export { dataDir, newId }

export const name = '@orderg-x/dsh-pages'
export const inject = ['tools', 'webServer']

export const PKG = '@orderg-x/dsh-pages'
export const TOOL = 'show_page'
export const ROUTE = '/dsh-pages/page'
export const API = '/dsh-pages/api/'
const MAX_BYTES = 2 * 1024 * 1024
const MAX_BODY = 64 * 1024
const CHECK_MS = 15000 // 体检最多等多久；超时就先回结果，不耽误模型
const TOKEN_MS = 60000

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
const LOOPBACK_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i

// 每个回应都带这个头：前端靠它分清「插件路由在回话」还是「路由根本没挂上」
const MARK = { 'X-DSH-Pages': PKG }

// 页面里能用的外部资源：常见 CDN 的库、字体、图标图片；不能 fetch / XHR / WebSocket，也不能载别处的图片、音视频
// （不然页面能把用户填的东西拼进图片地址发出去）
const CDN = 'https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com'
export const SANDBOX = 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals'
export const CSP = [
  `sandbox ${SANDBOX}`,
  "default-src 'none'",
  `script-src 'unsafe-inline' 'unsafe-eval' ${CDN}`,
  `style-src 'unsafe-inline' ${CDN} https://fonts.googleapis.com`,
  `font-src data: ${CDN} https://fonts.gstatic.com`,
  `img-src data: blob: ${CDN}`,
  'media-src data: blob:',
  "connect-src 'none'",
  "frame-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'self'",
].join('; ')

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

// 模型只给了一段 HTML 时套的外壳：基本排版 + 一套跟着深浅色变的颜色变量（页面里可以直接用 var(--fg) 这些）
const BASE_STYLE = ':root{color-scheme:light dark;--fg:#1f2329;--muted:#646a73;--bg:#fff;--card:#f5f6f7;--line:#e5e6eb;--accent:#3370ff}' +
  ':root[data-theme=dark]{--fg:#e6e8eb;--muted:#9aa0a8;--bg:#18191c;--card:#232428;--line:#33353a;--accent:#6b93ff}' +
  '@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--fg:#e6e8eb;--muted:#9aa0a8;--bg:#18191c;--card:#232428;--line:#33353a;--accent:#6b93ff}}' +
  'body{margin:0;padding:20px 24px;font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;line-height:1.6;color:var(--fg);background:var(--bg)}' +
  'a{color:var(--accent)}table{border-collapse:collapse}th,td{border-bottom:1px solid var(--line);padding:6px 10px;text-align:left}'

/** 模型只给了一段 HTML（没有 <html> / doctype）时，套一个带基本排版的外壳 */
export function wrapPage(title, html) {
  if (/<!doctype\s+html|<html[\s>]/i.test(html)) return html
  return '<!doctype html><html lang="zh"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    `<title>${escapeHtml(title)}</title><style>${BASE_STYLE}</style>` +
    `</head><body>${html}</body></html>`
}

/** 存成新页面（测试和老调用用）：返回 id */
export async function savePage({ title, html }) {
  const { id } = await saveVersion({ title, html, display: 'inline' })
  return id
}

// ── 把门 ────────────────────────────────────────────────────────────────────

function ownHost(ctx) {
  try { return new URL(ctx.webServer.getOrigin()).host } catch { return '' }
}

/** Host / Sec-Fetch-Site / Origin 三道，照 DSH 自家路由的规矩（防 DNS 重绑定、跨站） */
function fenceOk(req, own) {
  const host = String(req.headers.host || '')
  if (!LOOPBACK_HOST.test(host) && !(own && host === own)) return false
  if (req.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = req.headers.origin
  if (origin === undefined) return true
  try { return new URL(origin).host === host } catch { return false }
}

/** DSH 的 connection 服务：验登录 cookie 用的就是它。拿不到（老版本）返回 null */
function connectionOf(ctx) {
  try {
    const c = ctx.get('connection')
    return c && typeof c.requestRejection === 'function' ? c : null
  } catch {
    return null
  }
}

function reply(res, code, text) {
  res.writeHead(code, { ...MARK, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(text)
}

function json(res, code, body) {
  res.writeHead(code, { ...MARK, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

function readBody(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > limit) {
        reject(new Error('too large'))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')) } catch { reject(new Error('bad json')) }
    })
    req.on('error', reject)
  })
}

/** 登录态 + 防跨站；不过就直接回了，返回 false */
function admit(ctx, req, res, asJson) {
  const deny = (code, text) => { if (asJson) json(res, code, { error: text }); else reply(res, code, text) }
  const conn = connectionOf(ctx)
  if (conn) {
    const rejected = conn.requestRejection(req)
    if (rejected) { deny(rejected, rejected === 401 ? 'unauthorized' : 'forbidden'); return false }
  } else if (!LOOPBACK.has(req.socket.remoteAddress) || !fenceOk(req, ownHost(ctx))) {
    deny(403, 'forbidden')
    return false
  }
  // 改东西的请求：只收同源发来的 JSON（跨站表单发不了 application/json）
  if (req.method === 'POST') {
    if (req.headers['sec-fetch-site'] === 'cross-site' || !/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) {
      deny(403, 'forbidden')
      return false
    }
  }
  return true
}

const MISSING = '<!doctype html><meta charset="utf-8"><body style="font:14px system-ui,sans-serif;color:#888;text-align:center;margin:0;padding:48px 16px">页面找不到了（可能在「我的页面」里删掉了）</body>'

/** 标题 → 文件名：只留各国文字、数字、_ 和 -；Windows 的保留名（CON、NUL、COM1…）前面加 page- */
export function safeName(title) {
  const s = String(title || 'page').replace(/[^\p{L}\p{M}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'page'
  return /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s) ? 'page-' + s : s
}

// ── 工具 ────────────────────────────────────────────────────────────────────

export function pageTool(run) {
  return {
    name: TOOL,
    description:
      '把回答做成一页网页，直接显示在对话里（能点能用），用户也能在右侧栏看整页、导出。\n' +
      '什么时候用：用户说「做成一页 / 做个页面给我看 / 用网页展示」，或者回答是对比、表格、清单 / 计划、数据图表、时间线、小工具 / 计算器、测验 / 学习卡片这类「看一页比读一段字清楚」的。' +
      '一次调用就完成：不要写文件、不要开预览、不要自己截图检查、不要加载 ui-design 技能。' +
      '有交互（勾选、增删、存数据）的页面也别先在本地服务器或浏览器里试：页面跑在 DSH 的沙箱里，别处试不准；直接调，存好会自动体检，脚本报错会交给你。' +
      '只有用户要设计产品界面（网站 / App 的设计稿、海报、幻灯片）时才走 ui-design 和设计工作台。纯聊天、几句话能说完的不要用。\n' +
      '改已经做好的页面：带上次结果里的 page_id 再调一次，传完整的新 HTML，存成新版本（旧版本留着，用户能来回翻）。\n' +
      '怎么写：完整、自包含的页面，样式和脚本都写在页面里；图表等库可以从 cdn.jsdelivr.net / cdnjs.cloudflare.com / unpkg.com 引。' +
      '页面跑在沙箱里：不能 fetch 任何地址、不能读本机文件、不能载别处的图片，数据直接写进页面，图用 SVG / emoji / CSS 画；localStorage 直接用（插件接好了，按页面存在 DSH 里，重开、改出新版本都还在，不用自己兜底）；同一页可能同时开在对话里和右侧栏，监听 storage 事件重画，两边就实时同步。\n' +
      '排版：页面嵌在对话里（宽约 700px，高度跟着内容走），不要用 100vh 撑满屏；外面已经有边框，页面本身别再套一层带边框 / 阴影的大卡片，背景直接铺满；窄屏（手机）也要能看。' +
      '深浅色：颜色写成 CSS 变量，:root 里给浅色，:root[data-theme="dark"] 里给深色，页面会跟着 DSH 自动切换，不用自己做切换按钮。' +
      '要好看：留白充足、字号层级清楚、配色克制。\n' +
      '存好后会自动在浏览器里体检（报错、空白、溢出、深色），结果在工具返回里；有问题就改了再调一次，没问题就别再检查。' +
      '调用后回复里不要再贴 HTML，一两句话说明页面里有什么就行。',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '页面标题，短一点，例如「三款手机对比」' },
        html: { type: 'string', description: '完整的 HTML 页面（<!doctype html> 开头）' },
        page_id: { type: 'string', description: '改已有页面时填上次返回的 page_id；做新页面不填' },
        display: {
          type: 'string',
          enum: ['inline', 'card'],
          description: 'inline（默认）：页面直接嵌在对话里，适合小工具、计算器、对比、图表、测验；card：对话里只放一张缩略图卡片，点开在右侧看，适合很长的报告、文档',
        },
      },
      required: ['title', 'html'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string' },
          id: { type: 'string' },
          v: { type: 'number' },
          title: { type: 'string' },
          display: { type: 'string' },
        },
        required: ['text', 'id'],
      },
      render: (_args, value) => [{ type: 'text', text: value.text }],
    },
    execute: (args) => run(args || {}),
  }
}

export function apply(ctx) {
  const log = (e) => {
    try { ctx.logger.warn(`dsh-pages: ${e && e.message ? e.message : e}`) } catch { /* 没 logger 就算了 */ }
  }

  // 体检用的无头浏览器：用到时才开，闲置自己关，插件停用时关掉。DSH_PAGES_CHECK=0 关掉体检
  let browser = null
  ctx.effect(() => {
    const b = process.env.DSH_PAGES_CHECK === '0' ? null : createBrowser({ log })
    browser = b
    return () => {
      if (b) b.destroy()
      if (browser === b) browser = null
    }
  }, 'dsh-pages: headless browser')

  // 无头浏览器没有 DSH 的登录 cookie：给它一个一分钟有效、只认这一页的口令
  const tokens = new Map()
  function tokenFor(id) {
    const now = Date.now()
    for (const [k, x] of tokens) if (x.exp < now) tokens.delete(k)
    const k = crypto.randomBytes(16).toString('hex')
    tokens.set(k, { id, exp: now + TOKEN_MS })
    return k
  }
  /** 带口令的页面地址。给的是函数：浏览器排到空位、真要开页面时才发口令（排队久了口令不会先过期） */
  function localUrl(id, v, extra = '') {
    let origin = ''
    try { origin = new URL(ctx.webServer.getOrigin()).origin } catch { return null }
    return () => `${origin}${ROUTE}?id=${id}&v=${v}&k=${tokenFor(id)}${extra}`
  }

  // ── 页面 ──

  async function pageRoute(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return reply(res, 405, 'method not allowed')
    const q = new URL(req.url, 'http://127.0.0.1').searchParams
    const id = q.get('id') || ''
    const k = q.get('k')
    const tok = k && tokens.get(k)
    const viaToken = tok && tok.id === id && tok.exp >= Date.now() && LOOPBACK.has(req.socket.remoteAddress)
    if (!viaToken && !admit(ctx, req, res, false)) return
    const head = {
      ...MARK,
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': CSP,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
    }
    const found = ID_RE.test(id) ? await readVersion(id, q.get('v')) : null
    if (!found) {
      res.writeHead(404, head)
      return res.end(req.method === 'HEAD' ? undefined : MISSING)
    }
    const title = (found.meta.versions.find((x) => x.v === found.v) || {}).title || found.meta.title
    const page = wrapPage(title, found.html)
    let body
    if (q.get('download') === '1') {
      // 存成文件：原样页面，不带注入的脚本
      body = Buffer.from(page, 'utf8')
      head['Content-Disposition'] = `attachment; filename="page.html"; filename*=UTF-8''${encodeURIComponent(safeName(title) + '.html')}`
    } else {
      body = Buffer.from(injectRuntime(page, q.get('theme'), await readState(id)), 'utf8')
    }
    res.writeHead(200, { ...head, 'Content-Length': body.length })
    res.end(req.method === 'HEAD' ? undefined : body)
  }

  // ── 接口 ──

  async function listRoute(req, res) {
    if (!admit(ctx, req, res, true)) return
    json(res, 200, { pages: await listPages() })
  }

  async function metaRoute(req, res) {
    if (!admit(ctx, req, res, true)) return
    const id = new URL(req.url, 'http://127.0.0.1').searchParams.get('id') || ''
    const meta = await readMeta(id)
    if (!meta) return json(res, 404, { error: 'not found' })
    json(res, 200, { id: meta.id, title: meta.title, display: meta.display, created: meta.created, updated: meta.updated, versions: meta.versions })
  }

  async function thumbRoute(req, res) {
    if (!admit(ctx, req, res, false)) return
    const q = new URL(req.url, 'http://127.0.0.1').searchParams
    const id = q.get('id') || ''
    const v = Number(q.get('v'))
    let buf = null
    if (ID_RE.test(id) && Number.isInteger(v) && v > 0) {
      // 要深色的没有（老页面）就给浅色的
      if (q.get('theme') === 'dark') buf = await fs.promises.readFile(thumbFile(id, v, true)).catch(() => null)
      if (!buf) buf = await fs.promises.readFile(thumbFile(id, v)).catch(() => null)
    }
    if (!buf) return reply(res, 404, 'no thumb')
    res.writeHead(200, { ...MARK, 'Content-Type': 'image/jpeg', 'Content-Length': buf.length, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' })
    res.end(buf)
  }

  const exported = new Set()
  async function exportRoute(req, res) {
    if (!admit(ctx, req, res, true)) return
    if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' })
    let body
    try { body = await readBody(req) } catch (e) { return json(res, 400, { error: e.message }) }
    const id = String(body.id || '')
    const format = ['html', 'png', 'pdf'].includes(body.format) ? body.format : ''
    if (!format) return json(res, 400, { error: 'format 只能是 html / png / pdf' })
    const found = ID_RE.test(id) ? await readVersion(id, body.v) : null
    if (!found) return json(res, 404, { error: '找不到这一页' })
    const title = (found.meta.versions.find((x) => x.v === found.v) || {}).title || found.meta.title
    let buf
    if (format === 'html') buf = Buffer.from(wrapPage(title, found.html), 'utf8')
    else {
      if (!browser || !browser.available()) return json(res, 400, { error: '这台电脑上没找到 Chrome / Edge，只能导出 HTML' })
      const theme = body.theme === 'dark' && format === 'png' ? 'dark' : 'light'
      const url = localUrl(id, found.v, `&theme=${theme}`)
      if (!url) return json(res, 500, { error: '导出没成功：拿不到 DSH 的本机地址' })
      try {
        buf = format === 'png' ? await shootPage(browser, url) : await printPage(browser, url)
      } catch (e) {
        log(e)
        return json(res, 500, { error: '导出没成功：' + e.message })
      }
    }
    const dir = path.join(os.homedir(), 'Downloads')
    try {
      fs.mkdirSync(dir, { recursive: true })
      const base = safeName(title) + (found.meta.versions.length > 1 ? `-v${found.v}` : '')
      // 不覆盖已有的文件：重名就加 -2、-3…（wx：两次导出同时落盘也不会写到同一个文件上）
      let file = ''
      for (let i = 1; !file && i < 1000; i++) {
        const f = path.join(dir, i === 1 ? `${base}.${format}` : `${base}-${i}.${format}`)
        try { fs.writeFileSync(f, buf, { flag: 'wx' }); file = f } catch (e) { if (e.code !== 'EEXIST') throw e }
      }
      if (!file) throw new Error('「下载」里同名文件太多了')
      exported.add(file)
      json(res, 200, { path: file, name: path.basename(file) })
    } catch (e) {
      json(res, 500, { error: e.message })
    }
  }

  async function revealRoute(req, res) {
    if (!admit(ctx, req, res, true)) return
    if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' })
    let body
    try { body = await readBody(req) } catch (e) { return json(res, 400, { error: e.message }) }
    const file = String(body.path || '')
    if (!exported.has(file) || !fs.existsSync(file)) return json(res, 404, { error: 'not exported here' })
    const [cmd, args] = process.platform === 'darwin' ? ['open', ['-R', file]]
      : process.platform === 'win32' ? ['explorer', [`/select,${file}`]]
        : ['xdg-open', [path.dirname(file)]]
    execFile(cmd, args, (e) => { if (e && process.platform !== 'win32') log(e) }) // explorer 正常也返回 1
    json(res, 200, { ok: true })
  }

  async function deleteRoute(req, res) {
    if (!admit(ctx, req, res, true)) return
    if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' })
    let body
    try { body = await readBody(req) } catch (e) { return json(res, 400, { error: e.message }) }
    if (!(await trashPage(String(body.id || '')))) return json(res, 404, { error: '找不到这一页' })
    json(res, 200, { ok: true })
  }

  async function stateRoute(req, res) {
    if (!admit(ctx, req, res, true)) return
    if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' })
    let body
    try { body = await readBody(req, 1536 * 1024) } catch (e) { return json(res, 400, { error: e.message }) }
    try {
      await writeState(String(body.id || ''), body.ops)
      json(res, 200, { ok: true })
    } catch (e) {
      json(res, e.code || 500, { error: e.message })
    }
  }

  const routes = { [ROUTE]: pageRoute, [API + 'list']: listRoute, [API + 'meta']: metaRoute, [API + 'thumb']: thumbRoute, [API + 'export']: exportRoute, [API + 'reveal']: revealRoute, [API + 'delete']: deleteRoute, [API + 'state']: stateRoute }
  for (const [p, handler] of Object.entries(routes)) {
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: p,
      handler: (req, res) => {
        Promise.resolve(handler(req, res)).catch((e) => {
          log(e)
          if (!res.headersSent) reply(res, 500, 'internal')
        })
      },
    }), `dsh-pages: ${p}`)
  }

  // ── 工具 ──

  async function check(id, v) {
    if (!browser || !browser.available()) return { text: '（这台电脑上没找到 Chrome / Edge，没做体检）' }
    const url = localUrl(id, v, '&theme=light')
    if (!url) return { text: '' }
    let timer
    const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(null), CHECK_MS) })
    const note = (r) => noteCheck(id, v, { ok: r.ok, issues: r.issues, darkOk: r.darkOk, height: r.height }, r.jpg, r.jpgDark)
    const running = checkPage(browser, url)
    try {
      const r = await Promise.race([running, timeout])
      if (!r) {
        // 先回模型；体检跑完了照样记下结果、存缩略图
        running.then(note).catch(log)
        return { text: '体检：没跑完（页面载入太慢），先这样' }
      }
      await note(r).catch(log)
      return { height: r.height, text: r.ok ? '体检：没发现问题。' : '体检发现：\n' + r.issues.map((s) => '- ' + s).join('\n') + '\n改好了用同一个 page_id 再调一次 show_page。' }
    } catch (e) {
      log(e)
      return { text: '' }
    } finally {
      clearTimeout(timer)
    }
  }

  async function run(args) {
    const title = String(args.title || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 80) || '页面'
    const html = String(args.html || '')
    if (!html.trim()) throw new Error('html 不能为空')
    if (Buffer.byteLength(html, 'utf8') > MAX_BYTES) throw new Error('页面太大（超过 2 MB），把数据精简一下再试')
    const pageId = String(args.page_id || '').trim()
    if (pageId && !ID_RE.test(pageId)) throw new Error(`page_id「${pageId.slice(0, 40)}」不对。要做新页面就别带 page_id`)
    const display = args.display === 'card' ? 'card' : 'inline'
    const { id, v } = await saveVersion({ pageId, title, html, display })
    const { text: checked, height } = await check(id, v)
    const where = display === 'card' ? '对话里放了一张卡片，用户点开在右侧看整页' : '页面直接嵌在对话里，用户能直接用，也能在右侧看整页'
    const lines = [
      `已显示页面「${title}」${v > 1 ? `（第 ${v} 版）` : ''}：${where}。`,
      `page_id: ${id}（要改这一页就带上它再调 show_page，会存成新版本）`,
      checked,
      // 最后一行是页面地址：客户端从这里认出是哪一页、哪一版；h 是体检量出的嵌入高度，对话里先按它撑开，不跳
      `${ROUTE}?id=${id}&v=${v}${height > 0 ? `&h=${Math.round(height)}` : ''}`,
    ].filter(Boolean)
    return { text: lines.join('\n'), id, v, title, display }
  }

  ctx.tools.register(pageTool(run))
}
