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
const { renderTemplate, inline, block, layoutFlow, parseOutline, TEMPLATES } = await import(new URL('../lib/templates.js', import.meta.url))
const { findBrowser, createBrowser } = await import(new URL('../lib/browser.js', import.meta.url))
const { withDesign } = await import(new URL('../lib/design.js', import.meta.url))
const { readVersion } = await import(new URL('../lib/store.js', import.meta.url))
const { unscroll, printPage } = await import(new URL('../lib/check.js', import.meta.url))
const { SAMPLES, LANES, ROUTE_LINKS } = await import(new URL('./fixtures/template-samples.mjs', import.meta.url))
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
    ['mindmap', { center: evil, center_note: evil, branches: [{ text: evil, note: evil, children: [evil] }] }],
    ['mindmap', '# ' + evil + '\n- ' + evil],
    ['roadmap', { layers: [{ label: evil, items: [{ id: 'a', text: evil, note: evil }] }, { groups: [{ title: evil, items: [{ id: 'b', text: 'x' }] }] }], links: [{ from: 'a', to: 'b', label: evil }] }],
    ['roadmap', { periods: [evil, 'b'], now: evil, milestones: [{ time: evil, text: evil }], lanes: [{ name: evil, items: [{ text: evil, note: evil, start: evil, end: 'b' }] }] }],
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
  assert.throws(() => render('mindmap', { center: 'x' }), /思维导图模板：branches 至少要有一个分支/)
  assert.throws(() => render('mindmap', { branches: [{ text: 'a', children: [{ note: '没写字' }] }] }), /「a」下面第 1 个没写 text/)
  const deep = (n) => (n ? { text: 'L' + n, children: [deep(n - 1)] } : 'leaf')
  assert.throws(() => render('mindmap', { branches: [deep(5)] }), /最多 5 层（中心下面）：「leaf」在第 6 层/)
  assert.throws(() => render('mindmap', { branches: Array.from({ length: 201 }, (_, i) => 'n' + i) }), /节点太多了（最多 200 个）/)
  assert.throws(() => render('roadmap', {}), /技术路线模板：要给 layers.*或者 lanes \+ periods/)
  assert.throws(() => render('roadmap', { layers: [{ label: '甲', items: ['a'] }, { label: '乙' }] }), /第 2 层「乙」：至少要有一项/)
  assert.throws(() => render('roadmap', { layers: [{ items: [{ id: 'a', text: 'A' }] }, { items: ['B'] }], links: [{ from: 'a', to: 'z' }] }), /第 1 条连线：from \/ to 要写方框的 id 或原文（找不到「z」）/)
  assert.throws(() => render('roadmap', { periods: ['Q1', 'Q2'], lanes: [{ name: '前端', items: [{ text: '重构', start: 'Q3' }] }] }), /第 1 条泳道「前端」「重构」：start 要写 periods 里的一项，「Q3」不在里面（periods：Q1、Q2）/)
  assert.throws(() => render('roadmap', { lanes: [{ name: '前端', items: [{ text: '重构', start: 'Q1' }] }] }), /要给 periods/)
  assert.throws(() => render('roadmap', { periods: ['2026 Q1', 'Q2', '2027 Q1', 'q2'], lanes: [{ name: 'x', items: [{ text: 'y', start: '2027 Q1' }] }] }), /periods 里「q2」重复了：跨年时每个时间段都带上年份/)
  assert.throws(() => render('roadmap', { periods: ['Q1'], now: 'Q9', lanes: [{ name: 'x', items: [{ text: 'y', start: 'Q1' }] }] }), /now 要写 periods 里的一项，「Q9」不在里面/)
})

