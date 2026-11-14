/**
 * 模板：模型只写内容（JSON），插件排成一页。存下来的还是完整的 HTML，体检、导出、版本都照旧。
 *
 *   report 报告 · compare 对比 · checklist 清单 / 计划 · dashboard 数据看板 · timeline 时间线 ·
 *   flashcards 学习卡片 · quiz 测验 · flow 流程图 · mindmap 思维导图 · roadmap 技术路线（申报书式分层 / 按时间的泳道）
 *
 * 文字里认一点 Markdown：**加粗**、`代码`、[链接](https://…)、裸的 https 地址；空行分段，「- 」「1. 」开头的行是列表。
 * 勾选、记住了、答过的题存在 localStorage（插件按页面存进 DSH）；对话里和右侧栏两份听 storage 事件同步。
 * 页面上的按钮文字跟着内容的语言走：内容里有中文就用中文，不然用英文。
 */

import { TOKENS, CORE, KIT, solid } from './design.js'

const LABELS = { report: '报告', compare: '对比', checklist: '清单', dashboard: '数据看板', timeline: '时间线', flashcards: '学习卡片', quiz: '测验', flow: '流程图', mindmap: '思维导图', roadmap: '技术路线' }
export const TEMPLATES = Object.keys(LABELS)
export const templateLabel = (name) => LABELS[name] || name

// 模型可能写成别的叫法
const ALIAS = { comparison: 'compare', vs: 'compare', todo: 'checklist', todos: 'checklist', plan: 'checklist', list: 'checklist', chart: 'dashboard', charts: 'dashboard', stats: 'dashboard', events: 'timeline', cards: 'flashcards', flashcard: 'flashcards', test: 'quiz', exam: 'quiz', flowchart: 'flow', process: 'flow',
  mind: 'mindmap', mind_map: 'mindmap', 'mind-map': 'mindmap', brainstorm: 'mindmap', 思维导图: 'mindmap', 脑图: 'mindmap', 导图: 'mindmap',
  route: 'roadmap', techroute: 'roadmap', tech_route: 'roadmap', technical_route: 'roadmap', gantt: 'roadmap', swimlane: 'roadmap', 技术路线: 'roadmap', 技术路线图: 'roadmap', 路线图: 'roadmap' }
// data 直接给了数组时，当成这一项
const MAIN = { report: 'sections', compare: 'items', checklist: 'items', dashboard: 'charts', timeline: 'events', flashcards: 'cards', quiz: 'questions', flow: 'nodes', mindmap: 'branches', roadmap: 'layers' }

const UI = {
  zh: {
    done: '已完成 {n} / {m}', hideDone: '只看没做的', reset: '重置', again: '再点一次清空', allDone: '全部完成 🎉',
    cards: '卡片', table: '表格', diff: '只看不同', pick: '推荐', pros: '优点', cons: '缺点',
    card: '第 {i} / {n} 张', known: '记住 {k} 张', gotIt: '记住了', notYet: '再看看', prev: '← 上一张', next: '下一张 →',
    shuffle: '打乱', order: '按顺序', unknownOnly: '只看没记住的', allCards: '全部卡片', allKnown: '全部记住了 🎉', restart: '从头再来',
    front: '正面', back: '背面', flip: '点卡片翻面',
    score: '得分', answered: '已答 {a} / {n}', right: '答对了', wrong: '答错了，正确答案是 {k}', retry: '重做',
    finished: '全部答完：答对 {s} / {n} 题', total: '合计', sources: '来源', now: '进行中', q: '第 {i} 题',
    verdict: '结论', keys: '← → 切换 · 空格翻面',
    expand: '全部展开', collapse: '全部收起', sDone: '已完成', sNow: '进行中', sTodo: '计划', nowCol: '现在', milestones: '里程碑',
  },
  en: {
    done: '{n} of {m} done', hideDone: 'Hide done', reset: 'Reset', again: 'Click again to clear', allDone: 'All done 🎉',
    cards: 'Cards', table: 'Table', diff: 'Differences only', pick: 'Pick', pros: 'Pros', cons: 'Cons',
    card: 'Card {i} of {n}', known: '{k} known', gotIt: 'Got it', notYet: 'Again', prev: '← Prev', next: 'Next →',
    shuffle: 'Shuffle', order: 'In order', unknownOnly: 'Unknown only', allCards: 'All cards', allKnown: 'All known 🎉', restart: 'Start over',
    front: 'FRONT', back: 'BACK', flip: 'Tap the card to flip',
    score: 'Score', answered: '{a} of {n} answered', right: 'Correct', wrong: 'Wrong — the answer is {k}', retry: 'Retry',
    finished: 'Finished: {s} of {n} correct', total: 'Total', sources: 'Sources', now: 'Now', q: 'Question {i}',
    verdict: 'Verdict', keys: '← → to move · Space to flip',
    expand: 'Expand all', collapse: 'Collapse all', sDone: 'Done', sNow: 'In progress', sTodo: 'Planned', nowCol: 'Now', milestones: 'Milestones',
  },
}
// 标题上方的类别小字
const KICKER = {
  zh: LABELS,
  en: { report: 'REPORT', compare: 'COMPARISON', checklist: 'CHECKLIST', dashboard: 'DASHBOARD', timeline: 'TIMELINE', flashcards: 'FLASHCARDS', quiz: 'QUIZ', flow: 'FLOW', mindmap: 'MIND MAP', roadmap: 'ROADMAP' },
}
const fill = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => (o[k] === undefined ? '' : o[k]))

// ── 文字 ────────────────────────────────────────────────────────────────────

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const text = (x) => (x === null || x === undefined ? '' : typeof x === 'object' ? JSON.stringify(x) : String(x)).trim()
const arr = (x) => (Array.isArray(x) ? x : [])
const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : null)

function need(ok, msg) {
  if (!ok) throw new Error(msg)
}

/** 一行字：转义后认 `代码`、**加粗**、[链接](https://…)、裸地址；换行变 <br> */
export function inline(s) {
  const codes = []
  let h = esc(text(s)).replace(/`([^`\n]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000` })
  h = h.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
  h = h.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
  h = h.replace(/(^|[\s(（:：])(https?:\/\/[^\s<)）]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>')
  h = h.replace(/\n/g, '<br>')
  return h.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`)
}

/** 一段字：空行分段，「- 」「• 」「1. 」开头的行是列表 */
export function block(s) {
  const out = []
  let list = null
  let para = []
  const endList = () => {
    if (list) out.push(`<${list.tag}>${list.items.map((x) => `<li>${inline(x)}</li>`).join('')}</${list.tag}>`)
    list = null
  }
  const endPara = () => {
    if (para.length) out.push(`<p>${inline(para.join('\n'))}</p>`)
    para = []
  }
  for (const line of text(s).split(/\r?\n/)) {
    const m = /^\s*(?:([-*•])|(\d+)[.、)])\s+(.*)$/.exec(line)
    if (m) {
      endPara()
      const tag = m[1] ? 'ul' : 'ol'
      if (list && list.tag !== tag) endList()
      if (!list) list = { tag, items: [] }
      list.items.push(m[3])
    } else if (!line.trim()) {
      endPara()
      endList()
    } else {
      endList()
      para.push(line)
    }
  }
  endPara()
  endList()
  return out.join('')
}

/** 内容 → 短键（存勾选、答案用；内容改了顺序也认得出） */
export function key(s) {
  let h = 5381
  for (const ch of String(s)) h = ((h << 5) + h + ch.codePointAt(0)) | 0
  return (h >>> 0).toString(36)
}

const NUM_CELL = /^[-+−]?[¥$€£]?\s?\d[\d,]*(\.\d+)?\s?(%|‰|万|亿|元|k|K|M|B|x|×)?$/

