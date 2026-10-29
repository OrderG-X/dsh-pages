/**
 * 服务端测试（不用开 DSH）：node --test test/test-server.mjs
 *
 * 假 ctx 装插件，真起一个 HTTP 服务打路由：show_page 存页面、地址认得出、
 * 回应头把页面关进沙箱、要登录态、乱 id / 跨站 / 别的方法都拒；版本、深浅色脚本、
 * 「我的页面」/ 导出接口。HOME 指到临时目录，不开无头浏览器（体检另有 test-check.mjs）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsp-test-'))
process.env.HOME = process.env.USERPROFILE = tmp
process.env.DSH_PAGES_CHECK = '0'

const { apply, ROUTE, API, TOOL, CSP, dataDir, wrapPage, safeName } = await import(new URL('../lib/index.js', import.meta.url))
const { injectRuntime } = await import(new URL('../lib/runtime.js', import.meta.url))

const routes = new Map()
const tools = new Map()
let conn = null
let port = 0
apply({
  effect: (fn) => fn(),
  webServer: {
    register: (r) => { routes.set(r.path, r.handler); return () => {} },
    getOrigin: () => `http://127.0.0.1:${port}`,
  },
  tools: { register: (t) => tools.set(t.name, t) },
  get: (name) => (name === 'connection' ? conn : undefined),
})

const server = http.createServer((req, res) => {
  const fn = routes.get(new URL(req.url, 'http://x').pathname)
  if (fn) return fn(req, res)
  res.writeHead(404)
  res.end()
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
port = server.address().port
test.after(() => { server.close(); fs.rmSync(tmp, { recursive: true, force: true }) })

function get(p, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port, path: p, method, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }))
    })
    req.end(body)
  })
}
const post = (p, data, headers = { 'content-type': 'application/json' }) => get(p, { method: 'POST', headers, body: JSON.stringify(data) })

const tool = tools.get(TOOL)

test('注册了工具和路由', () => {
  assert.ok(tool)
  assert.ok(routes.has(ROUTE))
  for (const k of ['list', 'meta', 'thumb', 'export', 'reveal', 'delete', 'state']) assert.ok(routes.has(API + k), k)
  assert.deepEqual(tool.parameters.required, ['title'])
  assert.deepEqual(tool.parameters.properties.template.enum, ['report', 'compare', 'checklist', 'dashboard', 'timeline', 'flashcards', 'quiz', 'flow'])
  assert.equal(tool.parameters.properties.data.type, 'object')
  assert.ok(tool.parameters.properties.page_id)
  assert.deepEqual(tool.parameters.properties.display.enum, ['inline', 'card'])
})

test('show_page 存页面，结果最后一行是页面地址', async () => {
  const out = await tool.execute({ title: '三款手机对比', html: '<!doctype html><html><body><h1>对比</h1></body></html>' })
  assert.match(out.id, /^[a-z0-9]+-[a-f0-9]{8}$/)
  assert.equal(out.v, 1)
  assert.equal(out.display, 'inline')
  assert.equal(out.text.split('\n').pop(), `${ROUTE}?id=${out.id}&v=1`)
  assert.match(out.text, /三款手机对比/)
  assert.match(out.text, new RegExp(`page_id: ${out.id}`))
  assert.ok(fs.existsSync(path.join(dataDir(), out.id, 'v1.html')))
  const meta = JSON.parse(fs.readFileSync(path.join(dataDir(), out.id, 'meta.json'), 'utf8'))
  assert.equal(meta.title, '三款手机对比')
  assert.equal(meta.versions.length, 1)
  const r = await get(`${ROUTE}?id=${out.id}`)
  assert.equal(r.status, 200)
  assert.match(r.headers['content-type'], /text\/html/)
  assert.equal(r.headers['content-security-policy'], CSP)
  assert.match(r.headers['content-security-policy'], /^sandbox allow-scripts/)
  assert.match(r.headers['content-security-policy'], /connect-src 'none'/)
  assert.equal(r.headers['x-content-type-options'], 'nosniff')
  assert.match(r.body, /<h1>对比<\/h1>/)
  // 深浅色 / 高度脚本塞在页面自己的东西前面
  assert.match(r.body, /^<!doctype html><script>/)
  assert.ok(r.body.indexOf('__dsp') < r.body.indexOf('<h1>'))
  const hd = await get(`${ROUTE}?id=${out.id}`, { method: 'HEAD' })
  assert.equal(hd.status, 200)
  assert.equal(hd.body, '')
})

test('只给了一段 HTML 时套上外壳，标题转义', () => {
  const page = wrapPage('<a&b>', '<p>hi</p>')
  assert.match(page, /^<!doctype html>/)
  assert.match(page, /<title>&lt;a&amp;b&gt;<\/title>/)
  assert.match(page, /<body><p>hi<\/p><\/body>/)
  assert.match(page, /data-theme=dark/) // 外壳自带深色变量
  assert.equal(wrapPage('x', '<!DOCTYPE html><p>x</p>'), '<!DOCTYPE html><p>x</p>')
})

test('空页面、太大的页面报错', async () => {
  await assert.rejects(tool.execute({ title: 'a', html: '   ' }), /要么传 template \+ data 套模板，要么传 html/)
  await assert.rejects(tool.execute({ title: 'a', html: 'x'.repeat(2 * 1024 * 1024 + 1) }), /太大/)
})

test('乱 id、不存在的页面给 404，不碰别的文件', async () => {
  fs.writeFileSync(path.join(tmp, 'secret.html'), 'top secret')
  for (const id of ['../../secret', '..%2F..%2Fsecret', 'abc', 'zzzzzzzz-00000000']) {
    const r = await get(`${ROUTE}?id=${id}`)
    assert.equal(r.status, 404, id)
    assert.doesNotMatch(r.body, /top secret/)
  }
})

test('把门：跨站、外来 Host、别的方法都拒', async () => {
  const { id } = await tool.execute({ title: 'a', html: '<p>a</p>' })
  assert.equal((await get(`${ROUTE}?id=${id}`, { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403)
  assert.equal((await get(`${ROUTE}?id=${id}`, { headers: { host: 'evil.example' } })).status, 403)
  assert.equal((await get(`${ROUTE}?id=${id}`, { headers: { origin: 'http://evil.example' } })).status, 403)
  assert.equal((await get(`${ROUTE}?id=${id}`, { method: 'POST' })).status, 405)
})

test('有 DSH 登录服务时听它的', async () => {
  const { id } = await tool.execute({ title: 'a', html: '<p>a</p>' })
  conn = { requestRejection: (req) => (String(req.headers.cookie || '').includes('dsh-auth') ? 0 : 401) }
  try {
    assert.equal((await get(`${ROUTE}?id=${id}`)).status, 401)
    assert.equal((await get(`${ROUTE}?id=${id}`, { headers: { cookie: 'dsh-auth-x=1' } })).status, 200)
  } finally {
    conn = null
  }
})

test('带 page_id 改页面：存成新版本，旧版本还在', async () => {
  const a = await tool.execute({ title: '计划', html: '<p>第一版</p>' })
  const b = await tool.execute({ title: '计划（改）', html: '<p>第二版</p>', page_id: a.id, display: 'card' })
  assert.equal(b.id, a.id)
  assert.equal(b.v, 2)
  assert.match(b.text, /第 2 版/)
  assert.equal(b.text.split('\n').pop(), `${ROUTE}?id=${a.id}&v=2`)
  assert.match((await get(`${ROUTE}?id=${a.id}&v=1`)).body, /第一版/)
  assert.match((await get(`${ROUTE}?id=${a.id}&v=2`)).body, /第二版/)
  assert.match((await get(`${ROUTE}?id=${a.id}`)).body, /第二版/) // 不带 v 是最新一版
  assert.equal((await get(`${ROUTE}?id=${a.id}&v=3`)).status, 404)
  const meta = JSON.parse((await get(`${API}meta?id=${a.id}`)).body)
  assert.deepEqual(meta.versions.map((x) => [x.v, x.title]), [[1, '计划'], [2, '计划（改）']])
  assert.equal(meta.display, 'card')
  // 同时改两次：版本号不抢
  const [c, d] = await Promise.all([
    tool.execute({ title: '计划', html: '<p>3</p>', page_id: a.id }),
    tool.execute({ title: '计划', html: '<p>4</p>', page_id: a.id }),
  ])
  assert.deepEqual([c.v, d.v].sort(), [3, 4])
  await assert.rejects(tool.execute({ title: 'x', html: '<p>x</p>', page_id: 'zzzzzzzz-00000000' }), /找不到 page_id/)
  await assert.rejects(tool.execute({ title: 'x', html: '<p>x</p>', page_id: '../etc' }), /page_id/)
})

test('原型留下的平铺页面：照样能看，改它时搬进文件夹', async () => {
  const id = 'mh00aaaa-0123abcd'
  fs.mkdirSync(dataDir(), { recursive: true })
  fs.writeFileSync(path.join(dataDir(), id + '.html'), '<!doctype html><html><head></head><body>老页面</body></html>')
  fs.writeFileSync(path.join(dataDir(), id + '.json'), JSON.stringify({ id, title: '老的', created: '2026-10-28T00:00:00.000Z' }))
  const r = await get(`${ROUTE}?id=${id}`)
  assert.equal(r.status, 200)
  assert.match(r.body, /老页面/)
  assert.match(r.body, /^<!doctype html><script>/)
  const b = await tool.execute({ title: '老的', html: '<p>新的</p>', page_id: id })
  assert.equal(b.v, 2)
  assert.match((await get(`${ROUTE}?id=${id}&v=1`)).body, /老页面/)
  assert.match((await get(`${ROUTE}?id=${id}&v=2`)).body, /新的/)
})

test('深浅色：地址上的 theme 进脚本，乱写的不认', async () => {
  const { id } = await tool.execute({ title: 'a', html: '<p>a</p>' })
  assert.match((await get(`${ROUTE}?id=${id}&theme=dark`)).body, /setTheme\('dark'\)/)
  assert.match((await get(`${ROUTE}?id=${id}&theme=light`)).body, /setTheme\('light'\)/)
  const evil = (await get(`${ROUTE}?id=${id}&theme=${encodeURIComponent("');alert(1);('")}`)).body
  assert.match(evil, /setTheme\(''\)/)
  assert.doesNotMatch(evil, /alert\(1\)/)
})

test('脚本塞的位置：文档最前面（doctype 后面），注释里写的 <head> 骗不了它', () => {
  const tag = (s) => s.replace(/<script>[\s\S]*?<\/script>/, '<S>')
  assert.equal(tag(injectRuntime('<!doctype html><html lang="zh"><head><title>x</title></head></html>', '')), '<!doctype html><S><html lang="zh"><head><title>x</title></head></html>')
  assert.equal(tag(injectRuntime('<!DOCTYPE html><header>x</header>', '')), '<!DOCTYPE html><S><header>x</header>')
  assert.equal(tag(injectRuntime('<p>x</p>', '')), '<S><p>x</p>')
  assert.equal(tag(injectRuntime('\ufeff <!-- 例子 <head> --><!doctype html><head></head>', '')), '\ufeff <!-- 例子 <head> --><!doctype html><S><head></head>')
  assert.equal(tag(injectRuntime('<!doctype html><!-- <head> --><html><head>', '')), '<!doctype html><S><!-- <head> --><html><head>')
  // 没收尾的注释：放在注释前面，不被吞掉
  assert.equal(tag(injectRuntime('<!-- 没写完 <p>x</p>', '')), '<S><!-- 没写完 <p>x</p>')
})

test('存成文件：带下载头，不带注入的脚本', async () => {
  const { id } = await tool.execute({ title: '下载 测试', html: '<p>d</p>' })
  const r = await get(`${ROUTE}?id=${id}&download=1`)
  assert.equal(r.status, 200)
  assert.match(r.headers['content-disposition'], /attachment/)
  assert.match(r.headers['content-disposition'], /filename\*=UTF-8''%E4%B8%8B%E8%BD%BD-%E6%B5%8B%E8%AF%95\.html/)
  assert.doesNotMatch(r.body, /__dsp/)
})

test('我的页面：最近改过的在前；缩略图没有就 404', async () => {
  const a = await tool.execute({ title: '先做的', html: '<p>1</p>' })
  await new Promise((r) => setTimeout(r, 5))
  const b = await tool.execute({ title: '后做的', html: '<p>2</p>' })
  const { pages } = JSON.parse((await get(`${API}list`)).body)
  assert.equal(pages[0].id, b.id)
  assert.ok(pages.some((p) => p.id === a.id))
  assert.equal(pages[0].thumb, false)
  assert.equal((await get(`${API}thumb?id=${b.id}&v=1`)).status, 404)
  assert.equal((await get(`${API}thumb?id=../x&v=1`)).status, 404)
  assert.equal((await get(`${API}meta?id=zzzzzzzz-00000000`)).status, 404)
})

test('导出 HTML 存进「下载」，只能在文件夹里显示导出过的文件', async () => {
  const { id } = await tool.execute({ title: '导出', html: '<p>e</p>' })
  const r = await post(`${API}export`, { id, format: 'html' })
  assert.equal(r.status, 200)
  const { path: file } = JSON.parse(r.body)
  assert.equal(path.dirname(file), path.join(tmp, 'Downloads'))
  assert.match(fs.readFileSync(file, 'utf8'), /<p>e<\/p>/)
  const again = JSON.parse((await post(`${API}export`, { id, format: 'html' })).body)
  assert.notEqual(again.path, file) // 同名不覆盖
  assert.equal((await post(`${API}export`, { id, format: 'exe' })).status, 400)
  assert.equal((await post(`${API}export`, { id: 'zzzzzzzz-00000000', format: 'html' })).status, 404)
  // 没有浏览器时 PNG / PDF 说清楚
  assert.match(JSON.parse((await post(`${API}export`, { id, format: 'png' })).body).error, /HTML/)
  assert.equal((await post(`${API}reveal`, { path: path.join(tmp, 'secret.html') })).status, 404)
  // 不是 JSON 的 POST、跨站的 POST 都拒
  assert.equal((await post(`${API}export`, { id, format: 'html' }, { 'content-type': 'text/plain' })).status, 403)
  assert.equal((await post(`${API}export`, { id, format: 'html' }, { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' })).status, 403)
  assert.equal((await get(`${API}export`)).status, 405)
})

test('删页面：整页挪进回收站，之后看不到了；要同源 JSON', async () => {
  const { id } = await tool.execute({ title: '要删的', html: '<p>x</p>' })
  await tool.execute({ title: '要删的 v2', html: '<p>y</p>', page_id: id })
  // 跨站表单发不了 JSON；乱 id 不碰文件
  assert.equal((await post(`${API}delete`, { id }, { 'content-type': 'text/plain' })).status, 403)
  assert.equal((await post(`${API}delete`, { id: '../pages' })).status, 404)
  assert.equal((await post(`${API}delete`, { id })).status, 200)
  assert.equal(fs.existsSync(path.join(dataDir(), id)), false)
  const trash = fs.readdirSync(path.join(path.dirname(dataDir()), 'trash'))
  const moved = trash.find((n) => n.endsWith('-' + id))
  assert.ok(moved, trash.join(','))
  assert.ok(fs.existsSync(path.join(path.dirname(dataDir()), 'trash', moved, 'v2.html')))
  assert.equal((await get(`${ROUTE}?id=${id}`)).status, 404)
  assert.ok(!JSON.parse((await get(`${API}list`)).body).pages.some((p) => p.id === id))
  assert.equal((await post(`${API}delete`, { id })).status, 404)
})

test('页面存的 localStorage：只认字符串、有上限、要同源 JSON；送页面时带上', async () => {
  const { id } = await tool.execute({ title: '存', html: '<p>x</p>' })
  assert.equal((await post(`${API}state`, { id, ops: { set: { a: '1' } } }, { 'content-type': 'text/plain' })).status, 403)
  assert.equal((await post(`${API}state`, { id: 'zzzzzzzz-00000000', ops: {} })).status, 404)
  assert.equal((await post(`${API}state`, { id, ops: [1] })).status, 400)
  assert.equal((await post(`${API}state`, { id, ops: { set: { big: 'x'.repeat(1100 * 1024) } } })).status, 413)
  assert.equal((await post(`${API}state`, { id, ops: { set: { a: '<b>', n: 2 } } })).status, 200)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dataDir(), id, 'state.json'), 'utf8')), { a: '<b>' })
  // 发的是改动：两个窗口各改各的键，谁也不抹掉谁
  assert.equal((await post(`${API}state`, { id, ops: { set: { left: 'A' } } })).status, 200)
  assert.equal((await post(`${API}state`, { id, ops: { set: { right: 'B' }, del: ['a'] } })).status, 200)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dataDir(), id, 'state.json'), 'utf8')), { left: 'A', right: 'B' })
  assert.equal((await post(`${API}state`, { id, ops: { clear: true, set: { only: '1' } } })).status, 200)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dataDir(), id, 'state.json'), 'utf8')), { only: '1' })
  assert.equal((await post(`${API}state`, { id, ops: { set: { a: '<b>' } } })).status, 200)
  const page = (await get(`${ROUTE}?id=${id}`)).body
  assert.ok(page.includes('"a":"\\u003cb>"'), page.slice(0, 300))
  // 存成文件的不带脚本，也就不带存的东西
  assert.ok(!(await get(`${ROUTE}?id=${id}&download=1`)).body.includes('u003cb'))
})

test('导出的文件名：各国文字都留着，Windows 保留名改掉；同时导出两次不会写到同一个文件', async () => {
  assert.equal(safeName('三款手机 对比/v2'), '三款手机-对比-v2')
  assert.equal(safeName('हिन्दी पेज'), 'हिन्दी-पेज')
  assert.equal(safeName('CON'), 'page-CON')
  assert.equal(safeName(' ../../etc '), 'etc')
  assert.equal(safeName(''), 'page')
  const { id } = await tool.execute({ title: '同名\n导出', html: '<p>x</p>' })
  const [a, b] = await Promise.all([post(`${API}export`, { id, format: 'html' }), post(`${API}export`, { id, format: 'html' })])
  assert.equal(a.status, 200)
  assert.equal(b.status, 200)
  const pa = JSON.parse(a.body).path
  const pb = JSON.parse(b.body).path
  assert.notEqual(pa, pb)
  assert.ok(path.basename(pa).startsWith('同名-导出'))
})

test('坏掉的 meta：不拖垮列表；版本号不是正整数的不认（拼不出目录外的路径）', async () => {
  const { id: good } = await tool.execute({ title: '好的', html: '<p>x</p>' })
  const { id: bad } = await tool.execute({ title: '坏的', html: '<p>x</p>' })
  const metaFile = path.join(dataDir(), bad, 'meta.json')
  const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'))
  fs.writeFileSync(metaFile, JSON.stringify({ ...meta, versions: [null, { v: '/../../../../outside' }, { v: -1 }, { v: 1.5 }] }))
  const list = JSON.parse((await get(`${API}list`)).body).pages
  assert.ok(list.some((p) => p.id === good))
  assert.ok(!list.some((p) => p.id === bad))
  assert.equal((await get(`${ROUTE}?id=${bad}`)).status, 404)
  await assert.rejects(tool.execute({ title: '再改', html: '<p>y</p>', page_id: bad }), /找不到/)
  // 好的版本还在、坏的跳过
  fs.writeFileSync(metaFile, JSON.stringify({ ...meta, versions: [{ v: '/../x' }, meta.versions[0], meta.versions[0]] }))
  const r = await tool.execute({ title: '再改', html: '<p>y</p>', page_id: bad })
  assert.equal(r.v, 2)
  assert.deepEqual(JSON.parse(fs.readFileSync(metaFile, 'utf8')).versions.map((x) => x.v), [1, 2])
})

test('别的进程同时改同一页：版本不会互相覆盖（跨进程的锁）', async () => {
  const { id } = await tool.execute({ title: '抢', html: '<p>v1</p>' })
  const { fork } = await import('node:child_process')
  const kid = path.join(tmp, 'kid.mjs')
  fs.writeFileSync(kid, `process.env.HOME = process.env.USERPROFILE = ${JSON.stringify(tmp)}
const { saveVersion } = await import(${JSON.stringify(new URL('../lib/store.js', import.meta.url).href)})
const r = await saveVersion({ pageId: process.argv[2], title: 't', html: '<p>' + process.argv[3] + '</p>', display: 'inline' })
process.send(r.v)`)
  const vs = await Promise.all(Array.from({ length: 6 }, (_, i) => new Promise((resolve, reject) => {
    const c = fork(kid, [id, 'k' + i], { stdio: 'ignore' })
    c.on('message', resolve)
    c.on('error', reject)
    c.on('exit', (code) => { if (code) reject(new Error('exit ' + code)) })
  })))
  assert.deepEqual([...vs].sort((a, b) => a - b), [2, 3, 4, 5, 6, 7])
  const meta = JSON.parse(fs.readFileSync(path.join(dataDir(), id, 'meta.json'), 'utf8'))
  assert.deepEqual(meta.versions.map((x) => x.v), [1, 2, 3, 4, 5, 6, 7])
  const bodies = new Set(meta.versions.slice(1).map((x) => fs.readFileSync(path.join(dataDir(), id, `v${x.v}.html`), 'utf8')))
  assert.equal(bodies.size, 6)
})
