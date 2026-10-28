/**
 * 体检 / 导出 / 页面里的小脚本，用真的无头浏览器跑：node --test test/test-check.mjs
 * 这台电脑上没有 Chrome / Edge / Chromium 就整个跳过。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsp-check-'))
process.env.HOME = process.env.USERPROFILE = tmp
delete process.env.DSH_PAGES_CHECK

const { apply, ROUTE, API, TOOL } = await import(new URL('../lib/index.js', import.meta.url))
const { findBrowser, createBrowser } = await import(new URL('../lib/browser.js', import.meta.url))
const skip = findBrowser() ? false : '没找到浏览器'

const routes = new Map()
const tools = new Map()
const disposers = []
let port = 0
apply({
  effect: (fn) => { const d = fn(); if (typeof d === 'function') disposers.push(d) },
  webServer: {
    register: (r) => { routes.set(r.path, r.handler); return () => {} },
    getOrigin: () => `http://127.0.0.1:${port}`,
  },
  tools: { register: (t) => tools.set(t.name, t) },
  get: () => undefined,
})
let landed = 0
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x')
  // 页面想跳去的本机地址：体检时不该有人来
  if (u.pathname === '/landing') { landed++; res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<p>landing</p>') }
  // 像对话那样把页面嵌进 iframe，记下页面发出来的消息
  if (u.pathname === '/parent') {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    return res.end(`<script>window.msgs = []; addEventListener('message', (e) => msgs.push(e.data))</script><iframe sandbox="allow-scripts" src="${ROUTE}?id=${u.searchParams.get('id')}&theme=light"></iframe>`)
  }
  const fn = routes.get(u.pathname)
  if (fn) return fn(req, res)
  res.writeHead(404)
  res.end()
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
port = server.address().port
const browser = createBrowser()
test.after(() => {
  browser.destroy()
  for (const d of disposers) d()
  server.close()
  fs.rmSync(tmp, { recursive: true, force: true })
})

const tool = tools.get(TOOL)
const post = (p, data) => new Promise((resolve) => {
  const req = http.request({ host: '127.0.0.1', port, path: p, method: 'POST', headers: { host: `127.0.0.1:${port}`, 'content-type': 'application/json' } }, (res) => {
    const chunks = []
    res.on('data', (c) => chunks.push(c))
    res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }))
  })
  req.end(JSON.stringify(data))
})

const GOOD = `<!doctype html><html><head><meta charset="utf-8"><style>
:root{--bg:#fff;--fg:#222}:root[data-theme="dark"]{--bg:#16171a;--fg:#eee}
body{margin:0;padding:20px;background:var(--bg);color:var(--fg);font:16px system-ui}
</style></head><body><h1>好页面</h1><p>${'内容 '.repeat(40)}</p></body></html>`

const BAD = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#fff}</style></head><body>
<h1>坏页面</h1><table style="width:900px"><tr><td>很宽的表</td></tr></table>
<script>undefinedThing.boom()</script></body></html>`

test('好页面：体检没问题，存了缩略图', { skip }, async () => {
  const out = await tool.execute({ title: '好页面', html: GOOD })
  assert.match(out.text, /体检：没发现问题/)
  const meta = JSON.parse(fs.readFileSync(path.join(tmp, '.dsh', 'dsh-pages', 'pages', out.id, 'meta.json'), 'utf8'))
  assert.equal(meta.versions[0].check.ok, true)
  assert.equal(meta.versions[0].thumb, true)
  const jpg = fs.readFileSync(path.join(tmp, '.dsh', 'dsh-pages', 'pages', out.id, 'v1.jpg'))
  assert.equal(jpg.readUInt16BE(0), 0xffd8)
  const dark = fs.readFileSync(path.join(tmp, '.dsh', 'dsh-pages', 'pages', out.id, 'v1-dark.jpg'))
  assert.equal(dark.readUInt16BE(0), 0xffd8)
  assert.notDeepEqual(dark, jpg)
})

test('坏页面：报错、溢出、深色没适配都说出来', { skip }, async () => {
  const out = await tool.execute({ title: '坏页面', html: BAD })
  assert.match(out.text, /体检发现/)
  assert.match(out.text, /页面报错：.*undefinedThing/)
  assert.match(out.text, /对话宽度（720px）下横向溢出：table/)
  assert.match(out.text, /手机宽度（390px）下横向溢出/)
  assert.match(out.text, /深色模式下背景还是浅色/)
  assert.match(out.text, /同一个 page_id/)
  // 最后一行还是页面地址
  assert.match(out.text.split('\n').pop(), new RegExp(`^${ROUTE}\\?id=${out.id}&v=1&h=\\d+$`))
})

test('嵌进对话的高度：量出来放在结果最后一行；100vh 加边距越撑越长的会说出来', { skip }, async () => {
  const short = await tool.execute({ title: '短', html: GOOD })
  const h = Number(out(short).match(/&h=(\d+)$/)[1])
  // 字体不同（CI 机器上）折行不同，只看量的是内容、不是 420 的视口
  assert.ok(h > 120 && h < 400, '短页面按内容高度：' + h)
  const tall = await tool.execute({ title: '长', html: GOOD.replace('</p>', '</p>' + '<p>一行</p>'.repeat(40)) })
  assert.ok(Number(out(tall).match(/&h=(\d+)$/)[1]) > 1000)
  const runaway = await tool.execute({ title: '跟着窗口长', html: '<!doctype html><html><head><style>:root[data-theme=dark]{background:#111}body{margin:0;padding:16px}.app{min-height:100vh}</style></head><body><div class="app">x</div></body></html>' })
  assert.match(runaway.text, /越撑越长/)
  // 只是 min-height:100vh、没加边距的：能停下来，不算问题
  const fill = await tool.execute({ title: '撑满', html: '<!doctype html><html><head><style>:root[data-theme=dark]{background:#111}body{margin:0;min-height:100vh;display:grid;place-items:center}</style></head><body><p>居中</p></body></html>' })
  assert.doesNotMatch(fill.text, /越撑越长/)
})
const out = (r) => r.text.split('\n').pop()

test('被沙箱拦下的说清楚怎么改；同一个错只记一次', { skip }, async () => {
  const html = `<!doctype html><html><head><style>:root[data-theme=dark]{background:#111}</style></head><body><p>${'字'.repeat(20)}</p>
<script>fetch('https://api.example.com/x').catch(() => {}); for (let i = 0; i < 5; i++) console.error('同一个错')</script></body></html>`
  const r = await tool.execute({ title: '拦下', html })
  assert.match(r.text, /connect-src.*数据直接写进页面/)
  assert.equal(r.text.split('同一个错').length, 2)
})

test('空白页', { skip }, async () => {
  const out = await tool.execute({ title: '空', html: '<!doctype html><html><body><div></div></body></html>' })
  assert.match(out.text, /空白/)
})

test('页面里的小脚本：DSH 选深色时 prefers-color-scheme 也跟着变', { skip }, async () => {
  const html = '<!doctype html><html><head><style>body{background:rgb(255,255,255)}@media (prefers-color-scheme: dark){body{background:rgb(0,0,0)}}</style></head><body>x</body></html>'
  const { id } = await tool.execute({ title: 'mq', html })
  const bg = 'getComputedStyle(document.body).backgroundColor'
  // 无头浏览器模拟的系统是浅色
  const r = await browser.withPage({ url: `http://127.0.0.1:${port}${ROUTE}?id=${id}&theme=dark`, w: 400, h: 300 }, async (page) => {
    const dark = await page.eval(bg)
    await page.eval("__dsp.setTheme('light')")
    const light = await page.eval(bg)
    const attrs = await page.eval("[document.documentElement.dataset.theme, document.documentElement.classList.contains('dark'), document.documentElement.style.colorScheme].join(',')")
    // 后加进来的样式也照改
    await page.eval("__dsp.setTheme('dark'); const s = document.createElement('style'); s.textContent = '@media (prefers-color-scheme: dark){p{color:rgb(1,2,3)}}'; document.head.appendChild(s); const p = document.createElement('p'); document.body.appendChild(p); new Promise((r) => setTimeout(r, 100))")
    const later = await page.eval("getComputedStyle(document.querySelector('p')).color")
    return { dark, light, attrs, later }
  })
  assert.equal(r.dark, 'rgb(0, 0, 0)')
  assert.equal(r.light, 'rgb(255, 255, 255)')
  assert.equal(r.attrs, 'light,false,light')
  assert.equal(r.later, 'rgb(1, 2, 3)')
})

test('页面里能用 localStorage（按页面存进 DSH）、sessionStorage、cookie；不报 SecurityError', { skip }, async () => {
  const html = `<!doctype html><html><head><style>:root[data-theme=dark]{background:#111}</style><script>
const n = Number(localStorage.getItem('n') || 0) + 1
localStorage.setItem('n', String(n))
localStorage.extra = 'via-prop'
sessionStorage.setItem('s', '1')
document.cookie = 'c=1'
window.seen = { n, keys: Object.keys(localStorage).sort().join(','), len: localStorage.length, s: sessionStorage.getItem('s'), cookie: document.cookie, idb: typeof indexedDB }
</script></head><body><p>${'字'.repeat(20)}</p></body></html>`
  const r = await tool.execute({ title: '存东西', html })
  assert.match(r.text, /体检：没发现问题/)
  const load = () => browser.withPage({ url: `http://127.0.0.1:${port}${ROUTE}?id=${r.id}&theme=light`, w: 400, h: 300 }, (page) => page.eval('JSON.stringify([window.seen, window.__dsp.errors, window.pwn, localStorage.getItem("n")])').then(JSON.parse))
  const [seen, errors] = await load()
  assert.deepEqual(errors, [])
  assert.deepEqual(seen, { n: 1, keys: 'extra,n', len: 2, s: '1', cookie: '', idb: 'undefined' })
  // 存过的东西下次打开带上（各版本共用）
  assert.equal((await post(`${API}state`, { id: r.id, ops: { set: { n: '5' } } })).status, 200)
  await tool.execute({ title: '存东西 v2', html, page_id: r.id })
  assert.equal((await load())[0].n, 6)
  // 存的东西里有 </script> 也跳不出去
  const evil = '</script><script>window.pwn = 1</script>'
  assert.equal((await post(`${API}state`, { id: r.id, ops: { set: { n: evil } } })).status, 200)
  const [, errs2, pwn, n2] = await load()
  assert.equal(pwn, null)
  assert.equal(n2, 'NaN')
  assert.deepEqual(errs2, [])
})

test('体检时页面自己跳走：拦下、不去那个地址，说给模型听；量的还是这一页', { skip }, async () => {
  const html = `<!doctype html><html><head><style>:root[data-theme=dark]{background:#111}</style></head><body><h1>${'字'.repeat(10)}</h1>
<script>setTimeout(() => { location.href = 'http://127.0.0.1:${port}/landing' }, 50)</script></body></html>`
  const r = await tool.execute({ title: '跳走', html })
  assert.equal(landed, 0)
  assert.match(r.text, /自己跳到别的地址.*landing/)
  assert.doesNotMatch(r.text, /空白/)
})

test('注释里写着 <head>：小脚本照样装上，页面报错照样查出来', { skip }, async () => {
  const html = `<!-- 例子：<head> 放这里 --><!doctype html><html><head><style>:root[data-theme=dark]{background:#111}</style></head><body><p>${'字'.repeat(20)}</p><script>throw new Error('故意的错')</script></body></html>`
  const r = await tool.execute({ title: '注释', html })
  assert.match(r.text, /页面报错：.*故意的错/)
})

test('别处的图片载不进来（不然能把数据拼进图片地址发出去），提示怎么改', { skip }, async () => {
  const html = `<!doctype html><html><head><style>:root[data-theme=dark]{background:#111}</style></head><body><p>${'字'.repeat(20)}</p><img src="https://example.com/x.png?d=secret"></body></html>`
  const r = await tool.execute({ title: '外图', html })
  assert.match(r.text, /img-src.*SVG/)
})

test('载进来的不是这一页（找不到 / 口令不对）：不记体检结果、不存缩略图', { skip }, async () => {
  const { checkPage } = await import(new URL('../lib/check.js', import.meta.url))
  await assert.rejects(checkPage(browser, `http://127.0.0.1:${port}${ROUTE}?id=zzzzzzzz-00000000&theme=light`), /page not served/)
})

test('页面改了 localStorage：马上把「改了什么」发给外面（不是整份、不等）', { skip }, async () => {
  const html = `<!doctype html><html><head><script>
localStorage.setItem('a', '1'); localStorage.setItem('b', '2'); localStorage.removeItem('a')
setTimeout(() => { localStorage.clear(); localStorage.c = '3' }, 30)
</script></head><body><p>x</p></body></html>`
  const { id } = await tool.execute({ title: '发改动', html })
  const msgs = await browser.withPage({ url: `http://127.0.0.1:${port}/parent?id=${id}`, w: 400, h: 300 }, (page) => page.eval(`new Promise((r) => setTimeout(r, 300)).then(() => JSON.stringify(msgs.filter((m) => m && m.type === 'dsp-state')))`).then(JSON.parse))
  assert.deepEqual(msgs.map((m) => m.ops), [
    { clear: false, set: { b: '2' }, del: ['a'] },
    { clear: true, set: { c: '3' }, del: [] },
  ])
})

test('同一页别处改了：页面听 storage 事件就发给它；存一样的值不往外发', { skip }, async () => {
  const html = `<!doctype html><html><head><script>
addEventListener('storage', (e) => parent.postMessage({ type: 't-storage', key: e.key, oldValue: e.oldValue, newValue: e.newValue }, '*'))
localStorage.setItem('a', '1')
setTimeout(() => localStorage.setItem('a', '1'), 10)
</script></head><body><p>x</p></body></html>`
  const { id } = await tool.execute({ title: '听同步', html })
  const msgs = await browser.withPage({ url: `http://127.0.0.1:${port}/parent?id=${id}`, w: 400, h: 300 }, (page) => page.eval(`new Promise((r) => setTimeout(r, 200)).then(() => {
    document.querySelector('iframe').contentWindow.postMessage({ type: 'dsp-state-sync', ops: { clear: false, set: { a: '2', b: '3' }, del: [] } }, '*')
    return new Promise((r) => setTimeout(r, 200))
  }).then(() => JSON.stringify(msgs.filter((m) => m && /^(dsp-state|dsp-reload|t-storage)$/.test(m.type))))`).then(JSON.parse))
  assert.deepEqual(msgs, [
    { type: 'dsp-state', ops: { clear: false, set: { a: '1' }, del: [] } },
    { type: 't-storage', key: 'a', oldValue: '1', newValue: '2' },
    { type: 't-storage', key: 'b', oldValue: null, newValue: '3' },
  ])
})

test('同一页别处改了、页面不听 storage：这一框的旧数据不再往外发，用户一回来就请外面重载', { skip }, async () => {
  const html = `<!doctype html><html><head><script>
localStorage.setItem('a', '1')
addEventListener('message', (e) => { if (e.data && e.data.type === 'dsp-state-sync') setTimeout(() => { localStorage.setItem('a', 'stale'); document.dispatchEvent(new Event('pointerover')); document.dispatchEvent(new Event('pointerover')) }, 20) })
</script></head><body><p>x</p></body></html>`
  const { id } = await tool.execute({ title: '不听同步', html })
  const msgs = await browser.withPage({ url: `http://127.0.0.1:${port}/parent?id=${id}`, w: 400, h: 300 }, (page) => page.eval(`new Promise((r) => setTimeout(r, 200)).then(() => {
    document.querySelector('iframe').contentWindow.postMessage({ type: 'dsp-state-sync', ops: { clear: false, set: { a: '2' }, del: [] } }, '*')
    return new Promise((r) => setTimeout(r, 200))
  }).then(() => JSON.stringify(msgs.filter((m) => m && /^(dsp-state|dsp-reload)$/.test(m.type))))`).then(JSON.parse))
  assert.deepEqual(msgs, [
    { type: 'dsp-state', ops: { clear: false, set: { a: '1' }, del: [] } },
    { type: 'dsp-reload' },
  ])
})

test('storage 事件：storageArea 就是 localStorage、清空是 key=null；监听撤掉了就当没人听，回来要重载', { skip }, async () => {
  const html = `<!doctype html><html><head><script>
const f = (e) => parent.postMessage({ type: 't-storage', key: e.key, area: e.storageArea === localStorage, oldValue: e.oldValue, newValue: e.newValue }, '*')
addEventListener('storage', f)
localStorage.setItem('a', '1')
addEventListener('message', (e) => {
  if (e.data && e.data.type === 't-off') removeEventListener('storage', f)
  if (e.data && e.data.type === 't-poke') document.dispatchEvent(new Event('pointerover'))
})
</script></head><body><p>x</p></body></html>`
  const { id } = await tool.execute({ title: '撤监听', html })
  const msgs = await browser.withPage({ url: `http://127.0.0.1:${port}/parent?id=${id}`, w: 400, h: 300 }, (page) => page.eval(`new Promise((r) => setTimeout(r, 200)).then(() => {
    const w = document.querySelector('iframe').contentWindow
    const wait = (ms) => new Promise((r) => setTimeout(r, ms))
    w.postMessage({ type: 'dsp-state-sync', ops: { clear: true, set: { b: '2' }, del: [] } }, '*')
    return wait(100).then(() => { w.postMessage({ type: 't-off' }, '*'); return wait(50) })
      .then(() => { w.postMessage({ type: 'dsp-state-sync', ops: { clear: false, set: { c: '3' }, del: [] } }, '*'); return wait(50) })
      .then(() => { w.postMessage({ type: 't-poke' }, '*'); return wait(150) })
  }).then(() => JSON.stringify(msgs.filter((m) => m && /^(t-storage|dsp-reload)$/.test(m.type))))`).then(JSON.parse))
  assert.deepEqual(msgs, [
    { type: 't-storage', key: null, area: true, oldValue: null, newValue: null },
    { type: 't-storage', key: 'b', area: true, oldValue: null, newValue: '2' },
    { type: 'dsp-reload' },
  ])
})

test('旧了的一框：用户按的第一下先拦下（页面不处理、不丢），请外面重载', { skip }, async () => {
  const html = `<!doctype html><html><head><script>
let keys = 0
addEventListener('keydown', () => { keys++; localStorage.setItem('k', String(keys)) })
localStorage.setItem('a', '1')
addEventListener('message', (e) => {
  if (e.data && e.data.type === 't-key') {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'x' }))
    parent.postMessage({ type: 't-keys', n: keys }, '*')
  }
})
</script></head><body><p>x</p></body></html>`
  const { id } = await tool.execute({ title: '拦按键', html })
  const msgs = await browser.withPage({ url: `http://127.0.0.1:${port}/parent?id=${id}`, w: 400, h: 300 }, (page) => page.eval(`new Promise((r) => setTimeout(r, 200)).then(() => {
    const w = document.querySelector('iframe').contentWindow
    w.postMessage({ type: 'dsp-state-sync', ops: { clear: false, set: { a: '2' }, del: [] } }, '*')
    return new Promise((r) => setTimeout(r, 50)).then(() => { w.postMessage({ type: 't-key' }, '*'); return new Promise((r) => setTimeout(r, 150)) })
  }).then(() => JSON.stringify(msgs.filter((m) => m && /^(dsp-state|dsp-reload|t-keys)$/.test(m.type))))`).then(JSON.parse))
  assert.deepEqual(msgs, [
    { type: 'dsp-state', ops: { clear: false, set: { a: '1' }, del: [] } },
    { type: 'dsp-reload' },
    { type: 't-keys', n: 0 },
  ])
})

test('导出 PNG / PDF', { skip }, async () => {
  const { id } = await tool.execute({ title: '导出图', html: GOOD })
  const png = await post(`${API}export`, { id, format: 'png' })
  assert.equal(png.status, 200)
  const buf = fs.readFileSync(png.body.path)
  assert.equal(buf.readUInt32BE(0), 0x89504e47)
  assert.equal(buf.readUInt32BE(16), 2048) // 1024 宽、2 倍
  const pdf = await post(`${API}export`, { id, format: 'pdf' })
  assert.equal(pdf.status, 200)
  assert.equal(fs.readFileSync(pdf.body.path).subarray(0, 5).toString(), '%PDF-')
})
