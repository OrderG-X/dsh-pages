/**
 * 页面插件真机测试：全新的 DSH 网页版 + 本地「假模型」+ 无头 Chrome，在官方界面里走一遍
 *   ① 打包、装进全新的 DSH
 *   ② 假模型调 show_page，参数一点点流出来 → 对话里先出「正在写页面…」卡片
 *   ③ 回合结束、工具调用折进「已完成」后 → 页面直接嵌在回复正下方，高度跟着内容；
 *      DSH 换深浅色 → 页面跟着换（不重载）；模型拿到体检结果；页面跑在沙箱里（碰不到 DSH 的 cookie / 接口）
 *   ④ 点「在右侧打开」→ 右侧栏「页面」标签载这一页
 *   ⑤ 再让模型带 page_id 改一次 → 对话里出 v2；右侧栏能翻回 v1
 *   ⑥ 导出 HTML / PNG；「全部页面」里有这一页和缩略图
 *
 *   node e2e/e2e-pages.mjs [--dsh <版本>] [--html <页面文件>] [--out <截图目录>] [--light] [--keep]
 * 要本机装着 Chrome（CHROME_BIN 可指定）。
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { spawn, spawnSync, execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const arg = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d)
const DSH_SPEC = arg('--dsh', 'latest')
const KEEP = argv.includes('--keep')
const DARK = !argv.includes('--light')
const REGISTRY = 'https://registry.npmjs.org/'
const WIN = process.platform === 'win32'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const results = []
const check = (name, cond, extra = '') => {
  results.push({ name, ok: !!cond })
  console.log(`${cond ? '✓' : '✗'} ${name}${cond ? '' : `  ${extra}`}`)
  return !!cond
}
const failed = () => results.filter((r) => !r.ok)

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-pages-')))
const HOME = path.join(tmp, 'home')
fs.mkdirSync(HOME, { recursive: true })
const env = { ...process.env, HOME, USERPROFILE: HOME, DSH_HOME: path.join(tmp, 'dsh-home'), npm_config_registry: REGISTRY, DEEPSEEK_API_KEY: 'sk-e2e-fake' }
const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { env, encoding: 'utf8', maxBuffer: 64 << 20, shell: WIN && cmd === 'npm', ...opts })
  return { code: r.status, out: ((r.stdout || '') + (r.stderr || '')).trim() }
}
const SHOTS = path.resolve(arg('--out', path.join(tmp, 'shots')))
fs.mkdirSync(SHOTS, { recursive: true })

// 深浅色用 CSS 变量；.probe 只在深色时有 40px 高：对话里的页面高度变了，就说明深浅色切过去了。
// 「只看 5000 元以下」记在 localStorage 里：重开 DSH 还勾着，就说明页面存的东西存进 DSH 了
const DEMO = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>三款手机对比</title>
<style>:root{--bg:#f7f5f0;--fg:#1d1d1f;--card:#fff;--muted:#6b6b6b;--price:#c2410c}
:root[data-theme="dark"]{--bg:#17181b;--fg:#ececec;--card:#232428;--muted:#9a9a9a;--price:#fb923c}
body{margin:0;font:15px/1.6 system-ui,-apple-system,"PingFang SC",sans-serif;background:var(--bg);color:var(--fg)}main{padding:24px}
h1{font-size:26px;margin:0 0 6px}p.lead{color:var(--muted);margin:0 0 18px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
.card{background:var(--card);border-radius:14px;padding:16px}.card h2{margin:0 0 4px;font-size:17px}.price{font-size:24px;font-weight:700;color:var(--price)}
dl{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;margin:10px 0 0}dt{color:var(--muted)}dd{margin:0}label{display:inline-flex;gap:8px;align-items:center;margin-bottom:16px}
.hide{display:none}.probe{height:0}:root[data-theme="dark"] .probe{height:40px}</style></head><body><main><h1>三台旗舰，各让一步</h1><p class="lead">价格、屏幕、电池、相机、重量，一页看完。</p>
<label><input type="checkbox" id="cheap"> 只看 5000 元以下</label>
<div class="grid"><div class="card" data-price="5999"><h2>iPhone 17</h2><div class="price">¥5,999</div><dl><dt>屏幕</dt><dd>6.3″ 120Hz</dd><dt>电池</dt><dd>3,700 mAh</dd><dt>相机</dt><dd>48MP ×2</dd><dt>重量</dt><dd>177 g</dd></dl></div>
<div class="card" data-price="4499"><h2>小米 16</h2><div class="price">¥4,499</div><dl><dt>屏幕</dt><dd>6.36″ 120Hz</dd><dt>电池</dt><dd>6,000 mAh</dd><dt>相机</dt><dd>50MP ×3</dd><dt>重量</dt><dd>191 g</dd></dl></div>
<div class="card" data-price="5499"><h2>华为 Mate 80</h2><div class="price">¥5,499</div><dl><dt>屏幕</dt><dd>6.7″ 120Hz</dd><dt>电池</dt><dd>5,500 mAh</dd><dt>相机</dt><dd>50MP ×3</dd><dt>重量</dt><dd>217 g</dd></dl></div></div>
<div class="probe"></div>
<script>var cb=document.getElementById('cheap');function apply(){document.querySelectorAll('.card').forEach(function(c){c.classList.toggle('hide',cb.checked&&+c.dataset.price>=5000)})}
cb.checked=localStorage.getItem('cheap')==='1';apply();cb.onchange=function(){localStorage.setItem('cheap',cb.checked?'1':'0');apply()}</script></main></body></html>`
const OWN_HTML = !!arg('--html')
const PAGE = { title: '三款旗舰手机对比', html: OWN_HTML ? fs.readFileSync(arg('--html'), 'utf8') : DEMO }

// 第一次打开有「预览版说明」挡着输入框：起 DSH 前在 web profile 的补丁层里记上已读（同设计台的 e2e）
function seedWelcome(cliDir) {
  const rel = path.join('@deepseek-ai', 'dsh-client-ui-settings-models', 'lib', 'client.js')
  const src = [path.join(tmp, 'cli', 'node_modules', rel), path.join(cliDir, 'node_modules', rel)].find((f) => fs.existsSync(f))
  const m = src && /WELCOME_NOTICE_SETTINGS_NAMESPACE = "([\w-]+)"[\s\S]{0,600}?WELCOME_NOTICE_VERSION = "([^"]+)"/.exec(fs.readFileSync(src, 'utf8'))
  if (!m) return '没找到版本号，照旧点「继续」'
  const [, id, version] = m
  const file = path.join(env.DSH_HOME, 'profiles', 'web', 'cordis.patch.yml')
  const old = (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '').replace(/^\[\]\s*$/m, '')
  if (new RegExp(`^- id: ${id}$`, 'm').test(old)) return `补丁层里已有 ${id}，没动`
  const entry = `- id: ${id}\n  name: "@deepseek-ai/dsh-client-${id}"\n  config:\n    welcomeNoticeVersion: ${JSON.stringify(version)}\n`
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, old && !old.endsWith('\n') ? `${old}\n${entry}` : old + entry)
  return `预先记上已读 ${version}`
}

// ── 假模型：Anthropic Messages，SSE；show_page 的参数分几十段慢慢流出来，像真模型在写 ──
// 套模板：模型只给内容
const TPL = { title: '搬家清单', template: 'checklist', data: { subtitle: '按时间排', groups: [{ title: '提前一周', items: ['约搬家公司', { text: '办宽带移机', tag: '要预约' }] }, { title: '当天', items: ['交钥匙'] }] } }
const llmLog = []
let pageResult = ''
let pageId = ''
const textOf = (m) => (typeof m.content === 'string' ? m.content : (m.content || []).map((c) => c.text || (c.type === 'tool_result' ? '[tool_result]' : '')).join(' '))
async function sse(res, blocks, stop) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
  const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`)
  ev('message_start', { message: { id: `msg_${Date.now()}`, type: 'message', role: 'assistant', model: 'deepseek-flash', content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })
  for (const [i, b] of blocks.entries()) {
    if (b.type === 'text') {
      ev('content_block_start', { index: i, content_block: { type: 'text', text: '' } })
      ev('content_block_delta', { index: i, delta: { type: 'text_delta', text: b.text } })
    } else {
      ev('content_block_start', { index: i, content_block: { type: 'tool_use', id: b.id, name: b.name, input: {} } })
      const json = JSON.stringify(b.input)
      const step = Math.ceil(json.length / 40)
      for (let at = 0; at < json.length; at += step) {
        ev('content_block_delta', { index: i, delta: { type: 'input_json_delta', partial_json: json.slice(at, at + step) } })
        await sleep(b.slow ? 150 : 0)
      }
    }
    ev('content_block_stop', { index: i })
  }
  ev('message_delta', { delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 5 } })
  ev('message_stop', {})
  res.end()
}
const llm = http.createServer((req, res) => {
  let raw = ''
  req.on('data', (c) => { raw += c })
  req.on('end', () => {
    let body = {}
    try { body = JSON.parse(raw) } catch {}
    const msgs = body.messages || []
    const last = msgs[msgs.length - 1] || {}
    const agent = Array.isArray(body.tools) && body.tools.length > 0
    llmLog.push({ agent, tools: (body.tools || []).map((t) => t.name), last: textOf(last).slice(0, 80) })
    if (!req.url.includes('/messages')) { res.writeHead(404); return res.end() }
    if (!agent) return sse(res, [{ type: 'text', text: '手机对比' }], 'end_turn')
    const said = textOf(last)
    if (said.includes('[tool_result]')) {
      pageResult = (last.content || []).filter((c) => c.type === 'tool_result').map((c) => (typeof c.content === 'string' ? c.content : (c.content || []).map((x) => x.text || '').join(''))).join('\n')
      pageId = (/page_id: ([a-z0-9]+-[a-f0-9]{8})/.exec(pageResult) || [])[1] || pageId
      return sse(res, [{ type: 'text', text: '做好了：三款手机的价格、屏幕、电池、相机、重量都在这一页，勾「只看 5000 元以下」就只剩小米 16。' }], 'end_turn')
    }
    if (said.includes('MAKE-V2')) {
      const v2 = { title: '三款旗舰手机对比（按价格排）', html: PAGE.html.replace(/三台旗舰，各让一步/, '按价格从低到高'), page_id: pageId }
      return sse(res, [{ type: 'text', text: '改一下标题和排序。' }, { type: 'tool_use', id: 'toolu_e2e_page2', name: 'show_page', input: v2 }], 'tool_use')
    }
    if (said.includes('MAKE-TPL')) return sse(res, [{ type: 'text', text: '做成一张清单。' }, { type: 'tool_use', id: 'toolu_e2e_tpl', name: 'show_page', input: TPL }], 'tool_use')
    if (said.includes('MAKE-PAGE')) {
      if (!(body.tools || []).some((t) => t.name === 'show_page')) return sse(res, [{ type: 'text', text: '没有 show_page。' }], 'end_turn')
      return sse(res, [{ type: 'text', text: '我把三款机型做成一页对比。' }, { type: 'tool_use', id: 'toolu_e2e_page', name: 'show_page', input: PAGE, slow: true }], 'tool_use')
    }
    return sse(res, [{ type: 'text', text: '你好。' }], 'end_turn')
  })
})

// ── 无头 Chrome（CDP 走 --remote-debugging-pipe）──
function chromeBin() {
  const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean)
  const c = {
    darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
    win32: roots.map((d) => path.join(d, 'Google', 'Chrome', 'Application', 'chrome.exe')),
    linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'],
  }
  return [process.env.CHROME_BIN, ...(c[process.platform] || [])].filter(Boolean).find((p) => fs.existsSync(p)) || null
}
function launchChrome(bin) {
  const udd = path.join(tmp, 'chrome')
  const proc = spawn(bin, ['--remote-debugging-pipe', `--user-data-dir=${udd}`, '--headless=new', '--no-first-run', '--no-default-browser-check',
    '--window-size=1440,900', '--force-device-scale-factor=2', '--lang=zh-CN', '--no-proxy-server', ...(process.platform === 'darwin' ? ['--use-mock-keychain'] : []), ...(process.platform === 'linux' ? ['--no-sandbox'] : []), 'about:blank'],
  { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'], windowsHide: true })
  const pending = new Map()
  let seq = 0
  let buf = Buffer.alloc(0)
  proc.stdio[4].on('data', (d) => {
    buf = Buffer.concat([buf, d])
    let i
    while ((i = buf.indexOf(0)) >= 0) {
      const msg = JSON.parse(buf.subarray(0, i).toString('utf8'))
      buf = buf.subarray(i + 1)
      const p = msg.id && pending.get(msg.id)
      if (!p) continue
      pending.delete(msg.id)
      if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result)
    }
  })
  const cdp = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++seq
    pending.set(id, { resolve, reject })
    proc.stdio[3].write(`${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`)
    setTimeout(() => { if (pending.delete(id)) reject(new Error(`${method} 超时`)) }, 30000)
  })
  const close = () => new Promise((r) => {
    if (proc.exitCode !== null) return r()
    if (WIN) execFile('taskkill', ['/pid', String(proc.pid), '/T', '/F'], () => r())
    else { proc.kill('SIGKILL'); setTimeout(r, 500) }
  })
  return { cdp, close }
}

let web = null
let webLog = ''
let chrome = null

try {
  await new Promise((r) => llm.listen(0, '127.0.0.1', r))
  env.DEEPSEEK_BASE_URL = `http://127.0.0.1:${llm.address().port}`

  // ① 打包、装进全新的 DSH
  fs.mkdirSync(path.join(tmp, 'cli'), { recursive: true })
  const pack = run('npm', ['pack', '--pack-destination', tmp], { cwd: ROOT })
  const tgz = fs.readdirSync(tmp).find((f) => f.endsWith('.tgz'))
  if (!check('打包', pack.code === 0 && tgz, pack.out.slice(-800))) throw new Error('打包失败')
  fs.writeFileSync(path.join(tmp, 'cli', 'package.json'), '{"private":true}')
  const inst = run('npm', ['i', `@deepseek-ai/dsh@${DSH_SPEC}`, 'pnpm@11', `--registry=${REGISTRY}`, '--no-audit', '--no-fund', '--loglevel=error'], { cwd: path.join(tmp, 'cli') })
  if (!check(`装 DSH ${DSH_SPEC}`, inst.code === 0, inst.out.slice(-800))) throw new Error('DSH 没装上')
  const cliDir = path.join(tmp, 'cli', 'node_modules', '@deepseek-ai', 'dsh')
  env.PATH = `${path.join(tmp, 'cli', 'node_modules', '.bin')}${path.delimiter}${env.PATH}`
  console.log(`  （DSH ${JSON.parse(fs.readFileSync(path.join(cliDir, 'package.json'), 'utf8')).version}）`)
  const add = run(process.execPath, [path.join(cliDir, 'lib', 'bin.js'), 'plugin', '--profile', 'web', 'add', path.join(tmp, tgz)], { cwd: tmp })
  if (!check('DSH 装上插件', add.code === 0, add.out.slice(-800))) throw new Error('插件没装上')
  console.log(`  （预览版说明：${seedWelcome(cliDir)}）`)
  const work = path.join(tmp, 'work')
  fs.mkdirSync(work, { recursive: true })
  const url = await new Promise((resolve) => {
    web = spawn(process.execPath, [path.join(cliDir, 'lib', 'bin.js'), 'web', '--no-open', '--port', '0', '--host', '127.0.0.1'], { env, cwd: work, stdio: ['ignore', 'pipe', 'pipe'] })
    const on = (d) => { webLog = (webLog + d).slice(-50000); const m = /dsh web: (http:\/\/\S+)/.exec(webLog); if (m) resolve(m[1]) }
    web.stdout.on('data', on)
    web.stderr.on('data', on)
    web.on('exit', () => resolve(null))
    setTimeout(() => resolve(null), 180_000)
  })
  if (!check('DSH 网页版起来了', url, webLog.slice(-1500))) throw new Error('网页版没起来')

  const bin = chromeBin()
  if (!check('找到 Chrome', bin)) throw new Error('没有 Chrome')
  chrome = launchChrome(bin)
  const { targetId } = await chrome.cdp('Target.createTarget', { url })
  const { sessionId } = await chrome.cdp('Target.attachToTarget', { targetId, flatten: true })
  if (DARK) await chrome.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] }, sessionId)
  const page = async (expression) => {
    const r = await chrome.cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId)
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
    return r.result.value
  }
  const until = async (expression, ms = 60000, every = 500) => {
    const end = Date.now() + ms
    let v = null
    while (Date.now() < end) {
      try { v = await page(expression) } catch { v = null }
      if (v) return v
      await sleep(every)
    }
    return v
  }
  const shot = async (name) => {
    const { data } = await chrome.cdp('Page.captureScreenshot', { format: 'png' }, sessionId)
    fs.writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from(data, 'base64'))
  }
  const composer = '[contenteditable="true"], textarea'
  if (!check('界面加载出输入框', await until(`!!document.querySelector('${composer}')`, 120000))) throw new Error('没有输入框')
  const CONTINUE = `[...document.querySelectorAll('button, [role="button"]')].find((x) => /^\\s*(继续|continue)\\s*$/i.test(x.textContent || ''))`
  const dismiss = async (ms) => {
    if (!(await until(`!!${CONTINUE}`, ms))) return
    for (let i = 0; i < 5 && await page(`!!${CONTINUE}`).catch(() => false); i++) {
      await page(`${CONTINUE}.click()`).catch(() => {})
      await sleep(800 + i * 700)
    }
  }
  await dismiss(8000)
  // DSH 自己有深浅色设置（不一定跟系统）：要的和它现在的不一样，就直接改 body 上的标记（插件和 DSH 的样式看的都是它）
  const DARK_ATTR = 'document.body.hasAttribute("data-ds-dark-theme")'
  if (await page(DARK_ATTR) !== DARK) await page(`document.body.toggleAttribute('data-ds-dark-theme', ${DARK}), true`)
  const say = async (text) => {
    await page(`(() => { const el = document.querySelector('${composer}'); el.focus(); return true })()`)
    await chrome.cdp('Input.insertText', { text }, sessionId)
    await sleep(300)
    for (const type of ['keyDown', 'keyUp']) await chrome.cdp('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, ...(type === 'keyDown' ? { text: '\r' } : {}) }, sessionId)
  }

  // ② 参数流出来时：「正在写页面…」卡片
  await say('MAKE-PAGE 帮我对比一下三款手机，做成一页给我看，带个「只看 5000 元以下」的筛选')
  const writing = await until(`(() => { const c = document.querySelector('.dsp-card[aria-busy]'); return c && /KB/.test(c.innerText) && c.innerText })()`, 60000, 150)
  check('参数流出来时，对话里先出「正在写页面…」卡片', writing, `模型请求 ${JSON.stringify(llmLog.slice(-2))}`)
  if (writing) await shot('1-writing')

  // ③ 回合结束：工具组折起来了，页面直接嵌在回复正下方，高度跟着内容
  const INLINE = `[...document.querySelectorAll('.dsp-tail .dsp-inline iframe.dsp-frame')].pop()`
  const inline = await until(`(() => { const f = ${INLINE}; return f && f.getBoundingClientRect().height > 50 && f.getAttribute('src') })()`, 60000)
  check('回合结束后，页面直接嵌在回复正下方', inline, (await page('document.body.innerText.slice(-600)').catch((e) => e.message)))
  const folded = await page(`!document.querySelector('.dsp-card[aria-busy]')`)
  check('生成中的骨架卡片不再留着', folded)
  check('模型拿到的结果里有页面地址和 page_id', /\/dsh-pages\/page\?id=.+&v=1/.test(pageResult) && pageId, pageResult)
  check('模型拿到了体检结果', /体检/.test(pageResult), pageResult)
  const dshDark = await page(DARK_ATTR)
  check(`页面地址带着 DSH 当前的深浅色（${dshDark ? 'dark' : 'light'}）`, inline && inline.endsWith(`&theme=${dshDark ? 'dark' : 'light'}`), inline)
  const fit = await until(`(() => { const f = ${INLINE}; const h = Math.round(f.getBoundingClientRect().height); return h !== 420 && h > 100 && h })()`, 20000)
  check('嵌着的页面高度跟着内容（不是写死的）', fit, String(fit))
  const probe = inline && await page(`fetch(${JSON.stringify(inline)}, { credentials: 'same-origin' }).then(async (r) => ({ status: r.status, csp: r.headers.get('content-security-policy') || '', len: (await r.text()).length }))`)
  check('页面地址能取到、回应头带沙箱', probe && probe.status === 200 && /^sandbox allow-scripts/.test(probe.csp) && probe.len > 500, JSON.stringify(probe))
  const sameOrigin = await page(`(() => { const f = ${INLINE}; try { return !!f.contentDocument } catch { return false } })()`)
  check('嵌着的页面碰不到 DSH（不同源）', !sameOrigin)
  await sleep(2000)
  await shot(`2-inline-${dshDark ? 'dark' : 'light'}`)

  // DSH 换深浅色 → 页面跟着换：示例页面深色时多 40px，高度变了就是换过去了
  if (!OWN_HTML) {
    const h0 = Math.round(await page(`${INLINE}.getBoundingClientRect().height`))
    const attr = 'document.body.hasAttribute("data-ds-dark-theme")'
    const before = await page(attr)
    await chrome.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: DARK ? 'light' : 'dark' }] }, sessionId)
    // DSH 不是「跟随系统」时，直接改 body 上的标记（插件看的就是它）
    if (!(await until(`${attr} !== ${before}`, 3000))) await page(`document.body.toggleAttribute('data-ds-dark-theme'), true`)
    const want = dshDark ? h0 - 40 : h0 + 40
    const h1 = await until(`(() => { const h = Math.round(${INLINE}.getBoundingClientRect().height); return Math.abs(h - ${want}) <= 2 && h })()`, 10000)
    check('DSH 换深浅色，嵌着的页面跟着换（不重载）', h1, `${h0} → ${await page(`Math.round(${INLINE}.getBoundingClientRect().height)`)}`)
    await sleep(800)
    await shot(`2b-inline-${dshDark ? 'light' : 'dark'}`)
    await chrome.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: DARK ? 'dark' : 'light' }] }, sessionId)
    if (await page(attr) !== before) await page(`document.body.toggleAttribute('data-ds-dark-theme'), true`)
    await until(`Math.abs(Math.round(${INLINE}.getBoundingClientRect().height) - ${h0}) <= 2`, 5000)
  }

  // ④ 点「在右侧打开」→ 右侧栏整页
  const OPEN_RIGHT = `[...[...document.querySelectorAll('.dsp-tail .dsp-inline')].pop().querySelectorAll('.dsp-ihead button')].pop()`
  await page(`${OPEN_RIGHT}.click()`)
  const full = await until(`(() => { const f = document.querySelector('iframe.dsp-full'); return f && f.getAttribute('src') })()`, 30000)
  const idOf = (u) => (/[?&]id=([^&]+)/.exec(u || '') || [])[1]
  check('点「在右侧打开」→ 右侧栏载这一页', full && idOf(full) === idOf(inline) && /&v=1/.test(full), `${full} / ${inline}`)
  const tabTitle = await page(`document.querySelector('.dsp-tabbar b')?.textContent || ''`)
  check('右侧栏顶上是页面标题', tabTitle === PAGE.title, tabTitle)
  await sleep(2000)
  await shot('3-sidebar')

  // ⑤ 带 page_id 改一次 → v2
  await say('MAKE-V2 按价格从低到高排一下')
  const v2 = await until(`(() => { const all = document.querySelectorAll('.dsp-tail .dsp-inline'); const last = all[all.length - 1]; const ver = last && last.querySelector('.dsp-ver'); return all.length >= 2 && ver && ver.textContent })()`, 60000)
  check('改页面 → 对话里出 v2', v2 === 'v2', String(v2))
  check('v2 嵌着的页面地址是第 2 版', /&v=2&/.test(await page(`${INLINE}.getAttribute('src')`)))
  await page(`${OPEN_RIGHT}.click()`)
  const vers = await until(`(() => { const v = document.querySelector('.dsp-vers'); return v && /v2 \\/ 2/.test(v.textContent) && v.textContent })()`, 15000)
  check('右侧栏能看到 v2 / 2', vers, String(vers))
  await page(`document.querySelector('.dsp-vers button').click()`)
  const back = await until(`(() => { const f = document.querySelector('iframe.dsp-full'); return f && /&v=1/.test(f.getAttribute('src')) && f.getAttribute('src') })()`, 10000)
  check('右侧栏点「上一版」→ 载第 1 版', back, String(back))
  await sleep(1500)
  await shot('4-versions')

  // ⑥ 导出
  const BTN = (re) => `[...document.querySelectorAll('.dsp-tab .dsp-btn')].find((b) => ${re}.test(b.textContent))`
  for (const [label, re] of [['HTML', '/HTML/'], ['PNG', '/PNG/']]) {
    await page(`${BTN('/导出|Export/')}.click()`)
    await until(`!!document.querySelector('.dsp-menu')`, 5000)
    await page(`${BTN(re)}.click()`)
    const saved = await until(`(() => { const n = document.querySelector('.dsp-note'); return n && !/正在导出|Exporting/.test(n.textContent) && n.textContent })()`, 30000)
    const files = fs.existsSync(path.join(HOME, 'Downloads')) ? fs.readdirSync(path.join(HOME, 'Downloads')) : []
    check(`导出 ${label} → 存进「下载」`, saved && /已存到|Saved/.test(saved) && files.some((f) => f.toLowerCase().endsWith('.' + label.toLowerCase())), `${saved} / ${files.join(',')}`)
  }
  await shot('5-export')

  // 全部页面：一页（改过两版），有缩略图
  await page(`${BTN('/全部页面|All pages/')}.click()`)
  const items = await until(`(() => { const g = document.querySelectorAll('.dsp-gitem'); return g.length && [g.length, !!g[0].querySelector('img'), g[0].textContent] })()`, 15000)
  check('「全部页面」里有这一页，带缩略图', items && items[0] === 1 && items[1] && /2/.test(items[2]), JSON.stringify(items))
  await sleep(1200)
  await shot('6-gallery')

  // ⑦ 页面里的 localStorage：对话里勾上筛选 → 存进 DSH → 重开 DSH 还勾着
  // 沙箱里的页面多半在单独的进程里（不在主页面的框架树上）：按地址找到那个 iframe 目标，接上去算
  const frameEval = async (urlPart, expression) => {
    const { targetInfos } = await chrome.cdp('Target.getTargets')
    const t = targetInfos.find((x) => x.type === 'iframe' && x.url.includes(urlPart))
    if (t) {
      const { sessionId: s2 } = await chrome.cdp('Target.attachToTarget', { targetId: t.targetId, flatten: true })
      try {
        const r = await chrome.cdp('Runtime.evaluate', { expression, returnByValue: true }, s2)
        return r.result && r.result.value
      } finally {
        chrome.cdp('Target.detachFromTarget', { sessionId: s2 }).catch(() => {})
      }
    }
    const { frameTree } = await chrome.cdp('Page.getFrameTree', {}, sessionId)
    const all = []
    ;(function walk(n) { all.push(n.frame); (n.childFrames || []).forEach(walk) })(frameTree)
    const f = all.find((x) => x.url.includes(urlPart))
    if (!f) return undefined
    const { executionContextId } = await chrome.cdp('Page.createIsolatedWorld', { frameId: f.id, worldName: 'e2e' }, sessionId)
    const r = await chrome.cdp('Runtime.evaluate', { expression, contextId: executionContextId, returnByValue: true }, sessionId)
    return r.result && r.result.value
  }
  const V2 = `id=${pageId}&v=2&theme=`
  let clicked
  for (let i = 0; i < 10 && clicked !== true; i++) {
    clicked = await frameEval(V2, `(() => { const c = document.getElementById('cheap'); if (!c) return 'none'; c.click(); return c.checked })()`).catch((e) => e.message)
    if (clicked !== true) await sleep(300)
  }
  const stateFile = path.join(HOME, '.dsh', 'dsh-pages', 'pages', pageId, 'state.json')
  let stored = null
  for (let i = 0; i < 20 && !stored; i++) {
    await sleep(250)
    try { stored = JSON.parse(fs.readFileSync(stateFile, 'utf8')) } catch { stored = null }
  }
  check('页面里勾上筛选 → 存进 DSH', clicked === true && stored && stored.cheap === '1', `${clicked} / ${JSON.stringify(stored)}`)
  await chrome.cdp('Page.reload', {}, sessionId)
  await sleep(1500)
  const kept = await until(`(() => { const f = [...document.querySelectorAll('.dsp-tail .dsp-inline iframe.dsp-frame')].pop(); return !!(f && f.getBoundingClientRect().height > 50) })()`, 60000)
  let still
  for (let i = 0; i < 20 && still !== true; i++) {
    still = kept ? await frameEval(V2, `document.getElementById('cheap') && document.getElementById('cheap').checked`).catch(() => undefined) : undefined
    if (still !== true) await sleep(300)
  }
  check('重开 DSH，页面里还勾着（localStorage 按页面存着）', still === true, `${kept} / ${still}`)

  // ⑦b 同一页同时开在对话里和右侧栏：右侧栏里取消勾选 → 对话里那份（页面没听 storage 事件）鼠标一移进去就重载成新的
  // 两个框地址一样：在每个框里量 innerWidth，和外面量的框宽对上，分出哪个是哪个
  const frameEvalAll = async (urlPart, expression) => {
    const { targetInfos } = await chrome.cdp('Target.getTargets')
    const out = []
    for (const t of targetInfos.filter((x) => x.type === 'iframe' && x.url.includes(urlPart))) {
      const { sessionId: s2 } = await chrome.cdp('Target.attachToTarget', { targetId: t.targetId, flatten: true })
      try {
        const r = await chrome.cdp('Runtime.evaluate', { expression: `[innerWidth, ${expression}]`, returnByValue: true }, s2)
        if (r.result && r.result.value) out.push(r.result.value)
      } finally {
        chrome.cdp('Target.detachFromTarget', { sessionId: s2 }).catch(() => {})
      }
    }
    return out
  }
  await page(`${OPEN_RIGHT}.click()`)
  const widths = await until(`(() => { const f = document.querySelector('iframe.dsp-full'); const i = [...document.querySelectorAll('.dsp-tail .dsp-inline iframe.dsp-frame')].pop(); if (!f || !i || f.getBoundingClientRect().height < 200) return false; return [Math.round(i.getBoundingClientRect().width), Math.round(f.getBoundingClientRect().width)] })()`, 15000)
  await sleep(1500)
  const pick = async (w, expression) => {
    for (let i = 0; i < 20; i++) {
      const hit = (await frameEvalAll(V2, expression).catch(() => [])).find((x) => Math.abs(x[0] - w) <= 2)
      if (hit) return hit[1]
      await sleep(300)
    }
    return undefined
  }
  let synced = false, sideOff, inlineBefore, inlineAfter
  if (widths && widths[0] !== widths[1]) {
    sideOff = await pick(widths[1], `(() => { const c = document.getElementById('cheap'); c.click(); return c.checked })()`)
    await sleep(800)
    inlineBefore = await pick(widths[0], `document.getElementById('cheap').checked`)
    await pick(widths[0], `(document.dispatchEvent(new Event('pointerover')), true)`)
    for (let i = 0; i < 20 && inlineAfter !== false; i++) {
      await sleep(300)
      inlineAfter = await pick(widths[0], `document.getElementById('cheap') && document.getElementById('cheap').checked`)
    }
    let st = null
    try { st = JSON.parse(fs.readFileSync(stateFile, 'utf8')) } catch {}
    synced = sideOff === false && inlineAfter === false && st && st.cheap === '0'
  }
  await shot('6b-two-views')
  check('对话里和右侧栏同时开着：右侧改了，对话里那份一回去就是新的', synced, `${JSON.stringify(widths)} / 右侧 ${sideOff} / 对话里 ${inlineBefore} → ${inlineAfter}`)

  // ⑧ 手机宽度：对话里的页面不撑出横向滚动，标题栏按钮都在屏幕里，「在右侧打开」能看到整页
  await chrome.cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true }, sessionId)
  await sleep(1500)
  // 手机上右侧栏盖满整屏：先收起来回到对话
  await page(`document.querySelector('[aria-label="收起右侧边栏"], [aria-label="Collapse right sidebar"]')?.click(), true`)
  await sleep(1200)
  await shot('7a-phone')
  const phone = await page(`(() => {
    const box = [...document.querySelectorAll('.dsp-tail .dsp-inline')].pop()
    if (!box) return { box: false }
    box.scrollIntoView({ block: 'start' })
    const r = box.getBoundingClientRect()
    const btns = [...box.querySelectorAll('.dsp-ihead button')].map((b) => Math.round(b.getBoundingClientRect().right))
    const hit = document.elementFromPoint(r.left + r.width / 2, Math.min(r.top + 80, innerHeight - 10))
    return { box: true, seen: !!(hit && box.contains(hit)), left: Math.round(r.left), right: Math.round(r.right), btns, page: document.documentElement.scrollWidth }
  })()`)
  await sleep(800)
  await shot('7b-phone-inline')
  check('手机宽度：嵌着的页面和按钮都在屏幕里', phone.box && phone.seen && phone.left >= 0 && phone.right <= 390 && phone.btns.every((x) => x <= 390) && phone.page <= 392, JSON.stringify(phone))
  await page(`${OPEN_RIGHT}.click()`)
  const phoneFull = await until(`(() => { const f = document.querySelector('iframe.dsp-full'); if (!f) return false; const r = f.getBoundingClientRect(); return r.width > 300 && r.height > 300 && r.left >= -1 && r.right <= 391 && [Math.round(r.width), Math.round(r.height)] })()`, 10000)
  await sleep(1200)
  await shot('7c-phone-open')
  check('手机宽度：「在右侧打开」能看到整页', phoneFull, JSON.stringify(phoneFull))

  // ⑨ 「我的页面」里删掉：点两下才删，挪进回收站
  await chrome.cdp('Emulation.clearDeviceMetricsOverride', {}, sessionId)
  await sleep(800)
  await page(`${BTN('/全部页面|All pages/')}.click()`)
  await until(`!!document.querySelector('.dsp-gdel')`, 10000)
  await page(`document.querySelector('.dsp-gdel').click()`)
  const armed = await until(`(() => { const b = document.querySelector('.dsp-gdel.arm'); return b && b.textContent })()`, 3000, 100)
  await page(`document.querySelector('.dsp-gdel').click()`)
  const gone = await until(`!document.querySelector('.dsp-gitem')`, 5000)
  const trashed = fs.existsSync(path.join(HOME, '.dsh', 'dsh-pages', 'trash')) && fs.readdirSync(path.join(HOME, '.dsh', 'dsh-pages', 'trash')).some((n) => n.endsWith(pageId))
  check('「我的页面」点两下删掉，页面挪进回收站', armed && gone && trashed, `${armed} / ${gone} / ${trashed}`)

  // ⑩ 套模板：模型只给 template + data，插件排成页面，照样嵌在对话里、体检
  const oldId = pageId
  await say('MAKE-TPL 做个搬家清单')
  const tplSrc = await until(`(() => { const f = ${INLINE}; const s = f && f.getAttribute('src'); return s && !s.includes('${oldId}') && f.getBoundingClientRect().height > 100 && s })()`, 60000)
  await sleep(800)
  await shot('9-template')
  check('套模板：对话里嵌出清单页', tplSrc, String(tplSrc))
  check('套模板：模型拿到的结果里说了用的哪个模板、体检没问题', /用的清单模板/.test(pageResult) && /体检：没发现问题/.test(pageResult), pageResult)
  const tplHtml = tplSrc ? await page(`fetch(${JSON.stringify(tplSrc)}).then((r) => r.text())`) : ''
  check('套模板：页面是插件排的（带模板标记和勾选框）', /content="checklist"/.test(tplHtml) && /class="todo"/.test(tplHtml), tplHtml.slice(0, 300))

  const errs = webLog.split('\n').filter((l) => /dsh-pages/i.test(l) && /error|fail|失败/i.test(l))
  check('DSH 日志里没有插件报错', !errs.length, errs.slice(0, 5).join('\n'))
} catch (e) {
  check('没有异常', false, (e && e.stack) || e)
} finally {
  if (failed().length) console.log(`\n—— DSH 日志（最后 3000 字）——\n${webLog.slice(-3000)}`)
  if (chrome) await chrome.close()
  if (web) {
    if (WIN) execFile('taskkill', ['/pid', String(web.pid), '/T', '/F'], () => {})
    else web.kill('SIGTERM')
  }
  llm.close()
  console.log(`\n${results.length - failed().length}/${results.length} 通过；截图在 ${SHOTS}${KEEP ? `；临时目录 ${tmp}` : ''}`)
  if (!KEEP) {
    await sleep(1500)
    if (!SHOTS.startsWith(tmp)) fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3 })
  }
  process.exit(failed().length ? 1 : 0)
}
