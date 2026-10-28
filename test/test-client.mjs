/**
 * 客户端测试（不用开 DSH）：node --test test/test-client.mjs
 *
 * 假的 __ModuleLoader__ / react / ctx 把 lib/client.js 跑一遍：四处都注册上；
 * 卡片在生成中 / 写好 / 出错时画对东西；回复下方默认直接嵌页面、card 是缩略图；
 * 点一下按 id + 版本打开右侧栏；右侧栏没参数是「我的页面」，有参数载那一页。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const src = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

const react = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat() }),
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: () => {},
  useRef: (v = null) => ({ current: v }),
}
let mod
globalThis.window = { __ModuleLoader__: { load: ({ factory }) => { mod = factory((name) => (name === 'react' ? react : null)) } } }
new Function(src)()

const regs = []
const opened = []
const tabTypes = []
const turnDefs = []
const ctx = {
  uiConversation: { events: { register: (d) => { turnDefs.push(d); return () => {} } } },
  slots: {
    inject: (_name, fn) => fn(),
    register: (opts, render) => { regs.push({ opts, render }); return () => {} },
  },
  locale: { register: () => () => {}, t: (k) => k },
  sidebarRight: { openTab: (kind, opts) => opened.push({ kind, opts }) },
  sidebarRightTabs: { register: (d) => { tabTypes.push(d); return () => {} } },
  effect: (fn) => fn(),
}
mod.apply(ctx)

/** 把 createElement 记下的树展开：函数组件就地调用 */
function expand(node) {
  if (node == null || typeof node !== 'object') return node
  if (Array.isArray(node)) return node.map(expand)
  if (typeof node.type === 'function') return expand(node.type({ ...node.props, children: node.children }))
  return { ...node, children: node.children.map(expand) }
}
function texts(node, out = []) {
  if (node == null) return out
  if (typeof node === 'string' || typeof node === 'number') out.push(String(node))
  else if (Array.isArray(node)) node.forEach((n) => texts(n, out))
  else if (typeof node === 'object') node.children && node.children.forEach((n) => texts(n, out))
  return out
}
function find(node, pred) {
  if (node == null || typeof node !== 'object') return null
  if (Array.isArray(node)) { for (const n of node) { const f = find(n, pred); if (f) return f } return null }
  if (pred(node)) return node
  return find(node.children, pred)
}

const card = regs.find((r) => r.opts.name === 'tool.call.toolview')
const tail = regs.find((r) => r.opts.name === 'conversation.chat.turnTail')
const tab = regs.find((r) => r.opts.name === 'sidebar.right.pane.tab')
const reader = (o) => ({ text: (k) => o[k], complete: () => true })
const ID = 'mh8x2k1a-0a1b2c3d'

test('四处都注册上', () => {
  assert.ok(tail)
  assert.equal(turnDefs.length, 1)
  assert.equal(card.opts.key, 'show_page')
  assert.equal(tab.opts.key, '@orderg-x/dsh-pages')
  assert.equal(tabTypes[0].kind, 'dsh-pages-view')
  assert.equal(tabTypes[0].id, tab.opts.key)
  assert.equal(tabTypes[0].guide[0].id, 'gallery')
})

test('生成中：标题 + 已写多少，没有缩略图', () => {
  const block = { phase: 'preparing', name: 'show_page', args: reader({ title: '三款手机对比', html: 'x'.repeat(3000) }) }
  const tree = expand(card.render({ phase: 'preparing', block, callId: 'c1', toolName: 'show_page' }))
  const s = texts(tree).join(' ')
  assert.match(s, /三款手机对比/)
  assert.match(s, /2\.9 KB/)
  assert.equal(find(tree, (n) => n.type === 'iframe'), null)
})

test('参数还是半截 JSON 时不抛错', () => {
  const block = { phase: 'start', name: 'show_page', argsRaw: '{"title":"半截', args: { text: () => { throw new Error('boom') } } }
  const tree = expand(card.render({ phase: 'start', block }))
  assert.match(texts(tree).join(' '), /writing|正在写/)
})

test('写好了：工具组里缩成一行，点一下在右侧打开', () => {
  const block = {
    kind: 'tool-result',
    call: { name: 'show_page', argsRaw: JSON.stringify({ title: '三款手机对比', html: '<p>x</p>' }) },
    content: [{ type: 'text', text: `已显示页面「三款手机对比」\npage_id: ${ID}\n/dsh-pages/page?id=${ID}&v=2` }],
    isError: false,
  }
  const tree = expand(card.render({ phase: 'result', block }))
  assert.equal(tree.type, 'button')
  assert.equal(find(tree, (n) => n.type === 'iframe'), null)
  assert.match(texts(tree).join(''), /三款手机对比 · v2/)
  tree.props.onClick()
  assert.deepEqual(opened.pop(), { kind: 'dsh-pages-view', opts: { params: { id: ID, v: 2, title: '三款手机对比' } } })
  // 原型的结果没有版本号：当最新版
  const old = expand(card.render({ phase: 'result', block: { ...block, content: [{ type: 'text', text: `x\n/dsh-pages/page?id=${ID}` }] } }))
  old.props.onClick()
  assert.deepEqual(opened.pop().opts.params, { id: ID, v: 0, title: '三款手机对比' })
})