test('宽松的写法也认：模板别名、data 给数组 / JSON 字符串、答案写字母或原文', () => {
  assert.match(render('todo', ['a', 'b']), /content="checklist"/)
  assert.match(render('flowchart', JSON.stringify({ nodes: ['开始', '结束'] })), /content="flow"/)
  assert.match(render('脑图', { branches: ['a'] }), /content="mindmap"/)
  assert.match(render('gantt', LANES.data), /content="roadmap".*<div class="kicker">路线图<\/div>/s)
  // 思维导图：data 直接给 Markdown 大纲、给数组、给 root 都认
  assert.match(render('mindmap', '# 学习计划\n- 数学\n  - 线代'), /mm-root">学习计划<.*>数学<.*>线代</s)
  assert.match(render('mindmap', ['甲', '乙'], '标题当中心'), /mm-root">标题当中心</)
  assert.match(render('mindmap', { root: { text: '根', children: ['子'] } }), /mm-root">根<.*>子</s)
  // 技术路线：只给 periods + lanes 也认成按时间的；时间段大小写、空格不同也对得上；end 写在 start 前面就换过来
  const lanes = render('roadmap', { periods: ['2026 Q1', '2026 Q2'], lanes: [{ name: 'x', items: [{ text: 'y', start: '2026q2', end: '2026 Q1', status: '进行中' }] }] })
  assert.match(lanes, /<div class="rm-it s-now" style="grid-column:2\/4;grid-row:2">y<\/div>/)
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

test('思维导图大纲：「# 」中心、「## 」一级、列表按缩进分层；普通行接到上一个节点的说明', () => {
  const o = parseOutline('# 中心\n说明一句\n## 甲\n- 甲1\n    - 甲1a\n  - 甲1b\n- 甲2\n## 乙\n乙的说明\n\t- 乙1')
  const t = (n) => [n.text, ...(n.note ? ['(' + n.note + ')'] : []), ...n.children.map(t)]
  assert.equal(o.center, '中心')
  assert.equal(o.note, '说明一句')
  // 「甲1b」缩进两格：比「甲1a」浅、比「甲1」深，算「甲1」下面一层
  assert.deepEqual(o.branches.map(t), [['甲', ['甲1', ['甲1a'], ['甲1b']], ['甲2']], ['乙', '(乙的说明)', ['乙1']]])
  // 没有标题：第一行普通字当中心，列表从一级开始
  const p = parseOutline('主题\n- a\n  - b\n- c')
  assert.equal(p.center, '主题')
  assert.deepEqual(p.branches.map(t), [['a', ['b']], ['c']])
})

test('按时间的路线图：叠在一起的分到下一行；现在那一列标出来；用到的状态才进图例', () => {
  const html = render('roadmap', LANES.data, LANES.title)
  // 编辑器：协同编辑 Q1–Q2、插件市场 Q2–Q3 叠在 Q2 → 插件市场在第二行；AI 改写 Q3–Q4 跟协同编辑不叠 → 第一行
  assert.match(html, /<div class="rm-it s-done" style="grid-column:2\/4;grid-row:3">协同编辑/)
  assert.match(html, /<div class="rm-it s-now" style="grid-column:3\/5;grid-row:4">插件市场/)
  assert.match(html, /<div class="rm-it s-todo" style="grid-column:4\/6;grid-row:3">AI 改写/)
  assert.match(html, /<div class="rm-h now" style="grid-column:3;grid-row:1">Q2<span class="chip">现在<\/span>/)
  assert.match(html, /<div class="rm-ms" style="grid-column:5;grid-row:2"><div class="rm-m">2\.0 正式发布/)
  assert.match(html, /<div class="rm-key">.*已完成.*进行中.*计划<\/span><\/div>/)
  assert.doesNotMatch(render('roadmap', { periods: ['a'], lanes: [{ name: 'x', items: [{ text: 'y', start: 'a' }] }] }), /class="rm-key"/)
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

const open = (id, fn, w = 720, q = '') => browser.withPage({ url: `http://127.0.0.1:${port}${ROUTE}?id=${id}&theme=light${q}`, w, h: 600 }, async (page) => {
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

test('思维导图：宽屏两边排、手机竖着排，每个节点一条线；点节点收起（记住）、全部展开 / 收起', { skip }, async () => {
  const { id } = await pageOf('mindmap')
  const mode = (ev) => ev("[document.querySelector('.mm').className, document.querySelectorAll('.mm-l > .mm-b').length, document.querySelectorAll('.mm-lines path').length, document.querySelectorAll('.mm-b').length, document.documentElement.scrollWidth <= innerWidth]")
  // 720 宽：两边排（放不下就紧凑一点），左边三个分支；390 宽：竖着排
  const wide = await open(id, mode, 720)
  assert.match(wide[0], /^mm( cmp)?$/)
  assert.deepEqual(wide.slice(1), [3, 22, 22, true])
  assert.deepEqual(await open(id, mode, 390), ['mm ol', 0, 22, 22, true])
  const r = await open(id, async (ev) => {
    // 点「产品」（它下面有 5 个）
    const k = await ev("[...document.querySelectorAll('.mm-b.d1')].find((b) => b.firstElementChild.textContent.startsWith('产品')).dataset.k")
    await ev(`document.querySelector('[data-k="${k}"] > .mm-n').click()`)
    const one = await ev(`(() => { const b = document.querySelector('[data-k="${k}"]'); return [b.classList.contains('fold'), b.firstElementChild.getAttribute('aria-expanded'), b.querySelector('.mm-cnt').hidden, b.querySelector('.mm-cnt').textContent, document.querySelectorAll('.mm-lines path').length, JSON.parse(localStorage.getItem('mindmap')).length] })()`)
    await ev("document.getElementById('mm-close').click()")
    const closed = await ev("[document.querySelectorAll('.mm-b.d1.fold').length, document.querySelectorAll('.mm-lines path').length]")
    await ev("document.getElementById('mm-open').click()")
    const opened = await ev("[document.querySelectorAll('.mm-b.fold').length, document.querySelectorAll('.mm-lines path').length]")
    // 键盘也能收起
    await ev("document.querySelectorAll('.mm-b.d2[data-k] > .mm-n')[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))")
    const key = await ev("document.querySelectorAll('.mm-b.fold').length")
    return { one, closed, opened, key, errors: await ev('__dsp.errors') }
  })
  assert.deepEqual(r.one, [true, 'false', false, '+5', 17, 1])
  assert.deepEqual(r.closed, [5, 5])
  assert.deepEqual(r.opened, [0, 22])
  assert.equal(r.key, 1)
  assert.deepEqual(r.errors, [])
})

test('思维导图：节点多、全展开太高时先收到一级分支（第一屏看得到中心）；点开一个照常记住；导出（full=1）全展开', { skip }, async () => {
  const branches = Array.from({ length: 10 }, (_, i) => ({ text: `分支 ${i + 1}`, note: '一句说明', children: Array.from({ length: 6 }, (_, j) => ({ text: `第 ${j + 1} 项要点`, note: '再多写一句说明，让它占两行' })) }))
  const out = await tool.execute({ title: '大导图', template: 'mindmap', data: { center: '中心', branches } })
  assert.match(out.text, /体检：没发现问题/, out.text)
  const shown = "[document.querySelectorAll('.mm-b.d1.fold').length, [...document.querySelectorAll('.mm-b')].filter((b) => b.offsetParent).length, document.querySelectorAll('.mm-lines path').length, document.querySelector('.mm').offsetHeight < 1000, __dsp.errors]"
  assert.deepEqual(await open(out.id, (ev) => ev(shown), 720), [10, 10, 10, true, []])
  assert.deepEqual(await open(out.id, (ev) => ev(shown), 390), [10, 10, 10, true, []])
  const full = await open(out.id, (ev) => ev(shown), 720, '&full=1')
  assert.deepEqual([full[0], full[1], full[2], full[4]], [0, 70, 70, []])
  // 点开第一个：只它展开，存下来的是另外 9 个
  const r = await open(out.id, async (ev) => {
    await ev("document.querySelector('.mm-b.d1.fold > .mm-n').click()")
    return [await ev("document.querySelectorAll('.mm-b.d1.fold').length"), await ev("JSON.parse(localStorage.getItem('mindmap')).length")]
  })
  assert.deepEqual(r, [9, 9])
})

test('技术路线：不给连线就层和层之间画箭头；给了就逐条连、标签放上；手机宽度左边阶段名挪到上面', { skip }, async () => {
  const plain = await pageOf('roadmap')
  const r1 = await open(plain.id, (ev) => ev("[document.querySelectorAll('.rt-ar').length, document.querySelectorAll('.rt-g').length, getComputedStyle(document.querySelector('.rt-lab')).textAlign, __dsp.errors]"), 390)
  assert.deepEqual(r1, [3, 3, 'left', []])
  const out = await tool.execute({ title: ROUTE_LINKS.title, template: 'roadmap', data: ROUTE_LINKS.data })
  assert.match(out.text, /体检：没发现问题/, out.text)
  for (const w of [720, 390]) {
    const r = await open(out.id, (ev) => ev("[document.querySelectorAll('.rt-lines path.e').length, document.querySelectorAll('.rt-ar').length, [...document.querySelectorAll('.elabel')].map((e) => e.textContent).join(','), __dsp.errors]"), w)
    assert.deepEqual(r, [8, 0, '上线前', []], `宽 ${w}`)
  }
})

// 每条线的取样点，落在别的方框、阶段名里的有几个（自己两头的方框不算；方框往里缩 1px，贴边不算）
const CROSS = `(() => {
  const G = JSON.parse(document.getElementById('data').textContent), W = document.querySelector('.rt').getBoundingClientRect()
  const box = (el) => { const r = el.getBoundingClientRect(); return { l: r.left - W.left + 1, r: r.right - W.left - 1, t: r.top - W.top + 1, b: r.bottom - W.top - 1 } }
  const ns = [...document.querySelectorAll('.rt-n')].sort((a, b) => a.dataset.i - b.dataset.i).map(box)
  const labs = [...document.querySelectorAll('.rt-lab')].filter((x) => x.textContent).map(box)
  const paths = [...document.querySelectorAll('.rt-lines path.e')]
  let bad = []
  paths.forEach((p, k) => {
    const [a, b] = G.links[k], L = p.getTotalLength()
    for (let i = 1; i < 80; i++) {
      const q = p.getPointAtLength((L * i) / 80)
      const hit = (r) => q.x > r.l && q.x < r.r && q.y > r.t && q.y < r.b
      ns.forEach((r, j) => { if (j !== a && j !== b ? hit(r) : q.x > r.l + 2 && q.x < r.r - 2 && q.y > r.t + 2 && q.y < r.b - 2) bad.push(k + '→' + j) })
      labs.forEach((r) => { if (hit(r)) bad.push(k + '→lab') })
    }
  })
  // 连线说明也不能压在方框上
  const ls = [...document.querySelectorAll('.elabel')].map(box)
  ls.forEach((r, k) => {
    ns.forEach((n, j) => { if (r.l < n.r && r.r > n.l && r.t < n.b && r.b > n.t) bad.push('说明' + k + '→' + j) })
    ls.forEach((n, j) => { if (j > k && r.l < n.r && r.r > n.l && r.t < n.b && r.b > n.t) bad.push('说明' + k + '→说明' + j) })
  })
  // 每条说明要么完整地在线上，要么改成脚注列在图下面（线上的号码和下面的对得上）
  const notes = [...document.querySelectorAll('.rt-notes li')].map((li) => li.textContent)
  const nums = [...document.querySelectorAll('.elabel.fn')].map((x) => x.textContent)
  const want = {}, full = [...document.querySelectorAll('.elabel:not(.fn)')].map((x) => x.textContent)
  G.links.forEach((e) => { if (e[2]) want[e[2]] = (want[e[2]] || 0) + 1 })
  Object.keys(want).forEach((t) => {
    const got = full.filter((x) => x === t).length + notes.filter((x) => x.endsWith('：' + t)).length
    if (got !== want[t]) bad.push('说明「' + t.slice(0, 6) + '」该有 ' + want[t] + ' 处，有 ' + got + ' 处')
  })
  nums.forEach((n) => { if (!notes.some((t) => t.startsWith(n))) bad.push('号码 ' + n + ' 下面没有') })
  return [paths.length, [...new Set(bad)], document.documentElement.scrollWidth <= innerWidth, __dsp.errors, notes.length]
})()`

test('技术路线连线：跨层、组里上下摞着、手机上换了行，线都绕开别的方框；长说明不伸出页面，实在放不下的改脚注', { skip }, async () => {
  const cases = {
    跨层: { layers: [{ label: '一', items: [{ id: 'a', text: '起点 A' }] }, { label: '二', items: [{ id: 'b', text: '中间 B' }] }, { label: '三', items: [{ id: 'c', text: '终点 C' }] }], links: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'a', to: 'c', label: '直接跳过去' }] },
    摞着: { layers: [{ label: '数据', items: [{ id: 's', text: '原始数据' }] }, { label: '处理', groups: [{ title: '清洗', items: [{ id: 'x1', text: '去重' }, { id: 'x2', text: '补缺失值' }, { id: 'x3', text: '异常值' }] }, { title: '特征', items: [{ id: 'y1', text: '编码' }] }] }, { label: '模型', items: [{ id: 'm', text: '训练' }] }], links: [{ from: 's', to: 'x1' }, { from: 's', to: 'x3' }, { from: 's', to: 'y1' }, { from: 'x2', to: 'm' }, { from: 'y1', to: 'm' }] },
    换行: { layers: [{ label: '问题', items: [{ id: 'p', text: '点击率下滑' }] }, { label: '方案', items: ['召回', '排序', '重排', '冷启动', { id: 'z', text: '实时特征' }] }], links: [{ from: 'p', to: 'z', label: '完成数据清洗与质量验证后进入模型训练阶段' }] },
    组内上下: { layers: [{ label: '一', groups: [{ title: '组', items: [{ id: 'a', text: '上面的 A' }, { id: 'b', text: '下面的 B' }] }] }, { label: '二', items: [{ id: 'c', text: 'C' }] }], links: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }] },
    组内上下带说明: { layers: [{ label: '一', groups: [{ title: '组', items: [{ id: 'a', text: '上面的 A' }, { id: 'b', text: '下面的 B' }, { id: 'x', text: '再下面的 X' }] }] }, { label: '二', items: [{ id: 'c', text: 'C' }] }], links: [{ from: 'a', to: 'b', label: '通过' }, { from: 'b', to: 'x', label: '先把这一步的数据清洗、脱敏和一致性校验全部做完再往下走' }, { from: 'x', to: 'c' }] },
    同层左右带说明: { layers: [{ label: '一', items: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] }, { label: '二', items: [{ id: 'c', text: 'C' }] }], links: [{ from: 'a', to: 'b', label: '同步数据' }, { from: 'b', to: 'c' }] },
    跨组左右带说明: { layers: [{ label: '一', groups: [{ title: '甲组', items: [{ id: 'a', text: 'A' }] }, { title: '乙组', items: [{ id: 'b', text: 'B' }] }] }, { label: '二', items: [{ id: 'c', text: 'C' }] }], links: [{ from: 'a', to: 'b', label: '先完成原始数据清洗脱敏和质量校验再把结果交给模型训练模块' }, { from: 'b', to: 'c' }] },
    最后一层左右带说明: { layers: [{ label: '一', items: [{ id: 'c', text: 'C' }] }, { label: '二', items: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] }], links: [{ from: 'c', to: 'a' }, { from: 'a', to: 'b', label: '清洗完成后交给模型训练' }] },
    并排说明: { layers: [{ label: '一', items: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] }, { label: '二', items: [{ id: 'c', text: 'C' }, { id: 'd', text: 'D' }] }], links: [{ from: 'a', to: 'c', label: '先做完数据清洗和质量验证再进入下一步' }, { from: 'b', to: 'd', label: '模型训练完成后进行离线评估和线上灰度' }] },
    同一排几条长说明: { layers: [{ label: '处理', items: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }, { id: 'd', text: 'D' }] }, { label: '结果', items: [{ id: 'e', text: 'E' }] }], links: [{ from: 'a', to: 'b', label: '完成原始数据采集后交给清洗模块统一处理' }, { from: 'b', to: 'c', label: '完成原始数据采集后交给清洗模块统一处理' }, { from: 'c', to: 'd', label: '完成原始数据采集后交给清洗模块统一处理' }, { from: 'd', to: 'e' }] },
    两组摞着跨组带说明: { layers: [{ label: '一', groups: [{ title: '甲组', items: [{ id: 'a', text: 'A' }, { id: 'a2', text: 'A2' }] }, { title: '乙组', items: [{ id: 'b', text: 'B' }, { id: 'b2', text: 'B2' }] }] }, { label: '二', items: [{ id: 'c', text: 'C' }] }], links: [{ from: 'a', to: 'b', label: '同步数据' }, { from: 'b2', to: 'c' }] },
    很长的说明: { layers: [{ label: '一', items: [{ id: 'a', text: 'A' }] }, { label: '二', items: [{ id: 'b', text: 'B' }] }], links: [{ from: 'a', to: 'b', label: '这一步要先完成多中心数据的收集、清洗、脱敏和标注一致性校验，然后再把结果交给模型组做预训练和微调，最后由临床专家复核' }] },
  }
  const FOOT = { 同一排几条长说明: 1, 两组摞着跨组带说明: 1 }
  for (const [name, data] of Object.entries(cases)) {
    const out = await tool.execute({ title: name, template: 'roadmap', data })
    assert.match(out.text, /体检：没发现问题/, `${name}：${out.text}`)
    for (const w of [720, 390]) {
      const [n, bad, fit, errors, notes] = await open(out.id, (ev) => ev(CROSS), w)
      // 放得下的不改脚注；两个难例最多一条改成脚注
      assert.ok(notes <= (FOOT[name] || 0), `${name} ${w}：${notes} 条改成了脚注`)
      assert.equal(n, data.links.length, `${name} ${w}`)
      assert.deepEqual(bad, [], `${name} ${w}：线穿过了别的方框`)
      assert.equal(fit, true, `${name} ${w}：横向溢出`)
      assert.deepEqual(errors, [], `${name} ${w}`)
    }
  }
})