/** { columns, rows }：rows 每行是数组，或者按列名给的对象 */
function table(t, cls = '') {
  const o = obj(t)
  if (!o) return ''
  const cols = arr(o.columns).map(text)
  const rows = arr(o.rows).map((r) => (Array.isArray(r) ? r : obj(r) ? cols.map((c) => r[c]) : [r]))
  if (!cols.length && !rows.length) return ''
  // 整列都是数（空格子不算）才右对齐，表头跟着
  const width = Math.max(cols.length, ...rows.map((r) => r.length))
  const num = Array.from({ length: width }, (_, j) => {
    const cells = rows.map((r) => text(r[j])).filter(Boolean)
    return cells.length > 0 && cells.every((c) => NUM_CELL.test(c))
  })
  const cl = (j) => (num[j] ? ' class="num"' : '')
  return `<div class="panel tbl${cls ? ' ' + cls : ''}"><table>` +
    (cols.length ? `<thead><tr>${cols.map((c, j) => `<th${cl(j)}>${inline(c)}</th>`).join('')}</tr></thead>` : '') +
    `<tbody>${rows.map((r) => `<tr>${r.map((c, j) => `<td${cl(j)}>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
}

/** 涨跌：+12% 绿、-3% 红；good: 'down' 时反过来（成本、耗时这种降了是好事） */
function delta(x, good) {
  const s = text(x)
  if (!s) return ''
  const up = /^[+↑▲]/.test(s) || (typeof x === 'number' && x > 0)
  const down = /^[-−↓▼]/.test(s) || (typeof x === 'number' && x < 0)
  if (!up && !down) return `<span class="d">${esc(s)}</span>`
  const fine = String(good).toLowerCase() === 'down' ? down : up
  return `<span class="d ${fine ? 'good' : 'bad'}">${up ? '↑' : '↓'}${esc(s.replace(/^[+\-−↑↓▲▼]\s*/, ''))}</span>`
}

function metrics(list) {
  const ms = arr(list).map(obj).filter((m) => m && (text(m.label) || text(m.value)))
  if (!ms.length) return ''
  return `<div class="panel stats">${ms.map((m) => {
    const more = delta(m.delta, m.good) + (text(m.note) ? `<span>${inline(m.note)}</span>` : '')
    // 「2 分 41 秒」这种长的字号收一点，免得折行
    const long = [...text(m.value)].length > 7 ? ' sm' : ''
    return `<div class="stat"><div class="l">${inline(m.label)}</div><div class="v${long}">${inline(m.value)}</div>${more ? `<div class="m">${more}</div>` : ''}</div>`
  }).join('')}</div>`
}

const bullets = (list, cls = '') => {
  const xs = arr(list).map(text).filter(Boolean)
  return xs.length ? `<ul${cls ? ` class="${cls}"` : ''}>${xs.map((x) => `<li>${inline(x)}</li>`).join('')}</ul>` : ''
}

// ── 样式 ────────────────────────────────────────────────────────────────────
// 设计语言、颜色变量和共用的部件在 design.js（手写的页面也用同一套）；这里是模板自己的：
// 整页的宽度和留白、标题间距、列表圆点、各个模板的部件

const STYLE = TOKENS + CORE + `
html{background:var(--bg)}
body{max-width:960px;margin:0 auto;padding:36px 40px 40px}
h1,h3{margin:0}h2{margin:0 0 14px}strong{color:var(--fg)}
ul{list-style:none}ul>li{position:relative;margin:5px 0;padding-left:18px}
ul>li::before{content:"";position:absolute;left:3px;top:calc(.85em - 3px);width:6px;height:6px;border-radius:50%;background:var(--accent)}` + KIT + `
.src{margin-top:12px;padding-top:16px;border-top:1px solid var(--line);font-size:12.5px;color:var(--muted)}.src ol{margin:0}
.cmp-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:16px;align-items:start}
.item{display:flex;flex-direction:column;gap:16px;min-width:0;padding:20px 20px 18px}
.item.rec{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent),var(--lift)}
.item .top{display:flex;flex-wrap:wrap;gap:6px;min-height:20px;margin-bottom:-4px}
.item h3{font-size:16px}
.hl{margin-top:4px;font-size:26px;line-height:1.2;font-weight:750;letter-spacing:-.01em;font-variant-numeric:tabular-nums}
.item.rec .hl{color:var(--accent-ink)}
.item .note{margin-top:4px;font-size:13px;color:var(--muted)}
.specs{display:grid;grid-template-columns:auto 1fr;margin:0;font-size:13.5px;border-top:1px solid var(--line)}
.specs dt,.specs dd{padding:8px 0;border-bottom:1px solid var(--line)}
.specs dt{padding-right:14px;color:var(--muted);white-space:nowrap}
.specs dd{margin:0;min-width:0;text-align:right;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
.best{color:var(--good-ink);font-weight:650}
.best::before{content:"";display:inline-block;width:6px;height:6px;margin-right:6px;border-radius:50%;background:var(--good);vertical-align:2px}
ul.pc{margin:0;font-size:13.5px;color:var(--fg2)}
ul.pc>li{margin:7px 0;padding-left:25px}
ul.pc>li::before{left:0;top:calc(.85em - 8px);width:16px;height:16px;display:grid;place-items:center;font-size:10px;line-height:1;font-weight:800}
ul.pc.pro>li::before{content:"✓";background:var(--good-soft);color:var(--good-ink)}
ul.pc.con>li::before{content:"✕";font-size:9px;background:var(--bad-soft);color:var(--bad-ink)}
.cmp-table th{padding-top:14px;font-size:14px;line-height:1.4;color:var(--fg);background:var(--surface);min-width:120px;vertical-align:bottom;border-bottom-color:var(--line2)}
.cmp-table th:first-child{min-width:0}
.cmp-table .hl-s{margin-top:4px;font-size:15px;font-weight:750;font-variant-numeric:tabular-nums}
.cmp-table .rec{background:${solid('--accent-soft')}}.cmp-table th.rec,.cmp-table th.rec .hl-s{color:var(--accent-ink)}
.cmp-table td:first-child{color:var(--muted);white-space:nowrap}
body.diff .same{display:none}
.prog{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px;margin:0 0 28px;padding:18px 22px 20px}
.prog .pct{font-size:30px;line-height:1;font-weight:750;letter-spacing:-.01em;font-variant-numeric:tabular-nums;transition:color .3s}
.prog .txt{font-size:13px;color:var(--muted);font-variant-numeric:tabular-nums}
.prog .track{flex-basis:100%;height:6px;margin-top:12px;border-radius:99px;background:var(--sunk);overflow:hidden}
.prog .fill{width:0;height:100%;border-radius:99px;background:var(--accent);transition:width .35s cubic-bezier(.3,.7,.3,1),background-color .3s}
.prog.full .fill{background:var(--good)}.prog.full .pct{color:var(--good-ink)}
.grp{margin:0 0 28px}
.grp h2{display:flex;align-items:center;gap:10px;margin:0;padding:0 0 10px;font-size:14px;border-bottom:1px solid var(--line)}
.grp h2 .cnt{margin-left:auto;padding:0 8px;border-radius:999px;font-size:12px;line-height:20px;font-weight:650;color:var(--muted);background:var(--sunk);font-variant-numeric:tabular-nums;transition:background-color .2s,color .2s}
.grp.full h2 .cnt{background:var(--good-soft);color:var(--good-ink)}
.todo{position:relative;display:flex;align-items:flex-start;gap:12px;margin:0 -10px;padding:12px 10px;border-radius:10px;cursor:pointer;user-select:none;transition:background-color .15s}
.todo::after{content:"";position:absolute;left:10px;right:10px;bottom:0;height:1px;background:var(--line)}
.todo:last-child::after{display:none}.todo:hover{background:var(--hover)}
.box{flex:none;display:grid;place-items:center;width:20px;height:20px;margin-top:2px;border-radius:50%;border:1.5px solid var(--line2);background:var(--surface);transition:background-color .15s,border-color .15s}
.todo:hover .box{border-color:var(--accent)}
.box svg{width:11px;height:11px;stroke:var(--on-accent);opacity:0;transform:scale(.5);transition:opacity .15s,transform .2s}
.todo.done .box{background:var(--accent);border-color:var(--accent)}.todo.done .box svg{opacity:1;transform:none}
.todo :focus-visible+.box{outline:2px solid var(--accent);outline-offset:2px}
.todo .t{flex:1;min-width:0}.todo .chip{margin-left:8px}
.todo .main{transition:color .15s}
.todo.done .main{color:var(--faint);text-decoration:line-through;text-decoration-color:var(--line2)}
.todo .note{display:block;margin-top:2px;font-size:13px;color:var(--muted)}.todo.done .note{color:var(--faint)}
body.hide-done .todo.done{display:none}
.alldone{margin:0 0 24px;padding:14px;border-radius:12px;text-align:center;font-weight:650;background:var(--good-soft);color:var(--good-ink)}
.charts{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;margin:0 0 24px}
.chart{display:flex;flex-direction:column;min-width:0;padding:18px 20px 16px}.chart h3{margin:0 0 16px;font-size:14px}
.chart:last-child:nth-child(odd){grid-column:1/-1}
.cv{position:relative;flex:1;min-height:220px}.cv svg{display:block;overflow:visible}
.axis{fill:var(--faint);font-size:11px;font-variant-numeric:tabular-nums}
.grid{stroke:var(--line);stroke-width:1}.grid.base{stroke:var(--line2)}
.hlb{fill:var(--fg);fill-opacity:.045}.guide{stroke:var(--line2);stroke-width:1}
.pie-v{fill:var(--fg);font-size:22px;font-weight:750}
.legend{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:14px;font-size:12px;color:var(--muted)}
.legend span{display:inline-flex;align-items:center}
.legend i,.tip i{display:inline-block;flex:none;width:8px;height:8px;margin-right:6px;border-radius:2px}
.legend b{margin-left:4px;color:var(--fg);font-weight:650;font-variant-numeric:tabular-nums}
.tip{position:absolute;left:0;top:0;z-index:2;padding:8px 12px;border-radius:10px;border:1px solid var(--line);background:var(--surface);box-shadow:var(--lift);font-size:12px;line-height:1.65;white-space:nowrap;font-variant-numeric:tabular-nums;pointer-events:none;opacity:0;transition:opacity .12s}
.tip b{font-weight:650}
.ev{position:relative;display:grid;grid-template-columns:100px 22px 1fr;gap:0 16px}
.ev::before{content:"";position:absolute;left:126px;top:0;bottom:0;width:2px;background:var(--line)}
.ev:first-child::before{top:12px}.ev:last-child::before{bottom:auto;height:12px}.ev:only-child::before{display:none}
.ev.s-done::before{background:var(--accent)}
.when{padding-top:2px;text-align:right;font-size:13px;line-height:1.5;font-weight:600;color:var(--muted);font-variant-numeric:tabular-nums}
.ev.s-now .when{color:var(--accent-ink)}
.rail{display:flex;justify-content:center}
.dot{position:relative;z-index:1;width:12px;height:12px;margin-top:6px;border-radius:50%;background:var(--bg);border:2px solid var(--accent)}
.ev.s-done .dot{background:var(--accent)}.ev.s-todo .dot{border-color:var(--line2)}
.ev.s-now .dot{width:16px;height:16px;margin-top:4px;border-width:4px;box-shadow:0 0 0 5px var(--accent-soft)}
.ev .body{min-width:0;padding:0 0 28px}.ev:last-child .body{padding-bottom:0}
.ev.s-now .body{margin:-8px 0 20px -14px;padding:8px 14px 12px;border-radius:12px;background:var(--accent-soft)}
.ev .ttl{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;font-size:15px;line-height:1.5;font-weight:650}
.ev.s-todo .ttl{color:var(--fg2);font-weight:600}
.ev .txt{margin-top:4px;font-size:14px;color:var(--muted)}.ev .txt p,.ev .txt ul{margin-bottom:6px}.ev .txt>:last-child{margin-bottom:0}
.tl.notime .ev{grid-template-columns:22px 1fr}.tl.notime .when{display:none}.tl.notime .ev::before{left:10px}
.fc-top{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;margin:0 0 14px;font-size:13px;color:var(--muted)}
.fc-top #pos{font-weight:650;color:var(--fg2);font-variant-numeric:tabular-nums}
.dots{display:flex;gap:4px;margin:0 0 18px}.dots i{flex:1;height:4px;border-radius:2px;background:var(--line);transition:background-color .2s}
.dots i.k{background:var(--good)}.dots i.cur{background:var(--accent)}
.fc{margin:0 0 20px;perspective:1600px;cursor:pointer;outline:none;border-radius:20px}
.fc:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.fc .in{display:grid;transform-style:preserve-3d;transition:transform .55s cubic-bezier(.3,.7,.3,1)}
.fc.flip .in{transform:rotateY(180deg)}
.face{position:relative;grid-area:1/1;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:260px;padding:48px 36px;text-align:center;border-radius:20px;border:1px solid var(--line);background:var(--surface);box-shadow:var(--lift);-webkit-backface-visibility:hidden;backface-visibility:hidden}
.face.back{transform:rotateY(180deg);background:${solid('--accent-soft')};border-color:transparent}
.face .lab{position:absolute;top:18px;left:22px;margin:0;color:var(--faint)}.face.back .lab{color:var(--accent-ink)}
.face .big{font-size:36px;line-height:1.3;font-weight:700;letter-spacing:-.01em;overflow-wrap:anywhere}.face .big.long{font-size:22px;line-height:1.5;font-weight:650}.face .big.huge{font-size:64px;line-height:1.15}
.face .hint{margin-top:14px;font-size:13px;color:var(--muted)}
.face .tap{position:absolute;left:0;right:0;bottom:16px;font-size:12px;color:var(--faint)}
.face .ans{font-size:17px;line-height:1.75;overflow-wrap:anywhere}.face .ans.short{font-size:30px;line-height:1.35;font-weight:700}
.face .ans.long{text-align:left;font-size:15px}.face .ans>:last-child{margin-bottom:0}
.fc-nav{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:10px}
.fc-nav #no,.fc-nav #yes{min-width:104px;padding:7px 18px;font-size:14px}
.fc-nav #yes.on{background:var(--good);border-color:var(--good);box-shadow:none}
.keys{margin-top:12px;text-align:center;font-size:12px;color:var(--faint)}
.fc-done{margin:0 0 20px;padding:40px 16px;border-radius:20px;text-align:center;font-size:17px;font-weight:650;color:var(--good-ink);background:var(--good-soft)}
.fc-done button{margin-left:12px;vertical-align:1px}
details.all{margin-top:28px;padding-top:14px;border-top:1px solid var(--line)}
details.all summary{display:flex;align-items:center;gap:8px;list-style:none;cursor:pointer;font-size:13px;font-weight:600;color:var(--muted)}
details.all summary::-webkit-details-marker{display:none}
details.all summary::before{content:"";width:6px;height:6px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(-45deg);transition:transform .2s}
details.all[open] summary::before{transform:rotate(45deg)}
.list{margin-top:8px}
.list .row{display:grid;grid-template-columns:1fr 1.5fr;gap:16px;padding:10px 0;border-bottom:1px solid var(--line);font-size:14px}.list .row:last-child{border-bottom:0}
.list .row .f{font-weight:600}.list .row .b{color:var(--muted)}.list .row .b>:last-child{margin-bottom:0}
.list .row.k .f::after{content:"✓";margin-left:6px;font-weight:800;color:var(--good)}
.score{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;margin:0 0 24px;padding:16px 22px}
.score .lab{margin:0;color:var(--muted)}
.score b{font-size:28px;line-height:1;font-weight:750;letter-spacing:-.01em;font-variant-numeric:tabular-nums}
.score #an{font-size:13px;color:var(--muted)}
.qdots{display:flex;flex-wrap:wrap;gap:5px}.qdots i{width:10px;height:10px;border-radius:50%;background:var(--line2);transition:background-color .2s}
.qdots i.ok{background:var(--good)}.qdots i.no{background:var(--bad)}
.q{margin:0 0 16px;padding:22px 24px}
.q .qn{margin-bottom:8px}
.q .qt{margin-bottom:16px;font-size:16.5px;line-height:1.55;font-weight:650}
.opts{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}.opts.wide{grid-template-columns:1fr}
.opt{display:flex;align-items:center;gap:12px;width:100%;padding:10px 14px;text-align:left;font-size:14.5px;line-height:1.5;font-weight:500;color:var(--fg);background:var(--surface);border:1.5px solid var(--line);border-radius:12px}
.opt:hover:not(:disabled){border-color:var(--accent);background:var(--accent-soft);color:var(--fg)}
.opt .k{flex:none;display:grid;place-items:center;width:26px;height:26px;border-radius:8px;font-size:12px;font-weight:750;background:var(--sunk);color:var(--muted);transition:background-color .15s,color .15s}
.opt:hover:not(:disabled) .k{background:var(--accent);color:var(--on-accent)}
.opt:disabled{opacity:1;cursor:default}
.q.done .opt{opacity:.5}.q.done .opt.right,.q.done .opt.wrong{opacity:1}
.opt.right{border-color:var(--good);background:var(--good-soft)}.opt.right .k{background:var(--good);color:#fff}
.opt.wrong{border-color:var(--bad);background:var(--bad-soft)}.opt.wrong .k{background:var(--bad);color:#fff}
.exp{margin-top:14px;padding:12px 16px;border-radius:12px;background:var(--sunk);font-size:14px;color:var(--fg2)}.exp>:last-child{margin-bottom:0}
.exp .res{display:block;margin-bottom:2px;font-weight:700}.exp .res.ok{color:var(--good-ink)}.exp .res.no{color:var(--bad-ink)}
.final{font-size:16px;font-weight:650}
.flow{position:relative;padding:6px 0 8px}.flow .rows{display:flex;flex-direction:column;gap:52px}
.flow .row{display:flex;flex-wrap:wrap;justify-content:center;gap:20px 28px}
.node{position:relative;z-index:1;display:flex;flex-direction:column;justify-content:center;min-width:112px;max-width:260px;padding:11px 18px;text-align:center;font-size:14px;line-height:1.45;font-weight:600;overflow-wrap:anywhere;background:var(--surface);border:1px solid var(--line2);border-radius:12px;box-shadow:var(--shadow)}
.node .nn{margin-top:3px;font-size:12px;font-weight:400;color:var(--muted)}
.node.start,.node.end{padding:10px 22px;border-radius:999px}
.node.start{background:var(--accent);border-color:var(--accent);color:var(--on-accent);box-shadow:0 6px 16px -6px rgba(77,107,254,.6)}
.node.end{background:var(--fg);border-color:var(--fg);color:var(--bg)}
.node.start .nn,.node.end .nn{color:inherit;opacity:.75}
.node.decision{background:${solid('--warn-soft')};border:1.5px solid var(--warn)}
.flow svg{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;overflow:visible}
.flow path.e{fill:none;stroke:var(--faint);stroke-width:1.5}.flow .ah{fill:var(--faint)}
.elabel{position:absolute;z-index:2;transform:translate(-50%,-50%);padding:0 9px;border-radius:999px;font-size:12px;line-height:20px;font-weight:650;white-space:nowrap;background:var(--surface);border:1px solid var(--line2);color:var(--fg2)}
.elabel.yes{background:${solid('--good-soft')};border-color:transparent;color:var(--good-ink)}
.elabel.no{background:${solid('--bad-soft')};border-color:transparent;color:var(--bad-ink)}
.mm{position:relative;margin:4px 0 8px}
.mm-lines{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;overflow:visible}
.mm-lines path{fill:none;stroke-linecap:round}
.mm-in{position:relative;display:flex;align-items:center;width:max-content;margin:0 auto}
.mm-side{display:flex;flex-direction:column;gap:14px}.mm-side:empty{display:none}
.mm-r{padding-left:44px;align-items:flex-start}.mm-l{padding-right:44px;align-items:flex-end}
.mm-b{display:flex;align-items:center}.mm-l .mm-b{flex-direction:row-reverse}
.mm-k{display:flex;flex-direction:column;gap:2px;padding-left:34px;align-items:flex-start}
.mm-l .mm-k{padding-left:0;padding-right:34px;align-items:flex-end}
.mm-b.fold>.mm-k{display:none}
.mm-n{position:relative;z-index:1;flex:none;max-width:220px;padding:3px 8px;border-radius:8px;font-size:14px;line-height:1.45;font-weight:550;color:var(--fg);overflow-wrap:anywhere;transition:background-color .15s}
.mm-l .mm-n{text-align:right}
.mm-root{max-width:210px;padding:12px 20px;border-radius:14px;font-size:17px;line-height:1.35;font-weight:700;text-align:center;background:var(--accent);color:var(--on-accent);box-shadow:0 6px 16px -6px rgba(77,107,254,.6)}
.mm-b.d1>.mm-n{padding:7px 14px;border-radius:10px;font-size:15px;font-weight:650;background:color-mix(in srgb,var(--b) 12%,var(--surface));border:1.5px solid var(--b)}
.mm-b.d3>.mm-n,.mm-b.d4>.mm-n,.mm-b.d5>.mm-n{font-size:13px;font-weight:450;color:var(--fg2)}
.mm-note{display:block;margin-top:1px;font-size:12px;line-height:1.45;font-weight:400;color:var(--muted)}
.mm-root .mm-note{color:var(--on-accent);opacity:.85}
.mm-n[role=button]{cursor:pointer;user-select:none}
.mm-n[role=button]:hover{background:var(--hover)}.mm-b.d1>.mm-n[role=button]:hover{background:color-mix(in srgb,var(--b) 20%,var(--surface))}
.mm-n[role=button]:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.mm-cnt{display:inline-block;min-width:20px;margin-left:6px;padding:0 6px;border-radius:999px;font-size:11px;line-height:18px;font-weight:700;text-align:center;vertical-align:1px;background:var(--sunk);color:var(--muted);box-shadow:inset 0 0 0 1px var(--line2)}
.mm.cmp .mm-n{max-width:136px}.mm.cmp .mm-root{max-width:150px;padding:10px 14px;font-size:15.5px}
.mm.cmp .mm-b.d1>.mm-n{padding:6px 10px;font-size:14px}
.mm.cmp .mm-r{padding-left:30px}.mm.cmp .mm-l{padding-right:30px}.mm.cmp .mm-k{padding-left:24px}.mm.cmp .mm-l .mm-k{padding-left:0;padding-right:24px}
.mm.ol .mm-in{display:block;width:auto;margin:0}
.mm.ol .mm-side{padding:0 0 0 28px;margin-top:12px;gap:10px;align-items:flex-start}
.mm.ol .mm-b{display:block}.mm.ol .mm-k{padding:0 0 0 28px;margin-top:4px;align-items:flex-start}
.mm.ol .mm-n{display:inline-block;max-width:100%;text-align:left}.mm.ol .mm-root{display:inline-block}
.rt{position:relative;padding:4px 0}
.rt-lines{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;overflow:visible}
.rt-lines path{fill:none;stroke:var(--faint);stroke-width:1.5}.rt-lines .ah{fill:var(--faint)}
.rt .elabel{max-width:min(220px,70%);white-space:normal;text-align:center;line-height:18px;padding:1px 9px;border-radius:10px}
.rt .elabel.fn{min-width:20px;padding:1px 5px;border-radius:999px;font-weight:700;font-variant-numeric:tabular-nums;cursor:default;background:${solid('--accent-soft')};border-color:transparent;color:var(--accent-ink)}
.rt-notes{margin:14px 0 0;padding:0;list-style:none;display:grid;gap:6px;font-size:13px;line-height:20px;color:var(--fg2)}
.rt-notes li{display:flex;gap:8px;align-items:flex-start;min-width:0;overflow-wrap:anywhere}
.rt-fnum{flex:none;min-width:20px;padding:1px 5px;border-radius:999px;font-size:12px;line-height:18px;font-weight:700;text-align:center;font-variant-numeric:tabular-nums;background:${solid('--accent-soft')};color:var(--accent-ink)}
.rt-layer{display:grid;grid-template-columns:1fr;gap:16px;align-items:stretch}
.rt.wl .rt-layer{grid-template-columns:96px minmax(0,1fr)}
.rt.lk .rt-layer+.rt-layer{margin-top:44px}
.rt.lk .rt-body{gap:18px 16px}
.rt.lk .rt-gi{gap:14px}
.rt-lab{display:flex;align-items:center;justify-content:center;padding:10px 10px;border-radius:12px;text-align:center;font-size:14px;line-height:1.4;font-weight:700;overflow-wrap:anywhere;background:var(--accent-soft);color:var(--accent-ink)}
.rt-lab:empty{background:none}
.rt-body{display:flex;flex-wrap:wrap;justify-content:center;align-items:stretch;gap:12px;min-width:0;padding:4px 0}
.rt-n{position:relative;z-index:1;display:flex;flex-direction:column;justify-content:center;flex:1 1 120px;min-width:96px;max-width:260px;padding:10px 14px;text-align:center;font-size:14px;line-height:1.45;font-weight:600;overflow-wrap:anywhere;background:var(--surface);border:1px solid var(--line2);border-radius:10px;box-shadow:var(--shadow)}
.rt-n .nn{margin-top:3px;font-size:12px;font-weight:400;color:var(--muted)}
.rt-n.key{background:${solid('--accent-soft')};border:1.5px solid var(--accent);color:var(--accent-ink)}
.rt-g{position:relative;display:flex;flex:1 1 150px;min-width:0;padding:20px 10px 10px;border:1.5px dashed var(--line2);border-radius:14px}
.rt-gt{position:absolute;top:-10px;left:14px;right:14px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:12px;line-height:18px;font-weight:700;color:var(--muted)}
.rt-gt span{padding:0 8px;background:var(--bg)}
.rt-gi{display:flex;flex:1;flex-direction:column;justify-content:center;gap:8px;min-width:0}.rt-gi .rt-n{flex:0 0 auto;min-width:0;max-width:none}
.rt-ar{position:relative;height:36px}.rt.wl .rt-ar{margin-left:112px}
.rt-ar::before{content:"";position:absolute;left:50%;top:6px;bottom:12px;width:2px;margin-left:-1px;border-radius:1px;background:var(--faint)}
.rt-ar::after{content:"";position:absolute;left:50%;bottom:4px;margin-left:-6px;border:solid transparent;border-width:9px 6px 0;border-top-color:var(--faint)}
.rm-wrap{overflow-x:auto;margin:0 0 8px;padding-bottom:2px}
.rm-wrap.more{-webkit-mask-image:linear-gradient(to right,#000 calc(100% - 48px),transparent);mask-image:linear-gradient(to right,#000 calc(100% - 48px),transparent)}
.rm-wrap.less{-webkit-mask-image:linear-gradient(to right,transparent,#000 48px);mask-image:linear-gradient(to right,transparent,#000 48px)}
.rm-wrap.less.more{-webkit-mask-image:linear-gradient(to right,transparent,#000 48px,#000 calc(100% - 48px),transparent);mask-image:linear-gradient(to right,transparent,#000 48px,#000 calc(100% - 48px),transparent)}
.rm-h0,.rm-msl,.rm-lane{position:sticky;left:0;z-index:2;background:var(--bg)}.rm-lane.sep{border-top:1px solid var(--line)}
.rm{position:relative;display:grid;grid-template-columns:112px repeat(var(--n),minmax(84px,1fr))}
.rm-col{border-left:1px dashed var(--line)}.rm-col.now{background:color-mix(in srgb,var(--accent) 6%,transparent)}
.rm-band{border-top:1px solid var(--line)}
.rm-h{display:flex;flex-direction:column;align-items:center;gap:4px;padding:0 6px 10px;text-align:center;font-size:12.5px;line-height:1.4;font-weight:650;color:var(--muted);font-variant-numeric:tabular-nums;border-bottom:1px solid var(--line2)}
.rm-h.now{color:var(--accent-ink)}
.rm-h0{border-bottom:1px solid var(--line2)}
.rm-msl{padding:10px 12px 10px 0;font-size:12px;font-weight:650;color:var(--muted)}
.rm-ms{display:flex;flex-direction:column;gap:6px;padding:10px 6px}
.rm-m{display:flex;align-items:flex-start;gap:7px;font-size:12.5px;line-height:1.4;font-weight:600;color:var(--fg2);overflow-wrap:anywhere}
.rm-m::before{content:"";flex:none;width:9px;height:9px;margin-top:4px;border-radius:2px;transform:rotate(45deg);background:var(--warn)}
.rm-lane{display:flex;align-items:center;padding:10px 12px 10px 0;font-size:13.5px;line-height:1.4;font-weight:650;color:var(--fg);overflow-wrap:anywhere}
.rm-it{position:relative;z-index:1;align-self:center;min-width:0;margin:5px 4px;padding:6px 10px;border-radius:8px;font-size:13px;line-height:1.4;font-weight:600;overflow-wrap:anywhere;background:${solid('--accent-soft')};color:var(--accent-ink);box-shadow:inset 3px 0 0 var(--accent)}
.rm-it .nn{display:block;font-size:11.5px;font-weight:400;opacity:.8}
.rm-it.s-done{background:var(--sunk);color:var(--muted);box-shadow:none}.rm-it.s-done::before{content:"✓ ";font-weight:800;color:var(--good)}
.rm-it.s-now{background:var(--accent);color:var(--on-accent);box-shadow:0 4px 12px -4px rgba(77,107,254,.55)}
.rm-it.s-todo{background:var(--surface);color:var(--fg2);box-shadow:none;outline:1px dashed var(--line2);outline-offset:-1px}
.rm-key{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:10px;font-size:12px;color:var(--muted)}
.rm-key span{display:inline-flex;align-items:center;gap:6px}.rm-key i{display:inline-block;width:14px;height:10px;border-radius:3px}
.rm-key .k-done{background:var(--sunk);box-shadow:inset 0 0 0 1px var(--line2)}.rm-key .k-now{background:var(--accent)}.rm-key .k-todo{border:1px dashed var(--line2)}
@media print{*,::before,::after{box-shadow:none!important;text-shadow:none!important}.mm-bar{display:none}.rm-wrap{overflow:visible;-webkit-mask-image:none!important;mask-image:none!important}.rm{grid-template-columns:minmax(64px,auto) repeat(var(--n),minmax(0,1fr))}}
@media (max-width:560px){body{padding:24px 18px 28px}
.ev{grid-template-columns:22px 1fr}.ev::before{left:10px}.ev .when{grid-column:2;grid-row:1;padding:0;text-align:left}.ev .rail{grid-column:1;grid-row:1/3}.ev .body{grid-column:2;grid-row:2}
.ev.s-now .body{margin-top:4px}
.list .row{grid-template-columns:1fr;gap:2px}.face{min-height:220px;padding:44px 22px}.face .big{font-size:30px}.keys{display:none}
.fc-nav{gap:6px}.fc-nav #no,.fc-nav #yes{min-width:0;padding:7px 16px}.fc-nav .quiet{padding:5px 8px}
.item{padding:18px}.q{padding:18px}
.rt.wl .rt-layer{grid-template-columns:1fr;gap:8px}.rt-lab{justify-self:start;justify-content:flex-start;max-width:100%;padding:5px 12px;text-align:left}.rt-lab:empty{display:none}.rt.wl .rt-ar{margin-left:0}
.rt-n{flex-basis:100px;min-width:84px}.rt-g{flex-basis:120px}
.rm{grid-template-columns:76px repeat(var(--n),minmax(68px,1fr))}.rm-lane{font-size:12.5px;padding-right:8px}.rm-it{margin:4px 2px;padding:5px 7px;font-size:12px}}`

// ── 页面里跑的小脚本 ─────────────────────────────────────────────────────────
// 下面这些函数原样转成字符串塞进页面：只用浏览器里有的东西（store / $ / $$ / onStore / t / T 来自 COMMON）

const COMMON = `var store={get:function(k,d){try{var v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(e){return d}},set:function(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
function onStore(k,fn){addEventListener('storage',function(e){if(e.key===null||e.key===k)fn()})}
function $(s,el){return (el||document).querySelector(s)}
function $$(s,el){return Array.prototype.slice.call((el||document).querySelectorAll(s))}
function t(k,o){return String(T[k]).replace(/\\{(\\w+)\\}/g,function(_,x){return o&&o[x]!==undefined?o[x]:''})}
function confirmButton(b,label,fn){var at=0,orig=b.textContent;b.addEventListener('click',function(){if(at&&Date.now()-at<3000){at=0;b.textContent=orig;fn()}else{at=Date.now();b.textContent=label;setTimeout(function(){if(at&&Date.now()-at>=2900){at=0;b.textContent=orig}},3000)}})}
`

/* global store, $, $$, onStore, t, T, confirmButton */

function compareClient() {
  var K = 'compare', DEF = JSON.parse($('#data').textContent).def
  var diff = $('#diff')
  function paint() {
    var s = store.get(K, {}), view = s.view === 'cards' || s.view === 'table' ? s.view : DEF
    $$('.seg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.v === view)) })
    $('.cmp-cards').hidden = view !== 'cards'
    $('.cmp-table').hidden = view !== 'table'
    document.body.classList.toggle('diff', !!(diff && s.diff))
    if (diff) diff.checked = !!s.diff
  }
  $$('.seg button').forEach(function (b) {
    b.addEventListener('click', function () { var s = store.get(K, {}); s.view = b.dataset.v; store.set(K, s); paint() })
  })
  if (diff) diff.addEventListener('change', function () { var s = store.get(K, {}); s.diff = diff.checked; store.set(K, s); paint() })
  onStore(K, paint)
  paint()
}

function checklistClient() {
  var K = 'checklist', H = 'checklist:hide', hide = $('#hide')
  function paint() {
    var d = store.get(K, []), n = 0, all = $$('.todo')
    all.forEach(function (el) {
      var on = d.indexOf(el.dataset.k) >= 0
      el.classList.toggle('done', on)
      $('input', el).checked = on
      if (on) n++
    })
    $$('.grp').forEach(function (g) {
      var items = $$('.todo', g), c = items.filter(function (el) { return el.classList.contains('done') }).length, s = $('.cnt', g)
      if (s) s.textContent = c + ' / ' + items.length
      g.classList.toggle('full', c === items.length)
    })
    var pct = (all.length ? Math.round(n * 100 / all.length) : 0) + '%'
    $('.prog .fill').style.width = pct
    $('.prog .pct').textContent = pct
    $('.prog .txt').textContent = t('done', { n: n, m: all.length })
    $('.prog').classList.toggle('full', !!all.length && n === all.length)
    var h = !!store.get(H, false)
    document.body.classList.toggle('hide-done', h)
    hide.checked = h
    $('.alldone').hidden = !(all.length && n === all.length)
  }
  $$('.todo input').forEach(function (inp) {
    inp.addEventListener('change', function () {
      var d = store.get(K, []), k = inp.closest('.todo').dataset.k, at = d.indexOf(k)
      if (inp.checked && at < 0) d.push(k)
      if (!inp.checked && at >= 0) d.splice(at, 1)
      store.set(K, d)
      paint()
    })
  })
  hide.addEventListener('change', function () { store.set(H, hide.checked); paint() })
  confirmButton($('#reset'), T.again, function () { store.set(K, []); paint() })
  onStore(K, paint)
  onStore(H, paint)
  paint()
}

function dashboardClient() {
  var CH = JSON.parse($('#data').textContent)
  var CJK = /[㐀-鿿]/.test(document.title + document.body.textContent.slice(0, 400))
  var NS = 'http://www.w3.org/2000/svg'
  function color(i) { return 'var(--c' + (i % 8 + 1) + ')' }
  function trim(v) { return String(+v.toFixed(Math.abs(v) < 10 ? 2 : 1)) }
  function fmt(v) {
    var a = Math.abs(v)
    if (CJK) { if (a >= 1e8) return trim(v / 1e8) + '亿'; if (a >= 1e4) return trim(v / 1e4) + '万' }
    else { if (a >= 1e9) return trim(v / 1e9) + 'B'; if (a >= 1e6) return trim(v / 1e6) + 'M'; if (a >= 1e4) return trim(v / 1e3) + 'k' }
    return trim(v)
  }
  function full(v, unit) { return (+v.toFixed(4)).toLocaleString() + (unit || '') }
  function nice(x) {
    if (!(x > 0)) return 1
    var e = Math.pow(10, Math.floor(Math.log10(x))), f = x / e
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e
  }
  function tw(s) { var w = 0; s = String(s); for (var i = 0; i < s.length; i++) w += s.charCodeAt(i) > 255 ? 11.5 : 6.6; return w }
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag)
    for (var k in attrs) e.setAttribute(k, attrs[k])
    if (parent) parent.appendChild(e)
    return e
  }
  function label(parent, x, y, s, anchor, cls) { var e = el('text', { x: x, y: y, 'text-anchor': anchor, class: cls || 'axis' }, parent); e.textContent = s; return e }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] }) }

  function draw(box, c) {
    var W = box.clientWidth, H = box.clientHeight
    if (!W) return
    var old = box.querySelector('svg')
    if (old) old.remove()
    var svg = el('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H })
    box.insertBefore(svg, box.firstChild)
    var tip = box.querySelector('.tip')
    function show(html, x, y) {
      tip.innerHTML = html
      tip.style.opacity = 1
      var w = tip.offsetWidth, h = tip.offsetHeight
      var left = x + 14 + w > W ? x - 14 - w : x + 14
      tip.style.transform = 'translate(' + Math.max(0, Math.min(W - w, left)) + 'px,' + Math.max(0, Math.min(H - h, y)) + 'px)'
    }
    function hide() { tip.style.opacity = 0 }

    if (c.type === 'pie') {
      var v = c.series[0].values, sum = v.reduce(function (a, b) { return a + b }, 0)
      var cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 4, r0 = R * 0.72, rm = (R + r0) / 2, C = 2 * Math.PI * rm, acc = 0
      var g = el('g', { transform: 'rotate(-90 ' + cx + ' ' + cy + ')' }, svg), slices = []
      var many = v.filter(function (x) { return x > 0 }).length > 1
      v.forEach(function (x, i) {
        if (!(x > 0) || !sum) return
        var len = x / sum * C, seg = Math.max(0.5, len - (many ? Math.min(3, len / 3) : 0))
        var s = el('circle', { cx: cx, cy: cy, r: rm, style: 'fill:none;stroke:' + color(i) + ';stroke-width:' + (R - r0) + ';stroke-dasharray:' + seg + ' ' + (C - seg) + ';stroke-dashoffset:' + (-acc) + ';transition:opacity .15s' }, g)
        acc += len
        slices.push(s)
        s.addEventListener('pointermove', function (e) {
          var r = svg.getBoundingClientRect()
          slices.forEach(function (o) { o.style.opacity = o === s ? 1 : 0.35 })
          show('<b>' + esc(c.labels[i]) + '</b><div>' + esc(full(x, c.unit)) + ' · ' + Math.round(x / sum * 1000) / 10 + '%</div>', e.clientX - r.left, e.clientY - r.top - 24)
        })
        s.addEventListener('pointerleave', function () { slices.forEach(function (o) { o.style.opacity = 1 }); hide() })
      })
      label(svg, cx, cy + 4, fmt(sum) + (c.unit && c.unit.length <= 2 ? c.unit : ''), 'middle', 'pie-v')
      label(svg, cx, cy + 24, T.total, 'middle')
      return
    }

    var vals = []
    c.series.forEach(function (s) { vals = vals.concat(s.values) })
    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals)
    if (c.type === 'bar') { mn = Math.min(0, mn); mx = Math.max(0, mx) }
    if (mn === mx) { mx += Math.abs(mx) || 1; mn -= c.type === 'bar' ? 0 : Math.abs(mn) || 1 }
    var step = nice((mx - mn) / 4), lo = Math.floor(mn / step + 1e-9) * step, hi = Math.ceil(mx / step - 1e-9) * step
    if (c.type === 'bar') lo = Math.min(lo, 0)
    var ticks = []
    for (var v0 = lo; v0 <= hi + step / 2; v0 += step) ticks.push(+v0.toFixed(10))
    var x0 = Math.max.apply(null, ticks.map(function (x) { return tw(fmt(x)) })) + 10, x1 = W - 4, y0 = 8, y1 = H - 24
    var n = c.labels.length, band = (x1 - x0) / n
    function Y(x) { return y1 - (x - lo) / (hi - lo || 1) * (y1 - y0) }
    function X(i) { return x0 + band * (i + 0.5) }
    ticks.forEach(function (x) {
      el('line', { x1: x0, x2: x1, y1: Y(x), y2: Y(x), class: x === 0 || x === lo ? 'grid base' : 'grid' }, svg)
      label(svg, x0 - 8, Y(x) + 4, fmt(x), 'end')
    })
    var every = Math.max(1, Math.ceil((Math.max.apply(null, c.labels.map(tw)) + 10) / band))
    c.labels.forEach(function (l, i) { if (i % every === 0) label(svg, X(i), H - 6, l, 'middle') })
    var mark = c.type === 'bar' ? el('rect', { y: y0, height: y1 - y0, width: band, class: 'hlb', opacity: 0 }, svg) : el('line', { y1: y0, y2: y1, class: 'guide', opacity: 0 }, svg)

    if (c.type === 'bar') {
      var m = c.series.length, gw = Math.min(band * (m > 1 ? 0.8 : 0.56), m * 32), bw = gw / m
      c.series.forEach(function (s, j) {
        s.values.forEach(function (x, i) {
          // 数值那头圆角 4，贴着基线那头是直的；并排的柱子之间留 2px
          var top = Y(Math.max(x, 0)), bot = Y(Math.min(x, 0)), pad = m > 1 ? 1 : 0
          var bx = X(i) - gw / 2 + j * bw + pad, w = Math.max(1, bw - pad * 2), hgt = Math.max(x ? 1 : 0, bot - top), r = Math.min(4, w / 2, hgt)
          var d = x >= 0
            ? 'M' + bx + ',' + bot + 'V' + (top + r) + 'Q' + bx + ',' + top + ' ' + (bx + r) + ',' + top + 'H' + (bx + w - r) + 'Q' + (bx + w) + ',' + top + ' ' + (bx + w) + ',' + (top + r) + 'V' + bot + 'Z'
            : 'M' + bx + ',' + top + 'V' + (bot - r) + 'Q' + bx + ',' + bot + ' ' + (bx + r) + ',' + bot + 'H' + (bx + w - r) + 'Q' + (bx + w) + ',' + bot + ' ' + (bx + w) + ',' + (bot - r) + 'V' + top + 'Z'
          el('path', { d: d, style: 'fill:' + color(j) }, svg)
        })
      })
    } else {
      c.series.forEach(function (s, j) {
        var d = s.values.map(function (x, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(x).toFixed(1) }).join('')
        if (c.series.length === 1 && n > 1) {
          var gid = 'fade' + box.dataset.i, grad = el('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, el('defs', {}, svg))
          el('stop', { offset: 0, style: 'stop-color:' + color(j) + ';stop-opacity:.2' }, grad)
          el('stop', { offset: 1, style: 'stop-color:' + color(j) + ';stop-opacity:0' }, grad)
          el('path', { d: d + 'L' + X(n - 1).toFixed(1) + ',' + y1 + 'L' + X(0).toFixed(1) + ',' + y1 + 'Z', style: 'fill:url(#' + gid + ');stroke:none' }, svg)
        }
        el('path', { d: d, style: 'fill:none;stroke:' + color(j) + ';stroke-width:2;stroke-linejoin:round;stroke-linecap:round' }, svg)
        if (n <= 24) s.values.forEach(function (x, i) { el('circle', { cx: X(i), cy: Y(x), r: 4, style: 'fill:var(--surface);stroke:' + color(j) + ';stroke-width:2' }, svg) })
      })
    }
    var hit = el('rect', { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0), style: 'fill:transparent' }, svg)
    function at(e) {
      var r = svg.getBoundingClientRect(), i = Math.max(0, Math.min(n - 1, Math.floor((e.clientX - r.left - x0) / band)))
      if (c.type === 'bar') mark.setAttribute('x', x0 + band * i)
      else { mark.setAttribute('x1', X(i)); mark.setAttribute('x2', X(i)) }
      mark.setAttribute('opacity', 1)
      show('<b>' + esc(c.labels[i]) + '</b>' + c.series.map(function (s, j) {
        return '<div><i style="background:' + color(j) + '"></i>' + (s.name ? esc(s.name) + '：' : '') + esc(full(s.values[i], c.unit)) + '</div>'
      }).join(''), X(i), y0)
    }
    hit.addEventListener('pointermove', at)
    hit.addEventListener('pointerdown', at)
    hit.addEventListener('pointerleave', function () { mark.setAttribute('opacity', 0); hide() })
  }

  $$('.cv').forEach(function (box) {
    var c = CH[+box.dataset.i], w = -1, h = -1
    function go() { if (box.clientWidth !== w || box.clientHeight !== h) { w = box.clientWidth; h = box.clientHeight; draw(box, c) } }
    go()
    if (window.ResizeObserver) new ResizeObserver(function () { requestAnimationFrame(go) }).observe(box)
  })
}

function flashcardsClient() {
  var CARDS = JSON.parse($('#data').textContent), K = 'flashcards'
  var card = $('#card'), only = $('#only'), flipped = false, last = -1
  function st() {
    var s = store.get(K, {})
    return {
      i: Math.max(0, s.i | 0),
      known: Array.isArray(s.known) ? s.known : [],
      only: !!s.only,
      order: Array.isArray(s.order) && s.order.length === CARDS.length ? s.order : null,
    }
  }
  function seq(s) {
    var o = s.order || CARDS.map(function (_, i) { return i })
    return s.only ? o.filter(function (i) { return s.known.indexOf(CARDS[i].k) < 0 }) : o
  }
  function paint() {
    var s = st(), q = seq(s), pos = Math.min(s.i, q.length - 1)
    only.checked = s.only
    var kc = CARDS.filter(function (c) { return s.known.indexOf(c.k) >= 0 }).length
    $('#kn').textContent = t('known', { k: kc })
    $('#kn').className = 'chip ' + (kc ? 'good' : 'mute')
    $('#shuf').textContent = s.order ? T.order : T.shuffle
    $$('.list .row').forEach(function (r) { r.classList.toggle('k', s.known.indexOf(r.dataset.k) >= 0) })
    var empty = !q.length
    $('.fc-done').hidden = !empty
    card.hidden = empty
    $('.fc-nav').hidden = empty
    $('.keys').hidden = empty
    $('#pos').textContent = empty ? '' : t('card', { i: pos + 1, n: q.length })
    var dots = $('#dots')
    dots.hidden = empty || q.length > 60
    dots.innerHTML = q.map(function (ci, j) { return '<i class="' + (j === pos ? 'cur' : s.known.indexOf(CARDS[ci].k) >= 0 ? 'k' : '') + '"></i>' }).join('')
    if (empty) return
    var c = CARDS[q[pos]]
    if (q[pos] !== last) { flipped = false; last = q[pos] }
    card.classList.toggle('flip', flipped)
    $('#f').innerHTML = c.f
    $('#f').classList.toggle('long', !!c.fl)
    $('#f').classList.toggle('huge', !!c.fs)
    $('#h').innerHTML = c.h ? '💡 ' + c.h : ''
    $('#b').innerHTML = c.b
    $('#b').classList.toggle('long', !!c.long)
    $('#b').classList.toggle('short', !!c.short)
    $('#prev').disabled = pos <= 0
    $('#next').disabled = pos >= q.length - 1
    $('#yes').classList.toggle('on', s.known.indexOf(c.k) >= 0)
  }
  function go(d) {
    var s = st(), q = seq(s)
    s.i = Math.max(0, Math.min(q.length - 1, Math.min(s.i, q.length - 1) + d))
    store.set(K, s)
    paint()
  }
  function mark(yes) {
    var s = st(), q = seq(s)
    if (!q.length) return
    var pos = Math.min(s.i, q.length - 1), k = CARDS[q[pos]].k, at = s.known.indexOf(k)
    if (yes && at < 0) s.known.push(k)
    if (!yes && at >= 0) s.known.splice(at, 1)
    // 只看没记住的：记住的这张出队了，原位置上就是下一张
    s.i = yes && s.only ? pos : Math.min(pos + 1, q.length - 1)
    store.set(K, s)
    paint()
  }
  card.addEventListener('click', function () { flipped = !flipped; card.classList.toggle('flip', flipped) })
  $('#prev').addEventListener('click', function () { go(-1) })
  $('#next').addEventListener('click', function () { go(1) })
  $('#yes').addEventListener('click', function () { mark(true) })
  $('#no').addEventListener('click', function () { mark(false) })
  only.addEventListener('change', function () { var s = st(); s.only = only.checked; s.i = 0; store.set(K, s); paint() })
  $('#shuf').addEventListener('click', function () {
    var s = st()
    if (s.order) s.order = null
    else {
      var o = CARDS.map(function (_, i) { return i })
      for (var i = o.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), x = o[i]; o[i] = o[j]; o[j] = x }
      s.order = o
    }
    s.i = 0
    store.set(K, s)
    paint()
  })
  $('#restart').addEventListener('click', function () { var s = st(); s.known = []; s.i = 0; store.set(K, s); paint() })
  document.addEventListener('keydown', function (e) {
    if (e.target.closest && e.target.closest('input,textarea,select,summary')) return
    if (e.key === 'ArrowRight') go(1)
    else if (e.key === 'ArrowLeft') go(-1)
    else if ((e.key === ' ' || e.key === 'Enter') && (e.target === document.body || e.target === card)) { e.preventDefault(); card.click() }
  })
  onStore(K, paint)
  paint()
}

function quizClient() {
  var K = 'quiz', L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  function paint() {
    var st = store.get(K, {}), right = 0, done = 0, qs = $$('.q'), dots = $$('.qdots i')
    qs.forEach(function (q, i) {
      var a = +q.dataset.a, opts = $$('.opt', q), c = st[q.dataset.k], has = typeof c === 'number' && c >= 0 && c < opts.length
      q.classList.toggle('done', has)
      opts.forEach(function (o) {
        var j = +o.dataset.j
        o.disabled = has
        o.classList.toggle('right', has && j === a)
        o.classList.toggle('wrong', has && j === c && c !== a)
      })
      var ex = $('.exp', q), res = $('.res', ex)
      ex.hidden = !has
      if (dots[i]) dots[i].className = has ? (c === a ? 'ok' : 'no') : ''
      if (!has) return
      done++
      if (c === a) right++
      res.className = 'res ' + (c === a ? 'ok' : 'no')
      res.textContent = c === a ? T.right : t('wrong', { k: L[a] })
    })
    $('#sc').textContent = right + ' / ' + qs.length
    $('#an').textContent = t('answered', { a: done, n: qs.length })
    var fin = $('.final')
    fin.hidden = done < qs.length
    fin.textContent = t('finished', { s: right, n: qs.length })
  }
  $$('.opt').forEach(function (o) {
    o.addEventListener('click', function () {
      var q = o.closest('.q'), st = store.get(K, {})
      if (typeof st[q.dataset.k] === 'number') return
      st[q.dataset.k] = +o.dataset.j
      store.set(K, st)
      paint()
    })
  })
  $('#reset').addEventListener('click', function () { store.set(K, {}); paint() })
  onStore(K, paint)
  paint()
}

function flowClient() {
  var G = JSON.parse($('#data').textContent), wrap = $('.flow'), svg = $('svg', wrap), NS = 'http://www.w3.org/2000/svg'
  // 分支上写「是 / 否」的标签带上好 / 不好的颜色
  var YES = /^(是|对|通过|同意|批准|有|成功|yes|y|ok|true|pass|approved?)$/i, NO = /^(否|不|不是|不通过|拒绝|驳回|没有|无|失败|no|n|false|fail|rejected?)$/i
  var els = []
  $$('.node', wrap).forEach(function (el) { els[+el.dataset.i] = el })
  function draw() {
    var W = wrap.getBoundingClientRect()
    if (!W.width) return
    $$('.elabel', wrap).forEach(function (x) { x.remove() })
    $$('path.e', svg).forEach(function (x) { x.remove() })
    var B = els.map(function (el) {
      var r = el.getBoundingClientRect()
      return { x: r.left - W.left, y: r.top - W.top, w: r.width, h: r.height, cx: r.left - W.left + r.width / 2 }
    })
    var minX = Math.min.apply(null, B.map(function (b) { return b.x })), maxX = Math.max.apply(null, B.map(function (b) { return b.x + b.w }))
    // 一个节点往下连好几条：出口按对面的左右顺序错开，不叠在一起
    var off = {}, outs = {}, ins = {}
    G.edges.forEach(function (e, k) {
      if (G.rank[e[1]] - G.rank[e[0]] !== 1) return
      ;(outs[e[0]] = outs[e[0]] || []).push(k)
      ;(ins[e[1]] = ins[e[1]] || []).push(k)
    })
    function spread(groups, end, other) {
      Object.keys(groups).forEach(function (n) {
        var list = groups[n].sort(function (p, q) { return B[G.edges[p][other]].cx - B[G.edges[q][other]].cx })
        var gap = Math.min(16, B[n].w / (list.length + 1))
        list.forEach(function (k, i) { (off[k] = off[k] || [0, 0])[end] = (i - (list.length - 1) / 2) * gap })
      })
    }
    spread(outs, 0, 1)
    spread(ins, 1, 0)
    var left = 0, right = 0
    G.edges.forEach(function (e, k) {
      var a = B[e[0]], b = B[e[1]], dr = G.rank[e[1]] - G.rank[e[0]], d, lx, ly, X
      var ay = a.y + a.h / 2, by = b.y + b.h / 2
      if (e[0] === e[1]) {
        var sx = a.x + a.w
        d = 'M' + sx + ',' + (ay - 6) + 'C' + (sx + 34) + ',' + (ay - 26) + ' ' + (sx + 34) + ',' + (ay + 26) + ' ' + (sx + 1) + ',' + (ay + 6)
        lx = sx + 30; ly = ay
      } else if (dr === 1) {
        var o = off[k] || [0, 0], x1 = a.cx + o[0], y1 = a.y + a.h, x2 = b.cx + o[1], y2 = b.y - 1, my = (y1 + y2) / 2
        d = 'M' + x1 + ',' + y1 + 'C' + x1 + ',' + my + ' ' + x2 + ',' + my + ' ' + x2 + ',' + y2
        lx = (x1 + x2) / 2; ly = my
      } else if (dr > 1) {
        // 跨了好几行往下：从左边绕，不穿过中间的节点
        left++
        X = minX - 4 - left * 12
        d = 'M' + a.x + ',' + ay + 'H' + (X + 8) + 'Q' + X + ',' + ay + ' ' + X + ',' + (ay + 8) + 'V' + (by - 8) + 'Q' + X + ',' + by + ' ' + (X + 8) + ',' + by + 'H' + (b.x - 1)
        lx = X; ly = (ay + by) / 2
      } else {
        // 往回连（循环）：从右边绕上去
        right++
        X = maxX + 4 + right * 12
        var ex = a.x + a.w, bx = b.x + b.w
        d = 'M' + ex + ',' + ay + 'H' + (X - 8) + 'Q' + X + ',' + ay + ' ' + X + ',' + (ay - 8) + 'V' + (by + 8) + 'Q' + X + ',' + by + ' ' + (X - 8) + ',' + by + 'H' + (bx + 1)
        lx = X; ly = (ay + by) / 2
      }
      var p = document.createElementNS(NS, 'path')
      p.setAttribute('d', d)
      p.setAttribute('class', 'e')
      p.setAttribute('marker-end', 'url(#ah)')
      svg.appendChild(p)
      if (e[2]) {
        var l = document.createElement('div')
        l.className = 'elabel' + (YES.test(e[2]) ? ' yes' : NO.test(e[2]) ? ' no' : '')
        l.textContent = e[2]
        l.style.left = lx + 'px'
        l.style.top = ly + 'px'
        wrap.appendChild(l)
      }
    })
  }
  var w = -1
  function go() { var now = wrap.clientWidth; if (now !== w) { w = now; draw() } }
  draw()
  w = wrap.clientWidth
  if (window.ResizeObserver) new ResizeObserver(function () { requestAnimationFrame(go) }).observe(wrap)
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw)
}

function mindmapClient() {
  var K = 'mindmap', wrap = $('.mm'), inner = $('.mm-in', wrap), L = $('.mm-l', wrap), R = $('.mm-r', wrap), svg = $('.mm-lines', wrap), root = $('.mm-root', wrap)
  var NS = 'http://www.w3.org/2000/svg'
  function kids(b) { var k = b.children[1]; return k ? Array.prototype.slice.call(k.children) : [] }
  var tops = Array.prototype.slice.call(R.children)
  var foldable = $$('.mm-b', wrap).filter(function (b) { return kids(b).length })
  // 用户没动过折叠时的默认：节点多、全展开太高（对话里第一屏看不到中心）就从最深的一层往上收，收到不太高为止；
  // 导出（地址带 full=1）一律全展开。用户点过一次就按存下的来
  var auto = null, full = /[?&]full=1(&|$)/.test(location.search)
  function folds() { return store.get(K, null) || auto || [] }
  function depthOf(b) { var m = /\bd(\d)\b/.exec(b.className); return m ? +m[1] : 0 }
  function decide() {
    auto = []
    paintFold()
    layout()
    if (full || store.get(K, null)) return
    var lim = Math.max(1000, wrap.clientWidth * 1.3)
    var deep = foldable.reduce(function (m, b) { return Math.max(m, depthOf(b)) }, 0)
    for (var d = deep; d >= 1 && inner.offsetHeight > lim; d--) {
      auto = foldable.filter(function (b) { return depthOf(b) >= d }).map(function (b) { return b.dataset.k })
      paintFold()
      layout()
    }
  }
  function paintFold() {
    var f = folds()
    foldable.forEach(function (b) {
      var on = f.indexOf(b.dataset.k) >= 0
      b.classList.toggle('fold', on)
      b.firstElementChild.setAttribute('aria-expanded', String(!on))
      $('.mm-cnt', b.firstElementChild).hidden = !on
    })
  }
  // 两边分：按露出来的叶子数，前一半放右边、后一半放左边
  function weight(b) {
    var ks = b.classList.contains('fold') ? [] : kids(b), w = 0
    ks.forEach(function (c) { w += weight(c) })
    return w || 1
  }
  function place(two, cmp, ol) {
    wrap.classList.toggle('cmp', !!cmp)
    wrap.classList.toggle('ol', !!ol)
    tops.forEach(function (b) { R.appendChild(b) })
    if (!two) return
    var ws = tops.map(weight), total = ws.reduce(function (a, b) { return a + b }, 0), acc = 0, cut = tops.length - 1
    for (var i = 1; i < tops.length; i++) {
      acc += ws[i - 1]
      if (acc + ws[i] / 2 > total / 2) { cut = i; break }
    }
    for (var j = cut; j < tops.length; j++) L.appendChild(tops[j])
  }
  // 放得下就用：两边展开 → 两边紧凑 → 只往右 → 往右紧凑 → 都放不下就竖着缩进排（手机）
  function layout() {
    var W = wrap.clientWidth
    if (!W) return
    var tries = tops.length > 1 ? [[1, 0], [1, 1], [0, 0], [0, 1]] : [[0, 0], [0, 1]], ok = false
    for (var i = 0; i < tries.length && !ok; i++) {
      place(tries[i][0], tries[i][1], false)
      ok = inner.offsetWidth <= W + 1
    }
    if (!ok) place(false, false, true)
    draw()
  }
  function draw() {
    while (svg.lastChild) svg.removeChild(svg.lastChild)
    var W = wrap.getBoundingClientRect(), ol = wrap.classList.contains('ol')
    if (!W.width) return
    function box(el) { var r = el.getBoundingClientRect(); return { l: r.left - W.left, r: r.right - W.left, t: r.top - W.top, b: r.bottom - W.top, cy: (r.top + r.bottom) / 2 - W.top } }
    function line(p, c, ci, depth) {
      var a = box(p), b = box(c), d
      if (ol) {
        var x = a.l + 12, rr = Math.max(0, Math.min(8, b.cy - a.b, b.l - x - 2))
        d = 'M' + x + ',' + a.b + 'V' + (b.cy - rr) + 'Q' + x + ',' + b.cy + ' ' + (x + rr) + ',' + b.cy + 'H' + (b.l - 2)
      } else {
        var left = !!c.closest('.mm-l'), x1 = left ? a.l : a.r, x2 = left ? b.r : b.l, m = (x1 + x2) / 2
        d = 'M' + x1 + ',' + a.cy + 'C' + m + ',' + a.cy + ' ' + m + ',' + b.cy + ' ' + x2 + ',' + b.cy
      }
      var path = document.createElementNS(NS, 'path')
      path.setAttribute('d', d)
      path.style.stroke = 'var(--c' + ci + ')'
      path.style.strokeWidth = depth === 1 ? 2.5 : depth === 2 ? 2 : 1.5
      svg.appendChild(path)
    }
    function walk(b, depth, ci) {
      if (b.classList.contains('fold')) return
      kids(b).forEach(function (c) { line(b.firstElementChild, c.firstElementChild, ci, depth + 1); walk(c, depth + 1, ci) })
    }
    tops.forEach(function (b) { line(root, b.firstElementChild, b.dataset.c, 1); walk(b, 1, b.dataset.c) })
  }
  function paint() { paintFold(); layout() }
  function toggle(b) {
    var f = folds().slice(), at = f.indexOf(b.dataset.k)
    if (at >= 0) f.splice(at, 1)
    else f.push(b.dataset.k)
    store.set(K, f)
    paint()
  }
  foldable.forEach(function (b) {
    var n = b.firstElementChild
    n.addEventListener('click', function (e) { if (!(e.target.closest && e.target.closest('a'))) toggle(b) })
    n.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && !(e.target.closest && e.target.closest('a'))) { e.preventDefault(); toggle(b) } })
  })
  var open = $('#mm-open'), close = $('#mm-close')
  if (open) open.addEventListener('click', function () { store.set(K, []); paint() })
  if (close) close.addEventListener('click', function () { store.set(K, tops.filter(function (b) { return kids(b).length }).map(function (b) { return b.dataset.k })); paint() })
  var w = -1
  // 第一次量到宽度时定默认收到哪层（嵌进来那一刻宽度可能还是 0）
  function go() { var now = wrap.clientWidth; if (now !== w) { w = now; if (auto === null && w) decide(); else layout() } }
  w = wrap.clientWidth
  if (w) decide()
  else { paintFold(); layout() }
  if (window.ResizeObserver) new ResizeObserver(function () { requestAnimationFrame(go) }).observe(wrap)
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout)
  onStore(K, paint)
}

function lanesClient() {
  // 时间段多、横着放不下：左右能滑，哪边还有内容哪边就淡出去一截
  var w = $('.rm-wrap')
  function paint() {
    var more = w.scrollWidth > w.clientWidth + 1
    w.classList.toggle('more', more && w.scrollLeft + w.clientWidth < w.scrollWidth - 2)
    w.classList.toggle('less', more && w.scrollLeft > 2)
  }
  w.addEventListener('scroll', paint, { passive: true })
  if (window.ResizeObserver) new ResizeObserver(paint).observe(w)
  paint()
}

function routeClient() {
  var G = JSON.parse($('#data').textContent), wrap = $('.rt'), svg = $('svg', wrap), NS = 'http://www.w3.org/2000/svg'
  var YES = /^(是|对|通过|同意|批准|有|成功|yes|y|ok|true|pass|approved?)$/i, NO = /^(否|不|不是|不通过|拒绝|驳回|没有|无|失败|no|n|false|fail|rejected?)$/i
  // 绕线用：4px 一格；拐弯、不从原定那条边出入都加价
  var CELL = 4, TURN = 6, SIDE = 12
  var DX = [1, -1, 0, 0], DY = [0, 0, 1, -1]
  var OUT = { r: 0, l: 1, b: 2, t: 3 }, IN = { l: 0, r: 1, t: 2, b: 3 }
  var els = []
  $$('.rt-n', wrap).forEach(function (el) { els[+el.dataset.i] = el })
  var layerEls = $$('.rt-layer', wrap)
  // 说明找不到不压东西的地方：把放说明的那道缝拉开再画一遍（最多拉三回）；每次重画先把拉开的还原。
  // 同一层左右挨着的线放不下说明：不往右推方框（手机上会挤出屏幕），改成从两个方框下面绕，说明放在下面那道缝里
  // 拉了三回还放不下（同一排好几条线都带长说明之类）：这几条的说明改成脚注——线上只标个小号码，完整的话列在图下面
  var under = {}, fn = {}, notes = null
  function rounds() {
    layerEls.concat(els).forEach(function (x) { x.style.marginTop = '' })
    wrap.style.paddingBottom = ''
    under = {}
    for (var round = 0; ; round++) {
      var r = drawOnce()
      if (!r) return []
      var keys = Object.keys(r.grow)
      if (!keys.length || round === 3) return r.miss
      keys.forEach(function (k) { var g = r.grow[k]; g.el.style[g.prop] = (parseFloat(getComputedStyle(g.el)[g.prop]) || 0) + g.px + 'px' })
    }
  }
  function num(a, b) { return a - b }
  function draw() {
    fn = {}
    var miss = []
    for (var phase = 0; phase < 3; phase++) {
      var n = 0
      Object.keys(fn).sort(num).forEach(function (k) { fn[k] = ++n })
      miss = rounds()
      var more = miss.filter(function (m) { return !(m.k in fn) })
      if (!more.length) break
      more.forEach(function (m) { fn[m.k] = 0 })
    }
    // 号码也放不下的（极少）：线上不标，只在下面列出来，免得压住东西
    miss.forEach(function (m) { if (m.el.parentNode) m.el.parentNode.removeChild(m.el); if (!(m.k in fn)) fn[m.k] = 0 })
    var top = 0
    Object.keys(fn).forEach(function (k) { top = Math.max(top, fn[k]) })
    Object.keys(fn).sort(num).forEach(function (k) { if (!fn[k]) fn[k] = ++top })
    if (notes && notes.parentNode) notes.parentNode.removeChild(notes)
    notes = null
    var ks = Object.keys(fn).sort(function (a, b) { return fn[a] - fn[b] })
    if (!ks.length) return
    notes = document.createElement('ol')
    notes.className = 'rt-notes'
    ks.forEach(function (k) {
      var e = G.links[k], li = document.createElement('li'), b = document.createElement('span'), t = document.createElement('span')
      b.className = 'rt-fnum'
      b.textContent = fn[k]
      t.textContent = nameOf(e[0]) + ' → ' + nameOf(e[1]) + '：' + e[2]
      li.appendChild(b)
      li.appendChild(t)
      notes.appendChild(li)
    })
    wrap.parentNode.insertBefore(notes, wrap.nextSibling)
  }
  // 方框上的字（不带下面的小字备注）
  function nameOf(i) {
    var el = els[i], nn = $('.nn', el), t = el.textContent
    return (nn ? t.slice(0, t.length - nn.textContent.length) : t).trim()
  }
  function drawOnce() {
    var W = wrap.getBoundingClientRect()
    if (!W.width) return null
    $$('.elabel', wrap).forEach(function (x) { x.parentNode.removeChild(x) })
    $$('path.e', svg).forEach(function (x) { x.parentNode.removeChild(x) })
    function rect(el) {
      var r = el.getBoundingClientRect()
      return { l: r.left - W.left, r: r.right - W.left, t: r.top - W.top, b: r.bottom - W.top, cx: (r.left + r.right) / 2 - W.left, cy: (r.top + r.bottom) / 2 - W.top }
    }
    var B = els.map(rect)
    var marks = $$('.rt-lab, .rt-gt span', wrap).map(rect).filter(function (r) { return r.r > r.l })
    var grid = null, placed = [], grow = {}, miss = []
    // 每条线从哪条边出、进哪条边：往下 / 往上走上下边，同一层走左右边
    var ends = G.links.map(function (e) {
      var la = G.layer[e[0]], lb = G.layer[e[1]], A = B[e[0]], Z = B[e[1]]
      if (lb > la) return ['b', 't']
      if (lb < la) return ['t', 'b']
      // 同一层：左右挨着走左右边；组里上下摞着的（横向有重叠）走上下边
      if (A.l < Z.r && Z.l < A.r) return Z.cy >= A.cy ? ['b', 't'] : ['t', 'b']
      return Z.cx >= A.cx ? ['r', 'l'] : ['l', 'r']
    })
    // 同一条边上出入好几条：按对面的位置错开
    var groups = {}, off = {}
    G.links.forEach(function (e, k) {
      ;(groups[e[0] + ends[k][0]] = groups[e[0] + ends[k][0]] || []).push([k, 0])
      ;(groups[e[1] + ends[k][1]] = groups[e[1] + ends[k][1]] || []).push([k, 1])
    })
    Object.keys(groups).forEach(function (g) {
      var list = groups[g], side = g.slice(-1), n = G.links[list[0][0]][list[0][1]], horiz = side === 't' || side === 'b'
      list.sort(function (p, q) {
        var po = B[G.links[p[0]][1 - p[1]]], qo = B[G.links[q[0]][1 - q[1]]]
        return horiz ? po.cx - qo.cx : po.cy - qo.cy
      })
      var len = horiz ? B[n].r - B[n].l : B[n].b - B[n].t, gap = Math.min(16, len / (list.length + 1))
      list.forEach(function (it, i) { (off[it[0]] = off[it[0]] || [0, 0])[it[1]] = (i - (list.length - 1) / 2) * gap })
    })
    function pt(b, side, o) {
      if (side === 'b') return [b.cx + o, b.b]
      if (side === 't') return [b.cx + o, b.t - 1]
      if (side === 'r') return [b.r, b.cy + o]
      return [b.l - 1, b.cy + o]
    }
    G.links.forEach(function (e, k) {
      var o = off[k] || [0, 0], s = ends[k], p = pt(B[e[0]], s[0], o[0]), q = pt(B[e[1]], s[1], o[1]), d
      if (s[1] === 'b') q[1] += 1
      else if (s[1] === 'r') q[0] += 1
      var c1, c2
      if (s[0] === 'b' || s[0] === 't') {
        var my = (p[1] + q[1]) / 2
        c1 = [p[0], my]; c2 = [q[0], my]
      } else {
        var mx = (p[0] + q[0]) / 2
        c1 = [mx, p[1]]; c2 = [mx, q[1]]
      }
      d = 'M' + p + 'C' + c1 + ' ' + c2 + ' ' + q
      // 直连会从别的方框（跨层、组里上下摞着的、手机上换了行的）或者阶段名上穿过去：在格子上找条横平竖直的路绕开
      if (under[k] || crosses(p, c1, c2, q, e[0], e[1])) {
        grid = grid || makeGrid(W)
        var dir = B[e[1]].cx >= B[e[0]].cx ? 8 : -8
        var r = under[k] ? detour(grid, e[0], e[1], 'b', 'b', dir, -dir, true) : detour(grid, e[0], e[1], s[0], s[1], o[0], o[1])
        if (r) d = r
      }
      var path = document.createElementNS(NS, 'path')
      path.setAttribute('d', d)
      path.setAttribute('class', 'e')
      path.setAttribute('marker-end', 'url(#rah)')
      svg.appendChild(path)
      if (e[2]) {
        // 改成脚注的：线上只放号码（鼠标停上去看全文），离方框近一点也行
        var foot = k in fn, pad = foot ? 4 : 8, l = document.createElement('div')
        l.className = 'elabel' + (foot ? ' fn' : YES.test(e[2]) ? ' yes' : NO.test(e[2]) ? ' no' : '')
        l.textContent = foot ? fn[k] : e[2]
        if (foot) l.title = e[2]
        l.style.left = l.style.top = '0px'
        wrap.appendChild(l)
        // 说明长了会换行（先在左上角量好宽高、定住宽度，免得放到靠边的地方被挤窄）；
        // 沿着线从中间往两头找，放在不压方框、阶段名、别的说明的地方；也别伸出页面左右边
        var lw = l.offsetWidth, lh = l.offsetHeight, L = path.getTotalLength(), spot = null
        l.style.width = lw + 'px'
        var tries = []
        ;[0.5, 0.4, 0.6, 0.3, 0.7, 0.22, 0.78, 0.15, 0.85].forEach(function (f) { [0, lh / 2 + 6, -lh / 2 - 6].forEach(function (dy) { tries.push([f, dy]) }) })
        tries.some(function (t) {
          var c = path.getPointAtLength(L * t[0]), x = Math.max(lw / 2 + 2, Math.min(W.width - lw / 2 - 2, c.x)), y = c.y + t[1]
          var rr = { l: x - lw / 2, r: x + lw / 2, t: y - lh / 2, b: y + lh / 2 }
          if (!spot) spot = [x, y]
          var free = rr.t > 0 && B.every(function (o) { return !overlap(rr, o, pad) }) && marks.every(function (o) { return !overlap(rr, o, 3) }) && placed.every(function (o) { return !overlap(rr, o, 4) })
          if (free) { spot = [x, y]; rr.who = k; placed.push(rr) }
          return free
        })
        if (!placed.length || placed[placed.length - 1].who !== k) {
          miss.push({ k: k, el: l })
          // 哪儿都放不下：不同层的拉开两层之间（下面那层往下挪）；同一层上下摞着的，下面那个方框往下挪；
          // 同一层左右挨着的，改从下面绕，拉开这一层下面那道缝（最后一层就加底部留白）
          var la = G.layer[e[0]], lb = G.layer[e[1]], sd = s[0], gk, gel, prop = 'marginTop', px = lh + 20
          if (la !== lb) gel = layerEls[Math.max(la, lb)]
          else if (sd === 'b' || sd === 't') gel = els[sd === 'b' ? e[1] : e[0]]
          else {
            under[k] = true
            px = lh + 36
            if (la + 1 < layerEls.length) gel = layerEls[la + 1]
            else { gel = wrap; prop = 'paddingBottom' }
          }
          gk = prop + (gel === wrap ? 'w' : gel.dataset.i != null ? 'n' + gel.dataset.i : 'l' + layerEls.indexOf(gel))
          if (!grow[gk] || grow[gk].px < px) grow[gk] = { el: gel, prop: prop, px: px }
        }
        l.style.left = spot[0] + 'px'
        l.style.top = spot[1] + 'px'
      }
    })
    return { grow: grow, miss: miss }
    function overlap(p, q, pad) { return p.l < q.r + pad && p.r > q.l - pad && p.t < q.b + pad && p.b > q.t - pad }

    function inside(x, y, r, pad) { return x > r.l - pad && x < r.r + pad && y > r.t - pad && y < r.b + pad }
    function crosses(p, c1, c2, q, a, b) {
      for (var i = 1; i < 40; i++) {
        var t = i / 40, u = 1 - t
        var x = u * u * u * p[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * q[0]
        var y = u * u * u * p[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * q[1]
        // 别的方框碰都不能碰；自己两头的方框不能钻进去（往里缩 2px，贴着边出入不算）
        for (var j = 0; j < B.length; j++) if (j !== a && j !== b ? inside(x, y, B[j], 1) : inside(x, y, B[j], -2)) return true
        for (var m = 0; m < marks.length; m++) if (inside(x, y, marks[m], 0)) return true
      }
      return false
    }

    // ── 绕线：4px 一格，方框外扩 3px、字外扩 2px 的格子走不了；贴着方框走、和别的绕线挤一道都多算点代价，拐弯更贵 ──
    function makeGrid(W) {
      var cols = Math.max(1, Math.ceil(W.width / CELL)), rows = Math.max(1, Math.ceil(W.height / CELL))
      var g = { cols: cols, rows: rows, bad: new Uint8Array(cols * rows), near: new Uint8Array(cols * rows), used: new Uint8Array(cols * rows) }
      function mark(arr, r, pad) {
        var c0 = Math.max(0, Math.ceil((r.l - pad) / CELL - 0.5)), c1 = Math.min(cols - 1, Math.floor((r.r + pad) / CELL - 0.5))
        var r0 = Math.max(0, Math.ceil((r.t - pad) / CELL - 0.5)), r1 = Math.min(rows - 1, Math.floor((r.b + pad) / CELL - 0.5))
        for (var y = r0; y <= r1; y++) for (var x = c0; x <= c1; x++) arr[y * cols + x] = 1
      }
      B.forEach(function (b) { mark(g.bad, b, 3); mark(g.near, b, 10) })
      marks.forEach(function (r) { mark(g.bad, r, 2) })
      return g
    }
    function detour(g, a, b, sa, sb, oa, ob, only) {
      var cols = g.cols, rows = g.rows
      function cellOf(x, y) {
        var cx = Math.floor(x / CELL), cy = Math.floor(y / CELL)
        return cx < 0 || cy < 0 || cx >= cols || cy >= rows ? -1 : cy * cols + cx
      }
      // 从哪条边出都行（原定那条不加价；only 时只认原定那条），出去 6px 那一格当起点；进的那头一样
      function ends(i, pref, o) {
        var out = []
        ;['t', 'b', 'l', 'r'].forEach(function (side) {
          var p = pt(B[i], side, side === pref ? o : 0)
          var d = OUT[side], c = cellOf(p[0] + DX[d] * 6, p[1] + DY[d] * 6)
          if (c >= 0 && !g.bad[c] && (!only || side === pref)) out.push({ side: side, p: p, c: c, cost: side === pref ? 0 : SIDE })
        })
        return out
      }
      var starts = ends(a, sa, oa), goals = ends(b, sb, ob)
      if (!starts.length || !goals.length) return null
      var goalAt = {}
      goals.forEach(function (x) { goalAt[x.c] = x })
      var N = cols * rows * 4, gs = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1)
      var hf = [], hs = []
      function push(f, st) {
        var i = hf.length
        hf.push(f); hs.push(st)
        while (i) { var u = (i - 1) >> 1; if (hf[u] <= hf[i]) break; var tf = hf[u]; hf[u] = hf[i]; hf[i] = tf; var ts = hs[u]; hs[u] = hs[i]; hs[i] = ts; i = u }
      }
      function pop() {
        var f = hf[0], st = hs[0], lf = hf.pop(), ls = hs.pop()
        if (hf.length) {
          hf[0] = lf; hs[0] = ls
          for (var i = 0; ;) {
            var l = 2 * i + 1, r = l + 1, m = i
            if (l < hf.length && hf[l] < hf[m]) m = l
            if (r < hf.length && hf[r] < hf[m]) m = r
            if (m === i) break
            var tf = hf[m]; hf[m] = hf[i]; hf[i] = tf; var ts = hs[m]; hs[m] = hs[i]; hs[i] = ts; i = m
          }
        }
        return [f, st]
      }
      function h(c) {
        var x = c % cols, y = (c - x) / cols, best = Infinity
        goals.forEach(function (gl) { var gx = gl.c % cols, gy = (gl.c - gx) / cols; best = Math.min(best, Math.abs(gx - x) + Math.abs(gy - y)) })
        return best
      }
      var startOf = {}
      starts.forEach(function (st) {
        var id = st.c * 4 + OUT[st.side]
        if (st.cost < gs[id]) { gs[id] = st.cost; startOf[id] = st; push(st.cost + h(st.c), id) }
      })
      var best = Infinity, bestSt = -1, bestGoal = null, guard = 0
      while (hf.length && guard++ < 400000) {
        var top = pop(), st = top[1]
        if (top[0] >= best) break
        var gcost = gs[st]
        if (top[0] > gcost + h(st >> 2) + 1e-9) continue
        var c = st >> 2, dir = st & 3, gl = goalAt[c]
        if (gl) {
          var tot = gcost + gl.cost + (dir === IN[gl.side] ? 0 : TURN)
          if (tot < best) { best = tot; bestSt = st; bestGoal = gl }
        }
        var x = c % cols, y = (c - x) / cols
        for (var nd = 0; nd < 4; nd++) {
          if ((nd ^ 1) === dir) continue
          var nx = x + DX[nd], ny = y + DY[nd]
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
          var nc = ny * cols + nx
          if (g.bad[nc]) continue
          var ns = nc * 4 + nd, ng = gcost + 1 + g.near[nc] + g.used[nc] * 3 + (nd === dir ? 0 : TURN)
          if (ng < gs[ns]) { gs[ns] = ng; prev[ns] = st; push(ng + h(nc), ns) }
        }
      }
      if (bestSt < 0) return null
      // 倒着走回起点，记下拐弯的那几格
      var chain = []
      for (var s2 = bestSt; s2 >= 0; s2 = prev[s2]) chain.push(s2)
      chain.reverse()
      var first = startOf[chain[0]]
      if (!first) return null
      function at(c) { var cx = c % cols, cy = (c - cx) / cols; return [cx * CELL + CELL / 2, cy * CELL + CELL / 2] }
      var pts = [first.p.slice()]
      for (var i = 0; i < chain.length; i++) {
        g.used[chain[i] >> 2] = 1
        var nextDir = i + 1 < chain.length ? chain[i + 1] & 3 : IN[bestGoal.side]
        if (nextDir !== (chain[i] & 3)) pts.push(at(chain[i] >> 2))
      }
      var q = bestGoal.p.slice()
      if (bestGoal.side === 'b') q[1] += 1
      else if (bestGoal.side === 'r') q[0] += 1
      pts.push(q)
      // 第一段、最后一段对正方框的边（格子有 4px 的零头）
      var vs = first.side === 't' || first.side === 'b', ve = bestGoal.side === 't' || bestGoal.side === 'b'
      if (pts.length > 2) { if (vs) pts[1][0] = pts[0][0]; else pts[1][1] = pts[0][1] }
      if (pts.length > 2) { var z = pts.length - 2; if (ve) pts[z][0] = q[0]; else pts[z][1] = q[1] }
      var clean = [pts[0]]
      for (var j = 1; j < pts.length; j++) { var lp = clean[clean.length - 1]; if (Math.abs(lp[0] - pts[j][0]) + Math.abs(lp[1] - pts[j][1]) > 0.5) clean.push(pts[j]) }
      // 拐角磨圆
      var d = 'M' + clean[0]
      for (var k = 1; k < clean.length; k++) {
        var A = clean[k - 1], C = clean[k], len = Math.abs(C[0] - A[0]) + Math.abs(C[1] - A[1])
        if (k < clean.length - 1) {
          var D = clean[k + 1], l2 = Math.abs(D[0] - C[0]) + Math.abs(D[1] - C[1]), rr = Math.min(8, len / 2, l2 / 2)
          var p1 = [C[0] + (A[0] - C[0]) * rr / (len || 1), C[1] + (A[1] - C[1]) * rr / (len || 1)]
          var p2 = [C[0] + (D[0] - C[0]) * rr / (l2 || 1), C[1] + (D[1] - C[1]) * rr / (l2 || 1)]
          d += 'L' + p1 + 'Q' + C + ' ' + p2
        } else d += 'L' + C
      }
      return d
    }
  }
  var w = -1
  function go() { var now = wrap.clientWidth; if (now !== w) { w = now; draw() } }
  draw()
  w = wrap.clientWidth
  if (window.ResizeObserver) new ResizeObserver(function () { requestAnimationFrame(go) }).observe(wrap)
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw)
}

// ── 各个模板 ─────────────────────────────────────────────────────────────────

function renderReport(d, ui) {
  const sections = arr(d.sections).map(obj).filter(Boolean)
  need(sections.length || text(d.summary), 'sections 至少要有一节（或者给 summary）')
  let h = text(d.summary) ? `<div class="lead">${block(d.summary)}</div>` : ''
  h += metrics(d.metrics)
  const numbered = sections.filter((s) => text(s.heading)).length >= 2
  sections.forEach((s, i) => {
    h += '<section class="sec">'
    if (text(s.heading)) h += `<h2>${numbered ? `<span class="no">${String(i + 1).padStart(2, '0')}</span>` : ''}${inline(s.heading)}</h2>`
    if (text(s.text)) h += block(s.text)
    h += bullets(s.bullets) + metrics(s.metrics) + table(s.table)
    if (text(s.note)) h += `<div class="aside">${block(s.note)}</div>`
    h += '</section>'
  })
  const src = arr(d.sources).map(text).filter(Boolean)
  if (src.length) h += `<footer class="src"><span class="lab">${ui.sources}</span><ol>${src.map((s) => `<li>${inline(s)}</li>`).join('')}</ol></footer>`
  return { body: h }
}

function renderCompare(d, ui) {
  const items = arr(d.items).map(obj).filter((x) => x && text(x.name))
  need(items.length >= 2, 'items 至少要 2 项，每项要有 name')
  const specOf = (it) => obj(it.specs) || {}
  const fields = []
  for (const f of [...arr(d.fields).map(text), ...items.flatMap((it) => Object.keys(specOf(it)))]) if (f && !fields.includes(f)) fields.push(f)
  const best = obj(d.best) || {}
  const num = (v) => { const m = /-?\d+(?:\.\d+)?/.exec(text(v).replace(/,/g, '')); return m ? Number(m[0]) : NaN }
  const bestOf = {}
  const same = {}
  for (const f of fields) {
    const vals = items.map((it) => text(specOf(it)[f]))
    same[f] = vals.every((v) => v === vals[0])
    const dir = String(best[f] || '').toLowerCase()
    if (dir !== 'high' && dir !== 'low') continue
    const ns = vals.map(num)
    const ok = ns.filter((n) => !Number.isNaN(n))
    if (ok.length < 2) continue
    const target = dir === 'high' ? Math.max(...ok) : Math.min(...ok)
    if (!ok.every((n) => n === target)) bestOf[f] = new Set(ns.map((n, i) => (n === target ? i : -1)).filter((i) => i >= 0))
  }
  const rec = text(d.recommend)
  const isRec = (it) => !!rec && text(it.name) === rec
  const sameCls = (f) => (same[f] && items.length > 1 ? ' class="same"' : '')
  const val = (it, f, i) => {
    const v = text(specOf(it)[f])
    return v ? `<span${bestOf[f] && bestOf[f].has(i) ? ' class="best"' : ''}>${inline(v)}</span>` : '<span class="muted">—</span>'
  }
  const pc = (list, kind) => bullets(list, `pc ${kind}`)
  const chipsOf = (it) => (isRec(it) ? `<span class="chip solid">${ui.pick}</span>` : '') + (text(it.badge) ? `<span class="chip">${inline(it.badge)}</span>` : '')
  // 有一张卡带标签，每张都留出那一行，下面的参数才对得齐
  const anyChips = items.some((it) => chipsOf(it))
  const cards = items.map((it, i) => {
    const pcs = pc(it.pros, 'pro') + pc(it.cons, 'con')
    return `<div class="panel item${isRec(it) ? ' rec' : ''}">${anyChips ? `<div class="top">${chipsOf(it)}</div>` : ''}<div><h3>${inline(it.name)}</h3>` +
      (text(it.headline) ? `<div class="hl">${inline(it.headline)}</div>` : '') +
      (text(it.note) ? `<div class="note">${inline(it.note)}</div>` : '') + '</div>' +
      (fields.length ? `<dl class="specs">${fields.map((f) => `<dt${sameCls(f)}>${inline(f)}</dt><dd${sameCls(f)}>${val(it, f, i)}</dd>`).join('')}</dl>` : '') +
      (pcs ? `<div>${pcs}</div>` : '') + '</div>'
  }).join('')
  const head = `<thead><tr><th></th>${items.map((it) => `<th${isRec(it) ? ' class="rec"' : ''}>${inline(it.name)}${text(it.headline) ? `<div class="hl-s">${inline(it.headline)}</div>` : ''}</th>`).join('')}</tr></thead>`
  const td = (it, h) => `<td${isRec(it) ? ' class="rec"' : ''}>${h}</td>`
  const rows = fields.map((f) => `<tr${sameCls(f)}><td>${inline(f)}</td>${items.map((it, i) => td(it, val(it, f, i))).join('')}</tr>`)
  if (items.some((it) => arr(it.pros).length)) rows.push(`<tr><td>${ui.pros}</td>${items.map((it) => td(it, pc(it.pros, 'pro'))).join('')}</tr>`)
  if (items.some((it) => arr(it.cons).length)) rows.push(`<tr><td>${ui.cons}</td>${items.map((it) => td(it, pc(it.cons, 'con'))).join('')}</tr>`)
  const def = items.length > 4 ? 'table' : 'cards'
  const hasSame = fields.some((f) => same[f]) && fields.some((f) => !same[f])
  let h = `<div class="bar"><div class="seg" role="group"><button type="button" data-v="cards" aria-pressed="${def === 'cards'}">${ui.cards}</button>` +
    `<button type="button" data-v="table" aria-pressed="${def === 'table'}">${ui.table}</button></div>` +
    (hasSame ? `<label class="toggle"><input type="checkbox" id="diff">${ui.diff}</label>` : '') + '</div>'
  h += `<div class="cmp-cards"${def === 'cards' ? '' : ' hidden'}>${cards}</div>`
  h += `<div class="panel tbl cmp-table"${def === 'table' ? '' : ' hidden'}><table>${head}<tbody>${rows.join('')}</tbody></table></div>`
  if (text(d.verdict)) h += `<div class="verdict"><span class="lab">${ui.verdict}</span>${block(d.verdict)}</div>`
  return { body: h, script: compareClient, json: { def } }
}

function renderChecklist(d, ui) {
  let groups = arr(d.groups).map(obj).filter(Boolean)
  if (!groups.length && arr(d.items).length) groups = [{ items: d.items }]
  groups = groups.map((g) => ({
    title: text(g.title),
    items: arr(g.items).map((x) => (obj(x) ? { text: text(x.text || x.title), note: text(x.note), tag: text(x.tag) } : { text: text(x) })).filter((x) => x.text),
  })).filter((g) => g.items.length)
  need(groups.length, 'groups（或 items）里至少要有一条事项')
  const tick = '<svg viewBox="0 0 12 12" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.2 5 8.6 9.5 3.4"/></svg>'
  let h = '<div class="panel prog"><b class="pct">0%</b><span class="txt"></span><div class="track"><div class="fill"></div></div></div>'
  h += groups.map((g) => `<div class="grp">${g.title ? `<h2>${inline(g.title)}<span class="cnt"></span></h2>` : ''}` +
    g.items.map((it) => `<label class="todo" data-k="${key(g.title + '\u0001' + it.text)}"><input type="checkbox" class="sr"><span class="box">${tick}</span>` +
      `<span class="t"><span class="main">${inline(it.text)}</span>${it.tag ? `<span class="chip warn">${inline(it.tag)}</span>` : ''}` +
      `${it.note ? `<span class="note">${inline(it.note)}</span>` : ''}</span></label>`).join('') + '</div>').join('')
  h += `<div class="alldone" hidden>${ui.allDone}</div>`
  h += `<div class="bar"><label class="toggle"><input type="checkbox" id="hide">${ui.hideDone}</label><span class="grow"></span><button type="button" id="reset">${ui.reset}</button></div>`
  return { body: h, script: checklistClient }
}

const CHART = { bar: 'bar', column: 'bar', line: 'line', area: 'line', pie: 'pie', donut: 'pie', doughnut: 'pie' }

function normChart(c, i) {
  const where = `第 ${i + 1} 个图${text(c.title) ? `「${text(c.title)}」` : ''}`
  const type = CHART[String(c.type || 'bar').toLowerCase()]
  need(type, `${where}：type 只能是 bar / line / pie`)
  const labels = arr(c.labels).map(text)
  let series = arr(c.series).map(obj).filter(Boolean)
  if (!series.length && Array.isArray(c.values)) series = [{ name: text(c.title), values: c.values }]
  need(labels.length && series.length, `${where}：要有 labels 和 series（或 values）`)
  series = series.map((s, j) => {
    const values = arr(s.values).map((v) => (typeof v === 'number' ? v : parseFloat(String(v).replace(/[^\d.\-]/g, ''))))
    need(values.length === labels.length, `${where}：labels 有 ${labels.length} 个，series「${text(s.name) || j + 1}」的 values 有 ${values.length} 个，要一样多`)
    need(values.every(Number.isFinite), `${where}：values 里要都是数字`)
    return { name: text(s.name), values }
  })
  if (type === 'pie') {
    series = series.slice(0, 1)
    need(series[0].values.every((v) => v >= 0), `${where}：饼图的数不能是负的`)
  }
  return { type, title: text(c.title), labels, series, unit: text(c.unit) }
}

function legend(c) {
  const dot = (i) => `<i style="background:var(--c${i % 8 + 1})"></i>`
  if (c.type === 'pie') {
    const v = c.series[0].values
    const sum = v.reduce((a, b) => a + b, 0) || 1
    return `<div class="legend">${c.labels.map((l, i) => `<span>${dot(i)}${esc(l)}<b>${Math.round(v[i] / sum * 1000) / 10}%</b></span>`).join('')}</div>`
  }
  if (c.series.length < 2) return ''
  return `<div class="legend">${c.series.map((s, j) => `<span>${dot(j)}${esc(s.name || '#' + (j + 1))}</span>`).join('')}</div>`
}

function renderDashboard(d) {
  const charts = arr(d.charts).map(obj).filter(Boolean).map(normChart)
  const ms = metrics(d.metrics)
  const tb = table(d.table)
  need(ms || charts.length || tb, '至少要有 metrics、charts、table 其中一样')
  let h = ms
  if (charts.length) {
    h += `<div class="charts">${charts.map((c, i) => `<div class="panel chart">${c.title ? `<h3>${inline(c.title)}</h3>` : ''}` +
      `<div class="cv" data-i="${i}"><div class="tip"></div></div>${legend(c)}</div>`).join('')}</div>`
  }
  return { body: h + tb, script: charts.length ? dashboardClient : null, json: charts.length ? charts : undefined }
}

function renderTimeline(d, ui) {
  const evs = arr(d.events).map(obj).filter((e) => e && (text(e.title) || text(e.text)))
  need(evs.length, 'events 至少要有一条，每条要有 title')
  const timed = evs.some((e) => text(e.time))
  return {
    body: `<div class="tl${timed ? '' : ' notime'}">${evs.map((e) => {
      const st = ['done', 'now', 'todo'].includes(e.status) ? e.status : ''
      return `<div class="ev${st ? ' s-' + st : ''}"><div class="when">${inline(e.time)}</div><div class="rail"><span class="dot"></span></div>` +
        `<div class="body"><div class="ttl">${inline(e.title)}${st === 'now' ? `<span class="chip">${ui.now}</span>` : ''}${text(e.tag) ? `<span class="chip">${inline(e.tag)}</span>` : ''}</div>` +
        `${text(e.text) ? `<div class="txt">${block(e.text)}</div>` : ''}</div></div>`
    }).join('')}</div>`,
  }
}

function renderFlashcards(d, ui) {
  const cards = arr(d.cards).map(obj).filter((c) => c && text(c.front) && text(c.back))
  need(cards.length, 'cards 至少要有一张，每张要有 front 和 back')
  const data = cards.map((c) => ({
    k: key(text(c.front)), f: inline(c.front), b: block(c.back), h: text(c.hint) ? inline(c.hint) : '',
    fl: text(c.front).length > 24, fs: [...text(c.front)].length <= 3, long: text(c.back).length > 80, short: text(c.back).length <= 16 && !/\n/.test(text(c.back)),
  }))
  const c0 = data[0]
  const h = `<div class="fc-top"><span id="pos">${fill(ui.card, { i: 1, n: data.length })}</span><span class="chip mute" id="kn"></span><span class="grow"></span>` +
    `<label class="toggle"><input type="checkbox" id="only">${ui.unknownOnly}</label><button type="button" id="shuf">${ui.shuffle}</button></div>` +
    '<div class="dots" id="dots"></div>' +
    `<div class="fc" id="card" tabindex="0" role="button" aria-label="${esc(ui.flip)}"><div class="in">` +
    `<div class="face front"><span class="lab">${ui.front}</span><div class="big${c0.fl ? ' long' : c0.fs ? ' huge' : ''}" id="f">${c0.f}</div><div class="hint" id="h">${c0.h ? '💡 ' + c0.h : ''}</div><div class="tap">${ui.flip}</div></div>` +
    `<div class="face back"><span class="lab">${ui.back}</span><div class="ans${c0.long ? ' long' : c0.short ? ' short' : ''}" id="b">${c0.b}</div></div></div></div>` +
    `<div class="fc-nav"><button type="button" class="quiet" id="prev">${ui.prev}</button><button type="button" id="no">${ui.notYet}</button>` +
    `<button type="button" class="primary" id="yes">${ui.gotIt}</button><button type="button" class="quiet" id="next">${ui.next}</button></div>` +
    `<div class="keys">${ui.keys}</div>` +
    `<div class="fc-done" hidden>${ui.allKnown}<button type="button" id="restart">${ui.restart}</button></div>` +
    `<details class="all"><summary>${ui.allCards}（${data.length}）</summary><div class="list">` +
    data.map((c) => `<div class="row" data-k="${c.k}"><div class="f">${c.f}</div><div class="b">${c.b}</div></div>`).join('') + '</div></details>'
  return { body: h, script: flashcardsClient, json: data }
}

/** 正确答案：序号（从 0 开始）、字母 A/B/C、或者选项原文 */
function answerIndex(a, options) {
  if (typeof a === 'number') return a
  const s = text(a)
  if (/^\d+$/.test(s)) return Number(s)
  if (/^[A-Za-z]$/.test(s)) return s.toUpperCase().charCodeAt(0) - 65
  return options.indexOf(s)
}

function renderQuiz(d, ui) {
  const qs = arr(d.questions).map(obj).filter(Boolean)
  need(qs.length, 'questions 至少要有一题')
  const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const items = qs.map((q, i) => {
    const opts = arr(q.options).map(text).filter(Boolean).slice(0, 26)
    need(text(q.question) && opts.length >= 2, `第 ${i + 1} 题：要有 question 和至少 2 个 options`)
    const a = answerIndex(q.answer, opts)
    need(Number.isInteger(a) && a >= 0 && a < opts.length, `第 ${i + 1} 题：answer 要是正确选项的序号（从 0 开始，0 到 ${opts.length - 1}）、字母，或者选项原文`)
    return { q, opts, a }
  })
  let h = `<div class="panel score"><span class="lab">${ui.score}</span><b id="sc">0 / ${items.length}</b><span class="qdots">${'<i></i>'.repeat(items.length)}</span>` +
    `<span id="an"></span><span class="grow"></span><button type="button" id="reset">${ui.retry}</button></div>`
  h += items.map(({ q, opts, a }, i) => `<div class="panel q" data-k="${key(text(q.question))}" data-a="${a}"><div class="lab qn">${fill(ui.q, { i: i + 1 })}</div>` +
    `<div class="qt">${inline(q.question)}</div><div class="opts${opts.some((o) => o.length > 22) ? ' wide' : ''}">${opts.map((o, j) => `<button type="button" class="opt" data-j="${j}"><span class="k">${L[j]}</span><span>${inline(o)}</span></button>`).join('')}</div>` +
    `<div class="exp" hidden><span class="res"></span>${text(q.explain) ? block(q.explain) : ''}</div></div>`).join('')
  h += '<div class="verdict final" hidden></div>'
  return { body: h, script: quizClient }
}

const KIND = { start: 'start', begin: 'start', end: 'end', stop: 'end', finish: 'end', done: 'end', decision: 'decision', if: 'decision', condition: 'decision', choice: 'decision', question: 'decision' }

/** 分层：顺着连线往下排（最长路径），往回连的线（循环）不算；同一层按上一层的位置排，少交叉 */
export function layoutFlow(n, edges) {
  const out = Array.from({ length: n }, () => [])
  edges.forEach((e, k) => out[e.from].push(k))
  const into = new Array(n).fill(0)
  edges.forEach((e) => { if (e.from !== e.to) into[e.to]++ })
  const state = new Array(n).fill(0)
  const back = new Set()
  const dfs = (u) => {
    state[u] = 1
    for (const k of out[u]) {
      const v = edges[k].to
      if (state[v] === 1) back.add(k)
      else if (!state[v]) dfs(v)
    }
    state[u] = 2
  }
  for (let i = 0; i < n; i++) if (!into[i] && !state[i]) dfs(i)
  for (let i = 0; i < n; i++) if (!state[i]) dfs(i)
  const rank = new Array(n).fill(0)
  const indeg = new Array(n).fill(0)
  edges.forEach((e, k) => { if (!back.has(k)) indeg[e.to]++ })
  const q = []
  for (let i = 0; i < n; i++) if (!indeg[i]) q.push(i)
  while (q.length) {
    const u = q.shift()
    for (const k of out[u]) {
      if (back.has(k)) continue
      const v = edges[k].to
      rank[v] = Math.max(rank[v], rank[u] + 1)
      if (--indeg[v] === 0) q.push(v)
    }
  }
  const rows = []
  for (let i = 0; i < n; i++) (rows[rank[i]] = rows[rank[i]] || []).push(i)
  const pos = new Array(n).fill(0)
  rows.forEach((row, r) => {
    if (r > 0) {
      const bary = (i) => {
        const ps = edges.filter((e, k) => !back.has(k) && e.to === i && rank[e.from] === r - 1).map((e) => pos[e.from])
        return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : Infinity
      }
      const b = new Map(row.map((i) => [i, bary(i)]))
      row.sort((x, y) => (b.get(x) - b.get(y)) || x - y)
    }
    row.forEach((i, j) => { pos[i] = j })
  })
  return { rank, back, rows: rows.filter(Boolean) }
}

function renderFlow(d) {
  const raw = arr(d.nodes).length ? arr(d.nodes) : arr(d.steps)
  const nodes = raw.map((x, i) => {
    const o = obj(x)
    return o ? { id: text(o.id) || String(i + 1), text: text(o.text || o.label || o.title), kind: KIND[String(o.kind || o.type || '').toLowerCase()] || '', note: text(o.note) } : { id: String(i + 1), text: text(x), kind: '', note: '' }
  }).filter((x) => x.text)
  need(nodes.length >= 2, 'nodes 至少要 2 个，每个要有 text')
  const ids = new Map()
  nodes.forEach((x, i) => { need(!ids.has(x.id), `节点 id「${x.id}」重复了`); ids.set(x.id, i) })
  const find = (x) => { const s = text(x); return ids.has(s) ? ids.get(s) : nodes.findIndex((m) => m.text === s) }
  let edges = arr(d.edges).map(obj).filter(Boolean).map((e, k) => {
    const from = find(e.from)
    const to = find(e.to)
    need(from >= 0 && to >= 0, `第 ${k + 1} 条连线：from / to 要写节点的 id（找不到「${from < 0 ? text(e.from) : text(e.to)}」）`)
    return { from, to, label: text(e.label) }
  })
  if (!edges.length) edges = nodes.slice(1).map((_, i) => ({ from: i, to: i + 1, label: '' }))
  const { rank, back, rows } = layoutFlow(nodes.length, edges)
  // 一个 kind 都没写：没人连进来的当开始，不往外连的当结束
  if (nodes.every((x) => !x.kind)) {
    nodes.forEach((x, i) => {
      if (!edges.some((e) => e.to === i && e.from !== i)) x.kind = 'start'
      else if (!edges.some((e) => e.from === i && e.to !== i)) x.kind = 'end'
    })
  }
  const skips = edges.filter((e, k) => !back.has(k) && rank[e.to] - rank[e.from] > 1).length
  const loops = edges.filter((e, k) => back.has(k) && e.from !== e.to).length
  const selfs = edges.some((e) => e.from === e.to)
  const pad = (lanes, extra) => (lanes ? 20 + lanes * 12 : extra ? 40 : 0)
  const style = `padding-left:${pad(skips)}px;padding-right:${pad(loops, selfs)}px`
  const h = `<div class="flow" style="${style}"><svg aria-hidden="true"><defs><marker id="ah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto"><path class="ah" d="M0,0.6 L8,4 L0,7.4 z"/></marker></defs></svg>` +
    `<div class="rows">${rows.map((row) => `<div class="row">${row.map((i) => {
      const x = nodes[i]
      return `<div class="node${x.kind ? ' ' + x.kind : ''}" data-i="${i}">${inline(x.text)}${x.note ? `<div class="nn">${inline(x.note)}</div>` : ''}</div>`
    }).join('')}</div>`).join('')}</div></div>`
  return { body: h, script: flowClient, json: { rank, edges: edges.map((e) => [e.from, e.to, e.label]) } }
}

const MM_DEPTH = 5
const MM_MAX = 200

/**
 * Markdown 大纲 → { center, branches }：「# 」是中心，「## 」起是一级、二级…；「- 」「1. 」列表按缩进往下分层；
 * 不是列表的行：第一行当中心，别的接到上一个节点的 note
 */
export function parseOutline(src) {
  const center = { text: '', note: '', children: [] }
  const stack = [center]
  let base = 1
  let indents = []
  let last = null
  for (const raw of String(src).split(/\r?\n/)) {
    if (!raw.trim()) continue
    const line = raw.replace(/\t/g, '  ')
    let m = /^\s*(#{1,6})\s+(.*)$/.exec(line)
    let lvl
    let txt
    if (m) {
      lvl = m[1].length - 1
      txt = m[2]
      indents = []
      if (lvl === 0 && !center.text && !center.children.length) {
        center.text = txt.trim()
        last = center
        continue
      }
      lvl = Math.max(1, lvl)
      base = lvl + 1
    } else if ((m = /^(\s*)(?:[-*+•]|\d+[.、)])\s+(.*)$/.exec(line))) {
      const w = m[1].length
      while (indents.length && indents[indents.length - 1] > w) indents.pop()
      if (!indents.length || indents[indents.length - 1] < w) indents.push(w)
      lvl = base + indents.length - 1
      txt = m[2]
    } else {
      if (!last) {
        center.text = line.trim()
        last = center
      } else last.note = (last.note ? last.note + '\n' : '') + line.trim()
      continue
    }
    const node = { text: txt.trim(), note: '', children: [] }
    const at = Math.min(lvl, stack.length)
    stack[at - 1].children.push(node)
    stack.length = at
    stack.push(node)
    last = node
  }
  return { center: center.text, note: center.note, branches: center.children }
}

const kidsOf = (o) => [o.children, o.branches, o.items, o.nodes, o.subtopics].find((x) => arr(x).length) || []
const nameOf = (o) => text(o.text || o.title || o.label || o.name || o.topic)

function renderMindmap(d, ui, title) {
  const out = typeof d.outline === 'string' && !kidsOf(d).length ? parseOutline(d.outline) : null
  const r = obj(d.root)
  const center = text(d.center || d.topic) || (r ? nameOf(r) : '') || (out ? out.center : '') || text(d.heading) || title
  const centerNote = text(d.center_note) || (r ? text(r.note) : '') || (out ? out.note : '')
  const list = out ? out.branches : kidsOf(r || d)
  need(list.length, 'branches 至少要有一个分支：[{text, children?:[…]}]（或者给 outline：Markdown 缩进大纲）')
  let count = 0
  const norm = (x, depth, where) => {
    const o = obj(x)
    const t = o ? nameOf(o) : text(x)
    need(t, `${where}没写 text`)
    need(depth <= MM_DEPTH, `最多 ${MM_DEPTH} 层（中心下面）：「${t.slice(0, 20)}」在第 ${depth} 层，太细的写进上一层的 note`)
    need(++count <= MM_MAX, `节点太多了（最多 ${MM_MAX} 个）：删掉次要的，或者拆成几张图`)
    const kids = o ? kidsOf(o) : []
    return { text: t, note: o ? text(o.note) : '', kids: kids.map((k, i) => norm(k, depth + 1, `「${t.slice(0, 20)}」下面第 ${i + 1} 个`)) }
  }
  const tops = list.map((x, i) => norm(x, 1, `第 ${i + 1} 个分支`))
  const seen = new Set()
  const keyOf = (p) => {
    let k = key(p)
    for (let n = 2; seen.has(k); n++) k = key(p + '\u0002' + n)
    seen.add(k)
    return k
  }
  const size = (n) => n.kids.reduce((a, c) => a + 1 + size(c), 0)
  const node = (n, depth, ci, path) => {
    const has = n.kids.length > 0
    const p = path + '\u0001' + n.text
    return `<div class="mm-b d${depth}"${depth === 1 ? ` data-c="${ci}" style="--b:var(--c${ci})"` : ''}${has ? ` data-k="${keyOf(p)}"` : ''}>` +
      `<div class="mm-n"${has ? ' role="button" tabindex="0" aria-expanded="true"' : ''}>${inline(n.text)}` +
      `${has ? `<span class="mm-cnt" hidden>+${size(n)}</span>` : ''}${n.note ? `<span class="mm-note">${inline(n.note)}</span>` : ''}</div>` +
      (has ? `<div class="mm-k">${n.kids.map((c) => node(c, depth + 1, ci, p)).join('')}</div>` : '') + '</div>'
  }
  const bar = tops.some((n) => n.kids.length)
    ? `<div class="bar mm-bar"><span class="grow"></span><button type="button" class="quiet" id="mm-open">${ui.expand}</button><button type="button" class="quiet" id="mm-close">${ui.collapse}</button></div>`
    : ''
  const h = bar + '<div class="mm"><svg class="mm-lines" aria-hidden="true"></svg><div class="mm-in"><div class="mm-side mm-l"></div>' +
    `<div class="mm-c"><div class="mm-n mm-root">${inline(center)}${centerNote ? `<span class="mm-note">${inline(centerNote)}</span>` : ''}</div></div>` +
    `<div class="mm-side mm-r">${tops.map((n, i) => node(n, 1, i % 8 + 1, '')).join('')}</div></div></div>`
  return { body: h, script: mindmapClient }
}

const STATUS = { done: 'done', finished: 'done', complete: 'done', completed: 'done', 完成: 'done', 已完成: 'done', now: 'now', doing: 'now', active: 'now', 'in progress': 'now', in_progress: 'now', current: 'now', 进行中: 'now', todo: 'todo', planned: 'todo', plan: 'todo', next: 'todo', later: 'todo', 计划: 'todo', 计划中: 'todo', 未开始: 'todo' }

/** 申报书 / 论文式技术路线：自上而下一层一层，左边阶段名，同层的方框能用虚线框分组；不给 links 就层和层之间画箭头 */
function renderLayers(d) {
  const layers = (arr(d.layers).length ? arr(d.layers) : arr(d.stages)).map(obj).filter(Boolean)
  need(layers.length >= 2, '要给 layers（申报书 / 论文式：自上而下至少 2 层），或者 lanes + periods（按时间的路线图：泳道 + 里程碑），二选一')
  const nodes = []
  const item = (x, li, where) => {
    const o = obj(x)
    const t = o ? nameOf(o) : text(x)
    need(t, `${where}没写 text`)
    const n = { i: nodes.length, id: o ? text(o.id) : '', text: t, note: o ? text(o.note) : '', key: !!(o && (o.key === true || o.highlight === true || o.important === true)), layer: li }
    nodes.push(n)
    return n
  }
  const L = layers.map((l, li) => {
    const label = text(l.label || l.name || l.title || l.stage)
    const where = `第 ${li + 1} 层${label ? `「${label.slice(0, 20)}」` : ''}`
    const items = arr(l.items || l.nodes || l.steps).map((x, j) => item(x, li, `${where}第 ${j + 1} 项`))
    const groups = arr(l.groups).map(obj).filter(Boolean).map((g, gi) => ({
      title: nameOf(g),
      items: arr(g.items || g.nodes || g.steps).map((x, j) => item(x, li, `${where}第 ${gi + 1} 组第 ${j + 1} 项`)),
    })).filter((g) => g.items.length)
    need(items.length || groups.length, `${where}：至少要有一项（items，或者 groups 里的 items）`)
    return { label, items, groups }
  })
  const ids = new Map()
  nodes.forEach((n) => { if (n.id) { need(!ids.has(n.id), `方框 id「${n.id}」重复了`); ids.set(n.id, n.i) } })
  const find = (x) => { const s = text(x); return ids.has(s) ? ids.get(s) : nodes.findIndex((n) => n.text === s) }
  const links = arr(d.links || d.edges).map(obj).filter(Boolean).map((e, k) => {
    const from = find(e.from)
    const to = find(e.to)
    need(from >= 0 && to >= 0, `第 ${k + 1} 条连线：from / to 要写方框的 id 或原文（找不到「${from < 0 ? text(e.from) : text(e.to)}」）`)
    need(from !== to, `第 ${k + 1} 条连线：from 和 to 是同一个方框`)
    return [from, to, text(e.label)]
  })
  const labels = L.some((l) => l.label)
  const box = (n) => `<div class="rt-n${n.key ? ' key' : ''}" data-i="${n.i}">${inline(n.text)}${n.note ? `<div class="nn">${inline(n.note)}</div>` : ''}</div>`
  const layer = (l) => `<div class="rt-layer">${labels ? `<div class="rt-lab">${inline(l.label)}</div>` : ''}<div class="rt-body">${l.items.map(box).join('')}` +
    l.groups.map((g) => `<div class="rt-g">${g.title ? `<div class="rt-gt"><span>${inline(g.title)}</span></div>` : ''}<div class="rt-gi">${g.items.map(box).join('')}</div></div>`).join('') + '</div></div>'
  const svg = links.length
    ? '<svg class="rt-lines" aria-hidden="true"><defs><marker id="rah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto"><path class="ah" d="M0,0.6 L8,4 L0,7.4 z"/></marker></defs></svg>'
    : ''
  const body = `<div class="rt${labels ? ' wl' : ''}${links.length ? ' lk' : ''}">${svg}${L.map(layer).join(links.length ? '' : '<div class="rt-ar"></div>')}</div>`
  return links.length ? { body, script: routeClient, json: { layer: nodes.map((n) => n.layer), links } } : { body }
}

/** 按时间的路线图：横轴时间段，每条泳道一行（叠在一起的自动分到下一行），顶上里程碑，现在所在的那一列淡淡标出来 */
function renderLanes(d, ui) {
  const periods = arr(d.periods).map(text).filter(Boolean)
  need(periods.length, '按时间的路线图要给 periods：时间段按先后排，比如 ["2026 Q1", "Q2", "Q3"]')
  need(periods.length <= 24, 'periods 最多 24 个：时间段分粗一点（比如按季度）')
  const flat = (s) => text(s).toLowerCase().replace(/\s+/g, '')
  // 重名的时间段（跨年都写「Q2」）认不出是哪一个，会排错时间：直接报错
  periods.forEach((p, i) => { const j = periods.findIndex((q) => flat(q) === flat(p)); need(j === i, `periods 里「${p}」重复了：跨年时每个时间段都带上年份（比如 "2026 Q4", "2027 Q1"），名字不能重`) })
  const at = (x) => { const s = text(x); if (!s) return -1; const i = periods.indexOf(s); return i >= 0 ? i : periods.map(flat).indexOf(flat(s)) }
  const all = `（periods：${periods.join('、')}）`
  const lanes = arr(d.lanes).map(obj).filter(Boolean).map((l, li) => {
    const name = nameOf(l)
    const where = `第 ${li + 1} 条泳道${name ? `「${name.slice(0, 20)}」` : ''}`
    const items = arr(l.items || l.tasks).map((x, j) => {
      const o = obj(x)
      need(o, `${where}第 ${j + 1} 项要写成 {text, start, end?}`)
      const t = nameOf(o)
      need(t, `${where}第 ${j + 1} 项没写 text`)
      const sv = [o.start, o.from, o.time, o.period, o.when].find((v) => text(v))
      let s = at(sv)
      need(s >= 0, `${where}「${t.slice(0, 20)}」：start 要写 periods 里的一项${text(sv) ? `，「${text(sv)}」不在里面` : ''}${all}`)
      const ev = [o.end, o.to, o.until].find((v) => text(v))
      let e = ev === undefined ? s : at(ev)
      need(e >= 0, `${where}「${t.slice(0, 20)}」：end 要写 periods 里的一项，「${text(ev)}」不在里面${all}`)
      if (e < s) [s, e] = [e, s]
      return { t, note: text(o.note), s, e, st: STATUS[text(o.status).toLowerCase()] || '', r: 0 }
    })
    need(items.length, `${where}：items 至少要有一项`)
    // 时间上叠在一起的往下分行
    const ends = []
    for (const it of [...items].sort((a, b) => a.s - b.s || a.e - b.e)) {
      let r = ends.findIndex((end) => end < it.s)
      if (r < 0) { r = ends.length; ends.push(-1) }
      ends[r] = it.e
      it.r = r
    }
    return { name, items, rows: ends.length }
  })
  need(lanes.length, '按时间的路线图要给 lanes：[{name, items:[{text, start, end?, status?}]}]')
  const ms = arr(d.milestones).map(obj).filter(Boolean).map((m, k) => {
    const t = nameOf(m)
    const c = at([m.time, m.at, m.period, m.when, m.date].find((v) => text(v)))
    need(t && c >= 0, `第 ${k + 1} 个里程碑：要有 text，time 写 periods 里的一项${all}`)
    return { t, c }
  })
  const now = text(d.now) ? at(d.now) : -1
  need(!text(d.now) || now >= 0, `now 要写 periods 里的一项，「${text(d.now)}」不在里面${all}`)
  let row = ms.length ? 3 : 2
  const span = lanes.map((l) => { const a = row; row += l.rows; return [a, row] })
  const P = periods.length
  let h = `<div class="rm-wrap"><div class="rm" style="--n:${P};grid-template-rows:repeat(${row - 1},auto)">`
  periods.forEach((_, c) => { h += `<div class="rm-col${c === now ? ' now' : ''}" style="grid-column:${c + 2};grid-row:1/-1"></div>` })
  lanes.forEach((_, i) => { if (i || ms.length) h += `<div class="rm-band" style="grid-column:1/-1;grid-row:${span[i][0]}/${span[i][1]}"></div>` })
  h += '<div class="rm-h0" style="grid-column:1;grid-row:1"></div>'
  periods.forEach((p, c) => { h += `<div class="rm-h${c === now ? ' now' : ''}" style="grid-column:${c + 2};grid-row:1">${inline(p)}${c === now ? `<span class="chip">${ui.nowCol}</span>` : ''}</div>` })
  if (ms.length) {
    h += `<div class="rm-msl" style="grid-column:1;grid-row:2">${ui.milestones}</div>`
    for (let c = 0; c < P; c++) {
      const here = ms.filter((m) => m.c === c)
      if (here.length) h += `<div class="rm-ms" style="grid-column:${c + 2};grid-row:2">${here.map((m) => `<div class="rm-m">${inline(m.t)}</div>`).join('')}</div>`
    }
  }
  lanes.forEach((l, i) => {
    const [a, b] = span[i]
    h += `<div class="rm-lane${i || ms.length ? ' sep' : ''}" style="grid-column:1;grid-row:${a}/${b}">${inline(l.name)}</div>`
    for (const it of l.items) {
      h += `<div class="rm-it${it.st ? ' s-' + it.st : ''}" style="grid-column:${it.s + 2}/${it.e + 3};grid-row:${a + it.r}">${inline(it.t)}${it.note ? `<span class="nn">${inline(it.note)}</span>` : ''}</div>`
    }
  })
  h += '</div></div>'
  const used = ['done', 'now', 'todo'].filter((s) => lanes.some((l) => l.items.some((it) => it.st === s)))
  const name = { done: ui.sDone, now: ui.sNow, todo: ui.sTodo }
  if (used.length) h += `<div class="rm-key">${used.map((s) => `<span><i class="k-${s}"></i>${name[s]}</span>`).join('')}</div>`
  return { body: h, script: lanesClient, kicker: { zh: '路线图', en: 'ROADMAP' } }
}

function renderRoadmap(d, ui) {
  const lanes = arr(d.lanes).length || (!arr(d.layers).length && !arr(d.stages).length && arr(d.periods).length)
  return lanes ? renderLanes(d, ui) : renderLayers(d)
}

const RENDER = { report: renderReport, compare: renderCompare, checklist: renderChecklist, dashboard: renderDashboard, timeline: renderTimeline, flashcards: renderFlashcards, quiz: renderQuiz, flow: renderFlow, mindmap: renderMindmap, roadmap: renderRoadmap }

const safeJson = (x) => JSON.stringify(x).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')

/** 模板名（认几个别名）→ 正式名；不认识 → '' */
export function templateName(name) {
  const n = String(name || '').trim().toLowerCase()
  const real = ALIAS[n] || n
  return RENDER[real] ? real : ''
}

/**
 * 按模板排成整页 HTML。data 不对就抛错（说清楚哪里不对，模型照着改）。
 * 返回 { name, html }
 */
export function renderTemplate(name, data, title) {
  const n = templateName(name)
  if (!n) throw new Error(`没有「${String(name).slice(0, 40)}」这个模板，可选：${TEMPLATES.join('、')}；都不合适就别传 template，直接写 html`)
  if (typeof data === 'string') {
    try { data = JSON.parse(data) } catch {
      // 思维导图直接给 Markdown 大纲也认
      if (n !== 'mindmap') throw new Error(`${LABELS[n]}模板：data 要是 JSON 对象`)
      data = { outline: data }
    }
  }
  if (Array.isArray(data)) data = { [MAIN[n]]: data }
  if (!obj(data)) throw new Error(`用 ${n} 模板要给 data（JSON 对象）`)
  const lang = /[㐀-鿿]/.test(String(title) + JSON.stringify(data)) ? 'zh' : 'en'
  const ui = UI[lang]
  let out
  try { out = RENDER[n](data, ui, String(title)) } catch (e) { throw new Error(`${LABELS[n]}模板：${e.message}`) }
  const heading = text(data.heading) || String(title)
  const sub = text(data.subtitle)
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">` +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    `<meta name="dsh-pages-template" content="${n}"><title>${esc(title)}</title><style>${STYLE}</style></head>` +
    `<body class="t-${n}"><header class="hd"><div class="kicker">${out.kicker ? out.kicker[lang] : KICKER[lang][n]}</div><h1>${inline(heading)}</h1>${sub ? `<p class="sub">${inline(sub)}</p>` : ''}</header>` +
    out.body +
    (text(data.note) ? `<footer class="foot">${block(data.note)}</footer>` : '') +
    (out.json !== undefined ? `<script type="application/json" id="data">${safeJson(out.json)}</script>` : '') +
    (out.script ? `<script>var T=${safeJson(ui)};\n${COMMON}(${out.script})()</script>` : '') +
    '</body></html>'
  return { name: n, html }
}