/** 照 DSH 的事件流跑一遍按回合收集的定义 */
function runTurn(events) {
  const def = turnDefs[0]
  let state
  for (const event of events) {
    const m = def.match(event)
    if (!m) continue
    state = m.role === 'start' ? def.start({}, { event }) : def.update({ state }, { event })
  }
  return def.buildLocationData({ state }, 'turn', undefined)
}
const call = (callId, name, args) => ({ type: 'tool/call', seq: 2, data: { turn: 1, callId, name, arguments: JSON.stringify(args) } })
const result = (callId, text, extra = {}) => ({ type: 'tool/result', seq: 3, surfaceOp: 'append', data: { turn: 1, message: { source: { callId }, content: [{ type: 'text', text }], isError: false, ...extra } } })

test('按回合收集：只收 show_page 成功的结果，替换进来的副本不重复', () => {
  const loc = runTurn([
    { type: 'turn/start', seq: 1, data: { turn: 1 } },
    call('a', 'show_page', { title: '对比', html: '<p>x</p>' }),
    call('b', 'bash', { command: 'echo /dsh-pages/page?id=zzzzzzzz-00000000' }),
    result('b', '/dsh-pages/page?id=zzzzzzzz-00000000'),
    result('a', `已显示\n/dsh-pages/page?id=${ID}&v=1`),
    { ...result('a', `已显示\n/dsh-pages/page?id=${ID}&v=1`), surfaceOp: 'replace' },
    call('c', 'show_page', { title: '坏的', html: '' }),
    result('c', 'html 不能为空', { isError: true }),
  ])
  assert.equal(loc.key, 'dsh-pages-turn')
  assert.deepEqual(loc.value.pages.map((p) => [p.id, p.v, p.title, p.display]), [[ID, 1, '对比', 'inline']])
})

test('同一回合改了同一页几次：只留最后一版', () => {
  const loc = runTurn([
    { type: 'turn/start', seq: 1, data: { turn: 1 } },
    call('a', 'show_page', { title: '对比', html: '<p>x</p>' }),
    result('a', `/dsh-pages/page?id=${ID}&v=1`),
    call('b', 'show_page', { title: '对比（修好）', html: '<p>y</p>', page_id: ID, display: 'card' }),
    result('b', `/dsh-pages/page?id=${ID}&v=2`),
  ])
  assert.deepEqual(loc.value.pages.map((p) => [p.v, p.title, p.display]), [[2, '对比（修好）', 'card']])
})

test('回复下方：默认把页面直接嵌在对话里，带深浅色', () => {
  const loc = runTurn([
    { type: 'turn/start', seq: 1, data: { turn: 1 } },
    call('a', 'show_page', { title: '计算器', html: '<p>x</p>' }),
    result('a', `已显示\n/dsh-pages/page?id=${ID}&v=1`),
  ])
  const turn = { data: new Map([[loc.key, loc.value]]), end: { seq: 9 } }
  const tree = expand(tail.render({ turn, seq: 9, t: (k) => k, open: (id, v, title) => opened.push({ id, v, title }) }))
  const frame = find(tree, (n) => n.type === 'iframe')
  assert.equal(frame.props.className, 'dsp-frame')
  assert.equal(frame.props.src, `/dsh-pages/page?id=${ID}&v=1&theme=light`)
  assert.match(frame.props.sandbox, /allow-scripts/)
  assert.doesNotMatch(frame.props.sandbox, /allow-same-origin/)
  assert.equal(frame.props.style.height, '420px')
  assert.equal(frame.props.scrolling, 'no')
  const go = find(tree, (n) => n.type === 'button' && texts(n).join('').includes('openRight'))
  go.props.onClick()
  assert.deepEqual(opened.pop(), { id: ID, v: 1, title: '计算器' })
})

test('回复下方：体检量过高度的页面一开始就按那个高度，载好前盖着骨架', () => {
  const loc = runTurn([
    { type: 'turn/start', seq: 1, data: { turn: 1 } },
    call('a', 'show_page', { title: '计算器', html: '<p>x</p>' }),
    result('a', `已显示\n/dsh-pages/page?id=${ID}&v=3&h=636`),
  ])
  assert.equal(loc.value.pages[0].h, 636)
  const turn = { data: new Map([[loc.key, loc.value]]), end: { seq: 9 } }
  const tree = expand(tail.render({ turn, seq: 9, t: (k) => k, open: () => {} }))
  const frame = find(tree, (n) => n.type === 'iframe')
  assert.equal(frame.props.style.height, '636px')
  assert.equal(frame.props.src, `/dsh-pages/page?id=${ID}&v=3&theme=light`)
  assert.ok(find(tree, (n) => n.props && n.props.className === 'dsp-loading'))
})