test('按时间的路线图：过体检；时间段多了横着能滑，左边泳道名固定、哪边还有内容哪边淡出去', { skip }, async () => {
  const out = await tool.execute({ title: LANES.title, template: 'roadmap', data: LANES.data })
  assert.match(out.text, /体检：没发现问题/, out.text)
  const many = await tool.execute({ title: '一年', template: 'roadmap', data: { periods: Array.from({ length: 12 }, (_, i) => `${i + 1} 月`), lanes: [{ name: '项目', items: [{ text: '全年', start: '1 月', end: '12 月' }] }] } })
  assert.match(many.text, /体检：没发现问题/, many.text)
  const r = await open(many.id, async (ev) => {
    const a = await ev("document.querySelector('.rm-wrap').className")
    await ev("(() => { const w = document.querySelector('.rm-wrap'); w.scrollLeft = 99999; w.dispatchEvent(new Event('scroll')); return 1 })()")
    const b = await ev("[document.querySelector('.rm-wrap').className, getComputedStyle(document.querySelector('.rm-lane')).position]")
    return { a, b, errors: await ev('__dsp.errors') }
  })
  assert.equal(r.a, 'rm-wrap more')
  assert.deepEqual(r.b, ['rm-wrap less', 'sticky'])
  assert.deepEqual(r.errors, [])
  // 导出 PNG 不能滑：外层的最大宽度放宽、视口撑宽，最后一个月整个露出来，淡出遮罩也没了
  const shot = await browser.withPage({ url: `http://127.0.0.1:${port}${ROUTE}?id=${many.id}&theme=light&full=1`, w: 1024, h: 800 }, async (page) => {
    await page.eval('new Promise((r) => setTimeout(r, 300))')
    const width = await unscroll(page, 1024)
    return [width > 1024, await page.eval("(() => { const w = document.querySelector('.rm-wrap'), h = [...document.querySelectorAll('.rm-h')].pop().getBoundingClientRect(), r = w.getBoundingClientRect(); return [w.scrollWidth <= w.clientWidth + 1, h.right <= r.right + 1, w.className] })()")]
  })
  assert.deepEqual(shot, [true, [true, true, 'rm-wrap']])
  // 存 PDF：两年按月（24 格）竖版放不下，横过来按全宽排再缩到纸上；示例那种 4 个季度照旧竖版
  const M = Array.from({ length: 24 }, (_, i) => `${2026 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`)
  const wide = await tool.execute({ title: '两年', template: 'roadmap', data: { periods: M, lanes: [{ name: '平台', items: [{ text: '迁移', start: M[3], end: M[23] }] }] } })
  const box = (pdf) => pdf.toString('latin1').match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/).slice(1).map(Number)
  const [w1, h1] = box(await printPage(browser, `http://127.0.0.1:${port}${ROUTE}?id=${wide.id}&theme=light&full=1`))
  assert.ok(w1 > h1, `24 格应该横版：${w1}×${h1}`)
  const four = await tool.execute({ title: LANES.title, template: 'roadmap', data: LANES.data })
  const [w2, h2] = box(await printPage(browser, `http://127.0.0.1:${port}${ROUTE}?id=${four.id}&theme=light&full=1`))
  assert.ok(w2 < h2, `4 格应该竖版：${w2}×${h2}`)
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
<div class="panel stats"><div class="stat"><div class="l">月供</div><div class="v">12,811</div><div class="m">元</div></div><div class="stat"><div class="l">利息</div><div class="v">161 万</div></div><div class="stat"><div class="l">总额</div><div class="v" id="long">12,345,678,901.23</div></div></div><div class="panel" id="box"><p>说明</p></div>
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
