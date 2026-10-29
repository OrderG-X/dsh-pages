/**
 * 模板：排版、内容校验、页面里的交互；手写的页面也套上同一套设计（真浏览器，没有 Chrome / Edge 就跳过那几项）。node --test test/test-templates.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsp-tpl-'))
process.env.HOME = process.env.USERPROFILE = tmp
delete process.env.DSH_PAGES_CHECK

const { apply, ROUTE, TOOL } = await import(new URL('../lib/index.js', import.meta.url))
const { renderTemplate, inline, block, layoutFlow, TEMPLATES } = await import(new URL('../lib/templates.js', import.meta.url))
const { findBrowser, createBrowser } = await import(new URL('../lib/browser.js', import.meta.url))
const { withDesign } = await import(new URL('../lib/design.js', import.meta.url))
const { readVersion } = await import(new URL('../lib/store.js', import.meta.url))
const { SAMPLES } = await import(new URL('./fixtures/template-samples.mjs', import.meta.url))
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
const server = http.createServer((req, res) => {
  const fn = routes.get(new URL(req.url, 'http://x').pathname)
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
const render = (name, data, title = '测试') => renderTemplate(name, data, title).html

// ── 不用浏览器 ──

test('八个模板都有示例，都排得出来：带模板标记、中文按钮', () => {
  assert.deepEqual(Object.keys(SAMPLES).sort(), [...TEMPLATES].sort())
  for (const [name, s] of Object.entries(SAMPLES)) {
    const html = render(name, s.data, s.title)
    assert.match(html, new RegExp(`<meta name="dsh-pages-template" content="${name}">`), name)
    assert.match(html, /^<!doctype html><html lang="zh">/, name)
  }
  assert.match(render('checklist', SAMPLES.checklist.data), /只看没做的/)
  assert.match(render('checklist', { items: ['Buy milk'] }, 'Groceries'), /Hide done/)
})

test('内容里的 HTML 一律转义；脚本里带的数据跳不出 <script>', () => {
  const evil = '</script><script>window.pwn=1</script><img src=x onerror=alert(1)>'
  for (const [name, data] of [
    ['report', { summary: evil, sections: [{ heading: evil, text: evil, bullets: [evil], table: { columns: [evil], rows: [[evil]] } }] }],
    ['flashcards', { cards: [{ front: evil, back: evil, hint: evil }] }],
    ['dashboard', { charts: [{ type: 'bar', title: evil, labels: [evil], series: [{ name: evil, values: [1] }] }] }],
    ['flow', { nodes: [{ id: 'a', text: evil }, { id: 'b', text: 'x' }], edges: [{ from: 'a', to: 'b', label: evil }] }],
  ]) {
    const html = render(name, data, evil)
    assert.doesNotMatch(html, /<script>window\.pwn|<img src=x/i, name)
  }
})

test('文字里的一点 Markdown', () => {
  assert.equal(inline('**粗** 和 `a<b`'), '<strong>粗</strong> 和 <code>a&lt;b</code>')
  assert.equal(inline('[文档](https://a.com/x?a=1&b=2)'), '<a href="https://a.com/x?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">文档</a>')
  assert.equal(inline('见 https://a.com'), '见 <a href="https://a.com" target="_blank" rel="noopener noreferrer">https://a.com</a>')
  assert.equal(inline('[x](javascript:alert(1))'), '[x](javascript:alert(1))')
  assert.equal(block('第一段\n接着\n\n- 一\n- 二\n1. 甲'), '<p>第一段<br>接着</p><ul><li>一</li><li>二</li></ul><ol><li>甲</li></ol>')
})

test('内容不对：说清楚哪里不对', () => {
  assert.throws(() => render('nope', {}), /没有「nope」这个模板，可选：report、compare/)
  assert.throws(() => render('compare', { items: [{ name: 'a' }] }), /对比模板：items 至少要 2 项/)
  assert.throws(() => render('dashboard', { charts: [{ type: 'bar', title: '销量', labels: ['a', 'b'], series: [{ name: 's', values: [1] }] }] }), /第 1 个图「销量」：labels 有 2 个，series「s」的 values 有 1 个/)
  assert.throws(() => render('dashboard', { charts: [{ type: 'radar', labels: ['a'], values: [1] }] }), /type 只能是 bar \/ line \/ pie/)
  assert.throws(() => render('quiz', { questions: [{ question: 'q', options: ['a', 'b'], answer: 2 }] }), /第 1 题：answer 要是正确选项的序号（从 0 开始，0 到 1）/)
  assert.throws(() => render('flow', { nodes: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], edges: [{ from: 'a', to: 'z' }] }), /第 1 条连线.*找不到「z」/)
  assert.throws(() => render('checklist', {}), /清单模板：groups（或 items）里至少要有一条事项/)
  assert.throws(() => render('report', 'not json'), /报告模板：data 要是 JSON 对象/)
})

test('宽松的写法也认：模板别名、data 给数组 / JSON 字符串、答案写字母或原文', () => {
  assert.match(render('todo', ['a', 'b']), /content="checklist"/)
  assert.match(render('flowchart', JSON.stringify({ nodes: ['开始', '结束'] })), /content="flow"/)
  const q = (answer) => /data-a="(\d+)"/.exec(render('quiz', { questions: [{ question: 'q', options: ['甲', '乙', '丙'], answer }] }))[1]
  assert.equal(q(1), '1')
  assert.equal(q('C'), '2')
  assert.equal(q('甲'), '0')
  // 饼图直接给 values
  assert.match(render('dashboard', { charts: [{ type: 'donut', title: '占比', labels: ['a', 'b'], values: ['30%', '70%'] }] }), /70%/)
})

test('对比：数越大 / 越小越好的标出最好的；各家一样的行能藏起来', () => {
  const html = render('compare', SAMPLES.compare.data)
  assert.match(html, /<span class="best">6,000 mAh<\/span>/)
  assert.match(html, /<span class="best">177 g<\/span>/)
  assert.equal((html.match(/class="best"/g) || []).length, 4) // 卡片、表格各两处
  assert.match(html, /<tr class="same"><td>系统<\/td>/)
  assert.match(html, /id="diff"/)
})

test('表格：整列是数才右对齐，表头跟着', () => {
  const html = render('report', { sections: [{ table: { columns: ['名', '钱', '备注'], rows: [['a', '¥1,200', 'x'], ['b', '30%', '12']] } }] })
  assert.match(html, /<th>名<\/th><th class="num">钱<\/th><th>备注<\/th>/)
})

test('流程图分层：顺着往下排，往回连的不算层；同层按上一层的位置排', () => {
  // 0 → 1 → 2 → 3，2 → 1 往回，0 → 3 跨层
  const e = [[0, 1], [1, 2], [2, 3], [2, 1], [0, 3]].map(([from, to]) => ({ from, to }))
  const { rank, back, rows } = layoutFlow(4, e)
  assert.deepEqual(rank, [0, 1, 2, 3])
  assert.deepEqual([...back], [3])
  assert.deepEqual(rows, [[0], [1], [2], [3]])
  // 分叉：b、c 都在第二层；d 在第三层；c 的上家在左边，排在前面
  const g = layoutFlow(5, [[0, 2], [0, 1], [1, 3], [2, 4], [3, 4]].map(([from, to]) => ({ from, to })))
  assert.deepEqual(g.rows, [[0], [1, 2], [3], [4]])
})

test('工具：传 template + data 就套模板，结果里说用了哪个；版本记下模板名；两样都没给就报错', async () => {
  const out = await tool.execute({ title: '搬家清单', template: 'checklist', data: SAMPLES.checklist.data })
  assert.match(out.text, /已显示页面「搬家清单」，用的清单模板/)
  assert.equal(out.template, 'checklist')
  const meta = JSON.parse(fs.readFileSync(path.join(tmp, '.dsh', 'dsh-pages', 'pages', out.id, 'meta.json'), 'utf8'))
  assert.equal(meta.versions[0].template, 'checklist')
  // 改成写 HTML 的新版本：不带模板名
  const v2 = await tool.execute({ title: '搬家清单', html: '<p>手写</p>', page_id: out.id })
  assert.equal(v2.template, undefined)
  await assert.rejects(tool.execute({ title: '空' }), /要么传 template \+ data 套模板，要么传 html/)
  await assert.rejects(tool.execute({ title: '坏', template: 'compare', data: { items: [] } }), /对比模板：items 至少要 2 项/)
})

// ── 真浏览器：体检、交互 ──

const open = (id, fn, w = 720) => browser.withPage({ url: `http://127.0.0.1:${port}${ROUTE}?id=${id}&theme=light`, w, h: 600 }, async (page) => {
  await page.eval('new Promise((r) => setTimeout(r, 150))')
  return fn((expr) => page.eval(expr))
})
const pages = {}
const pageOf = async (name) => {
  if (!pages[name]) pages[name] = await tool.execute({ title: SAMPLES[name].title, template: name, data: SAMPLES[name].data })
  return pages[name]
}

test('每个示例都过体检（没报错、没溢出、深色也对、手机宽度也行）', { skip }, async () => {
  for (const name of TEMPLATES) {
    const out = await pageOf(name)
    assert.match(out.text, /体检：没发现问题/, `${name}：${out.text}`)
  }
})

test('清单：点了就勾上、进度跟着走、存进 localStorage；只看没做的', { skip }, async () => {
  const { id } = await pageOf('checklist')
  const r = await open(id, async (ev) => {
    await ev("document.querySelector('.todo input').click()")
    const one = await ev("[document.querySelectorAll('.todo.done').length, document.querySelector('.prog .txt').textContent, document.querySelector('.grp .cnt').textContent, localStorage.getItem('checklist')]")
    await ev("document.getElementById('hide').click()")
    const hidden = await ev("getComputedStyle(document.querySelector('.todo.done')).display")
    // 别处（右侧栏）勾了第二条：听 storage 事件跟着变
    await ev("(() => { const ks = [...document.querySelectorAll('.todo')].slice(0, 2).map((e) => e.dataset.k); localStorage.setItem('checklist', JSON.stringify(ks)); dispatchEvent(new StorageEvent('storage', { key: 'checklist' })); return 1 })()")
    const two = await ev("document.querySelector('.prog .txt').textContent")
    return { one, hidden, two, errors: await ev('__dsp.errors') }
  })
  assert.equal(r.one[0], 1)
  assert.equal(r.one[1], '已完成 1 / 8')
  assert.equal(r.one[2], '1 / 3')
  assert.equal(JSON.parse(r.one[3]).length, 1)
  assert.equal(r.hidden, 'none')
  assert.equal(r.two, '已完成 2 / 8')
  assert.deepEqual(r.errors, [])
})

test('对比：卡片 / 表格切换，只看不同', { skip }, async () => {
  const { id } = await pageOf('compare')
  const r = await open(id, async (ev) => {
    const before = await ev("[document.querySelector('.cmp-cards').hidden, document.querySelector('.cmp-table').hidden]")
    await ev("document.querySelector('.seg [data-v=table]').click()")
    const after = await ev("[document.querySelector('.cmp-cards').hidden, document.querySelector('.cmp-table').hidden, document.querySelector('.seg [data-v=table]').getAttribute('aria-pressed')]")
    await ev("document.getElementById('diff').click()")
    const same = await ev("getComputedStyle(document.querySelector('tr.same')).display")
    return { before, after, same, errors: await ev('__dsp.errors') }
  })
  assert.deepEqual(r.before, [false, true])
  assert.deepEqual(r.after, [true, false, 'true'])
  assert.equal(r.same, 'none')
  assert.deepEqual(r.errors, [])
})

test('学习卡片：点卡片翻面；记住了跳下一张、计数；只看没记住的', { skip }, async () => {
  const { id } = await pageOf('flashcards')
  const r = await open(id, async (ev) => {
    await ev("document.getElementById('card').click()")
    const flipped = await ev("document.getElementById('card').classList.contains('flip')")
    await ev("document.getElementById('yes').click()")
    const next = await ev("[document.getElementById('pos').textContent, document.getElementById('kn').textContent, document.getElementById('f').textContent, document.getElementById('card').classList.contains('flip')]")
    await ev("document.getElementById('only').click()")
    const only = await ev("[document.getElementById('pos').textContent, document.getElementById('f').textContent]")
    return { flipped, next, only, errors: await ev('__dsp.errors') }
  })
  assert.equal(r.flipped, true)
  assert.deepEqual(r.next, ['第 2 / 5 张', '记住 1 张', 'い', false])
  assert.deepEqual(r.only, ['第 1 / 4 张', 'い'])
  assert.deepEqual(r.errors, [])
})

test('测验：点了就判，答错亮出正确答案和解释；算分；重做', { skip }, async () => {
  const { id } = await pageOf('quiz')
  const r = await open(id, async (ev) => {
    await ev("document.querySelectorAll('.q')[0].querySelectorAll('.opt')[0].click()")
    await ev("document.querySelectorAll('.q')[1].querySelectorAll('.opt')[1].click()")
    const q1 = await ev("(() => { const q = document.querySelectorAll('.q')[0]; return [q.querySelector('.opt.wrong .k').textContent, q.querySelector('.opt.right .k').textContent, q.querySelector('.res').textContent, q.querySelector('.exp').hidden, q.querySelector('.opt').disabled] })()")
    const score = await ev("[document.getElementById('sc').textContent, document.getElementById('an').textContent]")
    await ev("document.getElementById('reset').click()")
    const reset = await ev("[document.getElementById('sc').textContent, document.querySelectorAll('.q.done').length]")
    return { q1, score, reset, errors: await ev('__dsp.errors') }
  })
  assert.deepEqual(r.q1, ['A', 'B', '答错了，正确答案是 B', false, true])
  assert.deepEqual(r.score, ['1 / 3', '已答 2 / 3'])
  assert.deepEqual(r.reset, ['0 / 3', 0])
  assert.deepEqual(r.errors, [])
})

test('数据看板：三张图都画出来；鼠标移上去出提示', { skip }, async () => {
  const { id } = await pageOf('dashboard')
  const r = await open(id, async (ev) => {
    const svgs = await ev("document.querySelectorAll('.cv svg').length")
    const tip = await ev(`(() => {
      const box = document.querySelectorAll('.cv')[2], hit = [...box.querySelectorAll('svg rect')].pop(), r = hit.getBoundingClientRect()
      hit.dispatchEvent(new PointerEvent('pointermove', { clientX: r.left + 5, clientY: r.top + 20, bubbles: true }))
      return [box.querySelector('.tip').style.opacity, box.querySelector('.tip').textContent]
    })()`)
    return { svgs, tip, errors: await ev('__dsp.errors') }
  })
  assert.equal(r.svgs, 3)
  assert.equal(r.tip[0], '1')
  assert.equal(r.tip[1], '周一老页面：92新页面：118')
  assert.deepEqual(r.errors, [])
})

test('流程图：每条连线都画出来，标签放上；手机宽度也画', { skip }, async () => {
  const { id } = await pageOf('flow')
  for (const w of [720, 390]) {
    const r = await open(id, async (ev) => [await ev("document.querySelectorAll('path.e').length"), await ev("[...document.querySelectorAll('.elabel')].map((e) => e.textContent).join(',')"), await ev('__dsp.errors')], w)
    assert.deepEqual(r, [5, '否,是', []], `宽 ${w}`)
  }
})

// ── 手写的页面：带上同一套设计 ──

test('手写页面：设计塞在 <head> 最前面、只塞一次；只给一段就套成整页', () => {
  const page = '<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>h1{color:red}</style></head><body><h1>x</h1></body></html>'
  const out = withDesign(page, 't')
  assert.match(out, /^<!doctype html><html lang="zh"><head><style id="dsp-design">@layer dsp\{/)
  assert.ok(out.endsWith('<meta charset="utf-8"><style>h1{color:red}</style></head><body><h1>x</h1></body></html>'))
  assert.equal(withDesign(out, 't'), out)
  // 没有 <head>：放 <html> 后面；连 <html> 都没有：放 doctype 后面（<header> 不算 <head>）
  assert.match(withDesign('<!doctype html><html><body>x', ''), /^<!doctype html><html><style id="dsp-design">/)
  assert.match(withDesign('<!DOCTYPE html><header>x</header>', ''), /^<!DOCTYPE html><style id="dsp-design">.*<\/script><header>x<\/header>$/s)
  // 一段：套成整页，外层 .page；自己有 .page 就不再包
  const frag = withDesign('<h2>要点</h2>', '<a&b>')
  assert.match(frag, /^<!doctype html><html lang="zh"><head>.*<title>&lt;a&amp;b&gt;<\/title><style id="dsp-design">.*<\/head><body><main class="page"><h2>要点<\/h2><\/main><\/body><\/html>$/s)
  assert.match(withDesign('<div class="wrap page">hi</div>', 'Hi'), /<html lang="en">.*<body><div class="wrap page">hi<\/div><\/body>/s)
})

test('工具：写 HTML 的页面存下来带着设计；模板的不带这一份', async () => {
  const out = await tool.execute({ title: '手写', html: '<!doctype html><html><head><title>x</title></head><body><p>hi</p></body></html>' })
  const saved = (await readVersion(out.id)).html
  assert.match(saved, /^<!doctype html><html><head><style id="dsp-design">@layer dsp\{/)
  const tpl = await tool.execute({ title: '清单', template: 'checklist', data: SAMPLES.checklist.data })
  assert.doesNotMatch((await readVersion(tpl.id)).html, /dsp-design/)
})

const CALC = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>房贷</title>
<style>:root{--accent:#e11d48}button.mine{border-radius:0}h2.mine{font-size:40px}</style></head><body><main class="page">
<header class="hd"><div class="kicker">计算器</div><h1>房贷月供</h1><p class="sub">改数字马上变</p></header>
<div class="fields"><label class="field"><span>金额</span><input type="number" value="300"></label><label class="field"><span>年限</span><select><option>30</option></select></label></div>
<div class="bar"><div class="seg"><button aria-pressed="true">本息</button><button>本金</button></div><button class="primary">算</button><button class="mine">我的</button></div>
<div class="panel stats"><div class="stat"><div class="l">月供</div><div class="v">12,811</div><div class="m">元</div></div><div class="stat"><div class="l">利息</div><div class="v">161 万</div></div><div class="stat"><div class="l">总额</div><div class="v" id="long">1,537,259.04</div></div></div><div class="panel" id="box"><p>说明</p></div>
<h2 class="mine">明细</h2><div class="panel tbl"><p id="cap">前 3 期</p><table><tr><th>期</th><th>月供</th></tr><tr><td>1</td><td>12,811</td></tr></table></div><ul><li>一</li></ul></main></body></html>`

test('手写页面：没写样式的照设计走，自己写的盖得过它（哪怕选择器更弱）；面板有内边距、长数字缩小；深浅色跟着切；过体检', { skip }, async () => {
  const out = await tool.execute({ title: '房贷', html: CALC })
  assert.match(out.text, /体检：没发现问题/, out.text)
  const r = await open(out.id, async (ev) => {
    const css = (sel, p) => ev(`getComputedStyle(document.querySelector(${JSON.stringify(sel)})).${p}`)
    const light = {
      bodyFont: await css('body', 'fontSize'), h1: await css('h1', 'fontSize'), bg: await css('body', 'backgroundColor'),
      panel: await css('.panel', 'borderTopLeftRadius'), input: await css('input', 'borderTopLeftRadius'),
      primary: await css('button.primary', 'backgroundColor'), mine: await css('button.mine', 'borderTopLeftRadius'),
      h2: await css('h2.mine', 'fontSize'), kicker: await css('.kicker', 'letterSpacing'),
      box: await css('#box', 'paddingLeft'), statsPad: await css('.stats', 'paddingLeft'), tblPad: await css('.tbl', 'paddingLeft'), cap: await css('#cap', 'paddingLeft'),
      long: await ev("[parseFloat(getComputedStyle(document.getElementById('long')).fontSize), document.getElementById('long').offsetHeight]"),
    }
    // 数字改短了：字号回到 28
    await ev("document.getElementById('long').textContent = '12', new Promise((r) => setTimeout(r, 100))")
    light.short = await css('#long', 'fontSize')
    await ev("__dsp.setTheme('dark'), new Promise((r) => setTimeout(r, 100))")
    return { light, darkBg: await css('body', 'backgroundColor'), darkPrimary: await css('button.primary', 'backgroundColor'), errors: await ev('__dsp.errors') }
  })
  assert.equal(r.light.bodyFont, '15px')
  assert.equal(r.light.h1, '30px')
  assert.equal(r.light.bg, 'rgb(251, 251, 252)')
  assert.equal(r.light.panel, '14px')
  assert.equal(r.light.input, '9px')
  assert.equal(r.light.kicker, '1.44px')
  assert.equal(r.light.box, '22px')
  assert.equal(r.light.statsPad, '0px')
  // 表格贴着面板边，面板里的说明文字缩进来
  assert.equal(r.light.tblPad, '0px')
  assert.equal(r.light.cap, '22px')
  // 长数字缩小字号放进一行，改短了又回到 28px
  assert.ok(r.light.long[0] < 28 && r.light.long[0] >= 16, String(r.light.long))
  assert.ok(r.light.long[1] < 40, String(r.light.long))
  assert.equal(r.light.short, '28px')
  // 页面自己的：强调色换成了红的（深色也是），按钮直角、标题 40px
  assert.equal(r.light.primary, 'rgb(225, 29, 72)')
  assert.equal(r.darkPrimary, 'rgb(225, 29, 72)')
  assert.equal(r.light.mine, '0px')
  assert.equal(r.light.h2, '40px')
  assert.equal(r.darkBg, 'rgb(23, 24, 27)')
  assert.deepEqual(r.errors, [])
})