test('回复下方：display 是 card 时画成缩略图卡片，点一下在右侧打开', () => {
  const loc = runTurn([
    { type: 'turn/start', seq: 1, data: { turn: 1 } },
    call('a', 'show_page', { title: '三款手机对比', html: '<p>x</p>', display: 'card' }),
    result('a', `已显示\n/dsh-pages/page?id=${ID}&v=1`),
  ])
  const turn = { data: new Map([[loc.key, loc.value]]), end: { seq: 9 } }
  const tree = expand(tail.render({ turn, seq: 9, t: (k) => k, open: (id, v, title) => opened.push({ id, v, title }) }))
  // 用体检时截好的图，不跑活页面
  assert.equal(find(tree, (n) => n.type === 'iframe'), null)
  assert.equal(find(tree, (n) => n.type === 'img').props.src, `/dsh-pages/api/thumb?id=${ID}&v=1&theme=light`)
  const cardEl = find(tree, (n) => n.props && n.props.role === 'button')
  cardEl.props.onClick()
  assert.deepEqual(opened.pop(), { id: ID, v: 1, title: '三款手机对比' })
  let prevented = false
  cardEl.props.onKeyDown({ key: 'Enter', preventDefault: () => { prevented = true } })
  assert.ok(prevented)
  opened.pop()
  // 没做页面的回合什么都不画
  assert.equal(tail.render({ turn: { data: new Map(), end: { seq: 9 } }, t: (k) => k, open: () => {} }), null)
})

test('出错时说人话', () => {
  const block = { kind: 'tool-result', call: { name: 'show_page', argsRaw: '{}' }, content: [], isError: true, error: { message: 'html 不能为空' } }
  const tree = expand(card.render({ phase: 'result', block }))
  assert.match(texts(tree).join(''), /html 不能为空/)
})

test('右侧栏：没参数时是「我的页面」，有参数时载那一页那一版', () => {
  const empty = expand(tab.render({ t: (k) => k, useTabInfo: () => ({ tab: { navigation: {} } }) }))
  assert.equal(find(empty, (n) => n.type === 'iframe'), null)
  assert.match(texts(empty).join(' '), /gallery/)
  const full = expand(tab.render({ t: (k) => k, useTabInfo: () => ({ tab: { navigation: { params: { id: ID, v: 2, title: '对比' }, revision: 2 } } }) }))
  const frame = find(full, (n) => n.type === 'iframe')
  assert.equal(frame.props.src, `/dsh-pages/page?id=${ID}&v=2&theme=light`)
  assert.equal(frame.props.className, 'dsp-full')
  assert.doesNotMatch(frame.props.sandbox, /allow-same-origin/)
  const s = texts(full).join(' ')
  assert.match(s, /对比/)
  assert.match(s, /exportBtn/)
  assert.match(s, /all/)
})

test('页面存的改动合成一份：后来的盖前面的，清空之后从头算', () => {
  const { mergeOps } = mod._test
  let o = mergeOps(null, { clear: false, set: { a: '1', b: '2' }, del: [] })
  o = mergeOps(o, { clear: false, set: { c: '3' }, del: ['a'] })
  assert.deepEqual(o, { clear: false, set: { b: '2', c: '3' }, del: ['a'] })
  o = mergeOps(o, { clear: false, set: { a: '9' }, del: [] })
  assert.deepEqual(o, { clear: false, set: { b: '2', c: '3', a: '9' }, del: [] })
  assert.deepEqual(mergeOps(o, { clear: true, set: { z: '1' }, del: [] }), { clear: true, set: { z: '1' }, del: [] })
})

test('页面地址只认结果最后一行：标题里写了别的页面地址也不会认错', () => {
  const OTHER = 'aaaaaaaa-11111111'
  const text = `已显示页面「/dsh-pages/page?id=${OTHER}&v=1」：页面直接嵌在对话里。\npage_id: ${ID}\n/dsh-pages/page?id=${ID}&v=3&h=500`
  assert.deepEqual(mod._test.pageRefOf({ content: [{ type: 'text', text }] }), { id: ID, v: 3, h: 500 })
  assert.equal(mod._test.pageRefOf({ content: [{ type: 'text', text: `/dsh-pages/page?id=${OTHER}&v=1 还有别的` }] }), null)

  // 改名前的结果（/dsh-artifacts/…）照样认，旧会话里的页面还在
  assert.deepEqual(mod._test.pageRefOf({ content: [{ type: 'text', text: `x\n/dsh-artifacts/page?id=${ID}&v=2` }] }), { id: ID, v: 2, h: 0 })
})
