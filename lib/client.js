/**
 * dsh-pages 的客户端部分：
 *
 *   conversation.chat.turnTail → 回复正下方显示这一回合做的页面：
 *       inline（默认）直接把页面嵌在对话里，高度跟着内容，能点能用；太高先收起，点「展开」看全
 *       card 一张活的缩略图卡片（页面按桌面宽度排版再缩小），点一下到右侧
 *       回合结束后 DSH 会把工具调用折进「已完成」，所以挂在回合尾巴上（同官方定时任务卡片的做法：
 *       uiConversation.events 注册一个按回合收集 show_page 结果的定义，turnTail 从 turn.data 里读）
 *   tool.call.toolview（key: show_page）→ 工具组里的那一行：生成中是骨架卡片 + 已写了多少；写好了缩成一行
 *   右侧栏标签页「页面」（sidebarRightTabs + sidebar.right.pane.tab）→ 整页、翻版本、导出；没指定页面时是「我的页面」
 *
 * 页面都从 /dsh-pages/page?id=…&v=… 载入：回应头的 CSP 把它关在不透明源的沙箱里。
 * 深浅色跟着 DSH：地址带上当时的 theme，之后 DSH 切换时发消息过去（页面里的小脚本接着换，不重载）。
 * 走官方客户端插件机制：window.__ModuleLoader__.load({ id, factory })，factory 里 apply(ctx)。
 */
window.__ModuleLoader__.load({
  id: '@orderg-x/dsh-pages',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    let react = null
    try { react = require('react') } catch (_) { react = null }
    const INJECT = ['slots', 'locale', 'uiConversation', 'sidebarRight', 'sidebarRightTabs']
    if (!react) {
      exports.apply = () => {}
      exports.inject = INJECT
      return module.exports
    }
    const h = react.createElement
    const { useState, useEffect, useRef } = react

    const NS = '@orderg-x/dsh-pages'
    const TOOL = 'show_page'
    const TAB_ID = '@orderg-x/dsh-pages'
    const KIND = 'dsh-pages-view'
    // 按回合收集页面的定义名，也是 turn.data 里的键
    const TURN_KEY = 'dsh-pages-turn'
    const ROUTE = '/dsh-pages/page'
    const API = '/dsh-pages/api/'
    // 缩略图按这个宽度排版再缩小，看起来就是桌面上的样子
    const THUMB_W = 1024
    const THUMB_H = 240
    // 对话里嵌的页面：先按这个高度，页面报上内容高度后改；超过 COLLAPSE_AT 先收起到 COLLAPSED_H；最高 HARD_H（再高在里面滚）
    const INIT_H = 420
    const MIN_H = 60
    const COLLAPSE_AT = 760
    const COLLAPSED_H = 600
    const HARD_H = 4000
    const SANDBOX = 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals'

    const ZH = {
      tabTitle: '页面',
      writing: '正在写页面…',
      written: '已写 {n}',
      open: '点开看整页',
      openRight: '在右侧打开',
      expand: '展开',
      collapse: '收起',
      expandAll: '展开全部',
      failed: '页面没做出来',
      noId: '找不到这一页',
      reload: '刷新',
      page: '页面',
      exportBtn: '导出',
      exportHtml: 'HTML 文件',
      exportPng: 'PNG 长图',
      exportPdf: 'PDF',
      exporting: '正在导出…',
      saved: '已存到「下载」：{n}',
      reveal: '打开所在位置',
      exportFail: '导出没成功：{n}',
      all: '全部页面',
      gallery: '我的页面',
      galleryEmpty: '还没有页面。跟模型说「做成一页」试试',
      loading: '载入中…',
      prev: '上一版',
      next: '下一版',
      count: '{n} 版',
      guideDesc: '模型做过的页面都在这里',
      search: '搜页面标题',
      noMatch: '没有对得上的页面',
      delete: '删除',
      deleteSure: '确定删除？',
      deleteFail: '没删掉：{n}',
    }
    const EN = {
      tabTitle: 'Page',
      writing: 'Writing the page…',
      written: '{n} written',
      open: 'Open full page',
      openRight: 'Open on the right',
      expand: 'Expand',
      collapse: 'Collapse',
      expandAll: 'Show all',
      failed: 'The page could not be made',
      noId: 'Page not found',
      reload: 'Reload',
      page: 'Page',
      exportBtn: 'Export',
      exportHtml: 'HTML file',
      exportPng: 'PNG image',
      exportPdf: 'PDF',
      exporting: 'Exporting…',
      saved: 'Saved to Downloads: {n}',
      reveal: 'Show in folder',
      exportFail: 'Export failed: {n}',
      all: 'All pages',
      gallery: 'My pages',
      galleryEmpty: 'No pages yet. Ask the model to "make it a page"',
      loading: 'Loading…',
      prev: 'Previous version',
      next: 'Next version',
      count: '{n} versions',
      guideDesc: 'Every page the model made',
      search: 'Search page titles',
      noMatch: 'No matching pages',
      delete: 'Delete',
      deleteSure: 'Delete?',
      deleteFail: 'Could not delete: {n}',
    }

    const CSS = `
.dsp-card{display:block;width:100%;max-width:560px;margin:6px 0;padding:0;text-align:left;cursor:pointer;
  border:1px solid var(--dsw-alias-border-l2,#e5e6eb);border-radius:var(--dsw-radius-lg,12px);overflow:hidden;
  background:var(--dsw-alias-bg-layer-1,#fff);font-family:var(--dsw-font-family,inherit);color:var(--dsw-alias-label-primary,#1f2329);
  transition:border-color .15s,box-shadow .15s}
.dsp-card:hover{border-color:var(--dsw-alias-border-l4,#c9cdd4);box-shadow:0 4px 16px rgba(0,0,0,.08)}
.dsp-card:focus-visible,.dsp-row:focus-visible,.dsp-btn:focus-visible,.dsp-gitem:focus-visible,.dsp-more:focus-visible,.dsp-gdel:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4d6bfe);outline-offset:2px}
.dsp-tail{display:flex;flex-direction:column;gap:10px;margin-top:6px}
.dsp-row{display:inline-flex;align-items:center;gap:8px;max-width:100%;margin:2px 0;padding:4px 10px 4px 6px;border:1px solid var(--dsw-alias-border-l2,#e5e6eb);border-radius:8px;
  background:transparent;cursor:pointer;font-size:13px;color:var(--dsw-alias-label-secondary,#4e5969);font-family:var(--dsw-font-family,inherit)}
.dsp-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.04));color:var(--dsw-alias-label-primary,#1f2329)}
.dsp-row .dsp-icon,.dsp-ihead .dsp-icon{width:20px;height:20px;border-radius:5px}
.dsp-row .dsp-icon svg,.dsp-ihead .dsp-icon svg{width:13px;height:13px}
.dsp-row span:last-child{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsp-head{display:flex;align-items:center;gap:8px;padding:10px 12px}
.dsp-icon{flex:none;width:28px;height:28px;border-radius:8px;display:grid;place-items:center;
  background:var(--dsw-alias-state-business-primary,#4d6bfe);color:#fff}
.dsp-titles{flex:1;min-width:0}
.dsp-title{font-size:14px;font-weight:600;line-height:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsp-sub{font-size:12px;line-height:16px;color:var(--dsw-alias-label-tertiary,#86909c)}
.dsp-go{flex:none;font-size:12px;color:var(--dsw-alias-label-secondary,#4e5969);padding:4px 8px;border-radius:6px;
  background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.04))}
.dsp-card:hover .dsp-go{color:var(--dsw-alias-state-business-primary,#4d6bfe)}
.dsp-thumb{position:relative;height:${THUMB_H}px;overflow:hidden;background:var(--dsw-alias-bg-layer-1,#fff);border-top:1px solid var(--dsw-alias-border-l2,#e5e6eb)}
.dsp-thumb .dsp-shot{display:block;width:100%;height:100%;object-fit:cover;object-position:top}
.dsp-thumb iframe{position:absolute;left:0;top:0;border:0;transform-origin:0 0;pointer-events:none;background:transparent}
.dsp-thumb::after,.dsp-ibody.clip::after{content:"";position:absolute;inset:auto 0 0 0;height:48px;pointer-events:none;
  background:linear-gradient(transparent,var(--dsw-alias-bg-layer-1,#fff))}
.dsp-skel{height:${THUMB_H}px;border-top:1px solid var(--dsw-alias-border-l2,#e5e6eb);padding:18px;box-sizing:border-box;display:flex;flex-direction:column;gap:12px}
.dsp-bar{height:12px;border-radius:6px;background:var(--dsw-alias-bg-skeleton,rgba(127,127,127,.14));position:relative;overflow:hidden}
.dsp-bar::after{content:"";position:absolute;inset:0;transform:translateX(-100%);
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.5),transparent);animation:dsp-shine 1.4s infinite}
body[data-ds-dark-theme] .dsp-bar::after{background:linear-gradient(90deg,transparent,rgba(255,255,255,.08),transparent)}
@keyframes dsp-shine{to{transform:translateX(100%)}}
.dsp-err{margin:6px 0;font-size:13px;color:var(--dsw-alias-state-error-primary,#f53f3f)}
.dsp-inline{width:100%;border:1px solid var(--dsw-alias-border-l2,#e5e6eb);border-radius:var(--dsw-radius-lg,12px);overflow:hidden;
  background:var(--dsw-alias-bg-layer-1,#fff);font-family:var(--dsw-font-family,inherit);color:var(--dsw-alias-label-primary,#1f2329)}
.dsp-inline{container-type:inline-size}
.dsp-tab{container-type:inline-size}
@container (max-width:460px){.dsp-ihead .dsp-long{display:none}}
@container (max-width:400px){.dsp-tabbar .dsp-long{display:none}}
.dsp-ihead{display:flex;align-items:center;gap:6px;padding:6px 6px 6px 10px;border-bottom:1px solid var(--dsw-alias-border-l2,#e5e6eb);font-size:13px}
.dsp-ititle{min-width:0;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsp-ver{flex:none;font-size:11px;line-height:16px;padding:0 5px;border-radius:4px;color:var(--dsw-alias-label-secondary,#4e5969);background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}
.dsp-sp{flex:1}
.dsp-ibody{position:relative;overflow:hidden}
.dsp-frame{display:block;width:100%;border:0;background:transparent}
.dsp-loading{position:absolute;inset:0;padding:18px;display:flex;flex-direction:column;gap:12px;background:var(--dsw-alias-bg-layer-1,#fff)}
.dsp-more{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);z-index:1;border:1px solid var(--dsw-alias-border-l2,#e5e6eb);border-radius:999px;
  padding:4px 14px;font-size:12px;cursor:pointer;color:var(--dsw-alias-label-primary,#1f2329);background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 2px 8px rgba(0,0,0,.12)}
.dsp-tab{position:absolute;inset:0;display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-1,#fff);font-family:var(--dsw-font-family,inherit);color:var(--dsw-alias-label-primary,#1f2329)}
.dsp-tabbar{flex:none;display:flex;align-items:center;gap:4px;padding:6px 8px;border-bottom:1px solid var(--dsw-alias-border-l2,#e5e6eb);font-size:13px}
.dsp-tabbar b{flex:1;min-width:0;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 4px}
.dsp-btn{flex:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary,#4e5969);font-size:12px;line-height:18px;padding:4px 8px;border-radius:6px;cursor:pointer;font-family:inherit}
.dsp-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));color:var(--dsw-alias-label-primary,#1f2329)}
.dsp-btn:disabled{opacity:.4;cursor:default}
.dsp-vers{flex:none;display:flex;align-items:center;font-size:12px;color:var(--dsw-alias-label-secondary,#4e5969)}
.dsp-vers .dsp-btn{padding:4px 6px}
.dsp-pop{position:relative}
.dsp-menu{position:absolute;right:0;top:100%;margin-top:4px;z-index:5;min-width:132px;padding:4px;border-radius:8px;
  border:1px solid var(--dsw-alias-border-l2,#e5e6eb);background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1,#fff));box-shadow:0 6px 20px rgba(0,0,0,.16)}
.dsp-menu .dsp-btn{display:block;width:100%;text-align:left}
.dsp-note{flex:none;display:flex;align-items:center;gap:6px;padding:6px 12px;font-size:12px;border-bottom:1px solid var(--dsw-alias-border-l2,#e5e6eb);color:var(--dsw-alias-label-secondary,#4e5969)}
.dsp-note span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsp-note.err{color:var(--dsw-alias-state-error-primary,#f53f3f)}
.dsp-full{flex:1;min-height:0;width:100%;border:0;background:transparent}
.dsp-empty{flex:1;display:grid;place-items:center;font-size:13px;color:var(--dsw-alias-label-tertiary,#86909c);padding:24px;text-align:center}
.dsp-gallery{flex:1;min-height:0;overflow:auto;padding:12px}
.dsp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.dsp-search{display:block;width:100%;box-sizing:border-box;margin:0 0 10px;padding:6px 10px;border-radius:8px;font:inherit;font-size:13px;
  border:1px solid var(--dsw-alias-border-l2,#e5e6eb);background:transparent;color:inherit;outline:none}
.dsp-search:focus{border-color:var(--dsw-alias-state-business-primary,#4d6bfe)}
.dsp-gcell{position:relative;display:flex}
.dsp-gcell .dsp-gitem{flex:1;min-width:0}
.dsp-gdel{position:absolute;top:6px;right:6px;min-width:24px;height:24px;padding:0 6px;border-radius:12px;cursor:pointer;font:inherit;font-size:12px;line-height:22px;
  border:1px solid var(--dsw-alias-border-l2,#e5e6eb);background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-secondary,#4e5969);
  opacity:0;transition:opacity .12s}
.dsp-gcell:hover .dsp-gdel,.dsp-gdel:focus-visible,.dsp-gdel.arm{opacity:1}
.dsp-gdel.arm{color:#fff;border-color:transparent;background:var(--dsw-alias-state-error-primary,#f53f3f)}
@media (hover:none){.dsp-gdel{opacity:1}}
.dsp-gitem{display:flex;flex-direction:column;padding:0;text-align:left;cursor:pointer;overflow:hidden;font-family:inherit;color:inherit;
  border:1px solid var(--dsw-alias-border-l2,#e5e6eb);border-radius:10px;background:var(--dsw-alias-bg-layer-1,#fff)}
.dsp-gitem:hover{border-color:var(--dsw-alias-border-l4,#c9cdd4)}
.dsp-gthumb{height:92px;display:grid;place-items:center;overflow:hidden;background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08));color:var(--dsw-alias-label-tertiary,#86909c)}
.dsp-gthumb img{width:100%;height:100%;object-fit:cover;object-position:top}
.dsp-gname{padding:6px 8px 0;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsp-gsub{padding:0 8px 7px;font-size:11px;color:var(--dsw-alias-label-tertiary,#86909c)}
`

    function ensureStyle() {
      try {
        if (typeof document === 'undefined' || document.getElementById('dsh-pages-style')) return
        const el = document.createElement('style')
        el.id = 'dsh-pages-style'
        el.textContent = CSS
        document.head.appendChild(el)
      } catch (_) { /* 没有 document（测试里）就算了 */ }
    }

    function makeT(ctx) {
      const loc = ctx && ctx.locale
      return (k, vars) => {
        let s = ''
        try { if (loc && typeof loc.t === 'function') s = loc.t(NS + '.' + k) } catch (_) { s = '' }
        if (!s || s === NS + '.' + k) s = ZH[k] || k
        if (vars) for (const [name, v] of Object.entries(vars)) s = s.replace('{' + name + '}', String(v))
        return s
      }
    }

    // ── 深浅色：DSH 深色时 body 上有 data-ds-dark-theme（「跟随系统」时也是算好的结果）──

    const themeStore = (() => {
      const subs = new Set()
      let cur = 'light'
      let started = false
      const read = () => {
        try {
          return document.body.hasAttribute('data-ds-dark-theme') || document.documentElement.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light'
        } catch (_) { return 'light' }
      }
      const start = () => {
        if (started || typeof document === 'undefined' || typeof MutationObserver === 'undefined' || !document.body) return
        started = true
        cur = read()
        const mo = new MutationObserver(() => {
          const next = read()
          if (next === cur) return
          cur = next
          subs.forEach((f) => f(next))
        })
        mo.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
        mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
      }
      return {
        get: () => { start(); return started ? cur : read() },
        sub: (f) => { start(); subs.add(f); return () => subs.delete(f) },
      }
    })()

    function useTheme() {
      const [theme, setTheme] = useState(themeStore.get)
      useEffect(() => themeStore.sub(setTheme), [])
      return theme
    }

    // ── 从工具块里读东西 ──────────────────────────────────────────────────────

    /** 读一个参数：优先用宿主的懒读器（生成中也能读到一半），不行就解析原始 JSON */
    function argText(block, key) {
      if (!block) return ''
      try {
        const a = block.args
        if (a && typeof a.text === 'function') {
          const v = a.text(key)
          if (typeof v === 'string') return v
        }
      } catch (_) { /* 换下一种 */ }
      try {
        const raw = block.argsRaw || (block.call && block.call.argsRaw) || ''
        if (raw) {
          const o = JSON.parse(raw)
          if (o && typeof o[key] === 'string') return o[key]
        }
      } catch (_) { /* 还没写完的 JSON 解析不了 */ }
      return ''
    }

    function resultText(block) {
      if (!block) return ''
      if (Array.isArray(block.content)) return block.content.map((c) => (c && typeof c.text === 'string' ? c.text : '')).join('\n')
      return String(block.output || block.text || '')
    }

    /** 结果最后一行是 /dsh-pages/page?id=…&v=…&h=… → { id, v, h }（原型的结果没有 v，当最新版；h 是体检量的嵌入高度，没体检就没有） */
    function pageRefOf(block) {
      // 只认最后一行、整行都得对上：标题里写了别的页面地址也不会认错；改名前（dsh-artifacts）的结果也认
      const lines = resultText(block).split('\n').map((x) => x.trim()).filter(Boolean)
      const m = /^\/dsh-(?:pages|artifacts)\/page\?id=([a-z0-9]{6,16}-[a-f0-9]{8})(?:&v=(\d+))?(?:&h=(\d+))?$/.exec(lines[lines.length - 1] || '')
      return m ? { id: m[1], v: m[2] ? Number(m[2]) : 0, h: m[3] ? Number(m[3]) : 0 } : null
    }
    function pageIdOf(block) {
      const r = pageRefOf(block)
      return r ? r.id : ''
    }

    function fmtSize(n) {
      if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB'
      if (n >= 1024) return (n / 1024).toFixed(1) + ' KB'
      return n + ' B'
    }

    function fmtTime(iso) {
      const d = new Date(iso)
      if (isNaN(d.getTime())) return ''
      const now = new Date()
      const pad = (x) => String(x).padStart(2, '0')
      if (d.toDateString() === now.toDateString()) return pad(d.getHours()) + ':' + pad(d.getMinutes())
      return (d.getFullYear() === now.getFullYear() ? '' : d.getFullYear() + '/') + (d.getMonth() + 1) + '/' + d.getDate()
    }

    function urlOf(id, v, theme) {
      return ROUTE + '?id=' + encodeURIComponent(id) + (v ? '&v=' + v : '') + (theme ? '&theme=' + theme : '')
    }

    // 回的不是 JSON（路由没挂上、被代理拦了）也给一句看得懂的错
    function readReply(r) {
      return r.json().catch(() => null).then((b) => (r.ok && b ? b : Promise.reject(new Error((b && b.error) || 'HTTP ' + r.status))))
    }
    function getJson(url) {
      return fetch(url, { credentials: 'same-origin' }).then(readReply)
    }
    function postJson(url, body) {
      return fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(readReply)
    }

    // ── 页面框 ────────────────────────────────────────────────────────────────

    // 开着的页面框，按页面 id 分：一处改了 localStorage，别处（对话里 / 右侧栏）跟上
    const liveFrames = new Map()
    // 还没存进 DSH 的改动（按页面 id 攒着，合成一条）：{ ops, timer }
    const pendingState = new Map()

    /** 两份改动合成一份：b 在 a 之后 */
    function mergeOps(a, b) {
      if (!a || b.clear) return { clear: !!b.clear, set: { ...(b.set || {}) }, del: [...(b.del || [])] }
      const set = { ...a.set }
      const del = new Set(a.del)
      for (const k of b.del || []) { delete set[k]; del.add(k) }
      for (const [k, v] of Object.entries(b.set || {})) { set[k] = v; del.delete(k) }
      return { clear: a.clear, set, del: [...del] }
    }

    function flushState(id, keepalive) {
      const p = pendingState.get(id)
      if (!p) return Promise.resolve()
      pendingState.delete(id)
      clearTimeout(p.timer)
      return fetch(API + 'state', { method: 'POST', credentials: 'same-origin', keepalive: !!keepalive, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ops: p.ops }) })
        .then(readReply)
        .catch((e) => console.warn('[dsh-pages] 页面存的东西没存上', e))
    }
    function flushAllState(keepalive) {
      for (const id of [...pendingState.keys()]) flushState(id, keepalive)
    }
    try { window.addEventListener('pagehide', () => flushAllState(true)) } catch (_) { /* 测试里没有 window */ }

    function saveState(id, ops, from) {
      for (const f of liveFrames.get(id) || []) {
        const w = f.current && f.current.contentWindow
        if (f !== from && w) try { w.postMessage({ type: 'dsp-state-sync', ops }, '*') } catch (_) { /* 已经卸了 */ }
      }
      // 连着改：攒一会儿合成一条再存；页面框卸掉、窗口关掉时马上存
      const p = pendingState.get(id) || { ops: null, timer: 0 }
      p.ops = mergeOps(p.ops, ops)
      clearTimeout(p.timer)
      p.timer = setTimeout(() => flushState(id), 300)
      pendingState.set(id, p)
    }

    function opsOf(d) {
      const o = d && d.ops
      if (!o || typeof o !== 'object') return null
      const set = {}
      if (o.set && typeof o.set === 'object') for (const [k, v] of Object.entries(o.set)) if (typeof v === 'string') set[k] = v
      return { clear: o.clear === true, set, del: Array.isArray(o.del) ? o.del.map(String) : [] }
    }

    /**
     * 载一页的 iframe：src 只用挂上时的深浅色，之后 DSH 切换时发消息过去（不重载、页面里的状态不丢）。
     * onSize：页面报上内容高度时调用。
     */
    function Frame(props) {
      const { id, v, theme, onSize } = props
      const ref = useRef(null)
      const [first] = useState(theme)
      const themeRef = useRef(theme)
      themeRef.current = theme
      const sizeRef = useRef(onSize)
      sizeRef.current = onSize
      // 页面自己跳走（改 location、meta refresh）：载入次数对不上就拉回这一页，别的网站不留在对话里；最多拉三次
      const nav = useRef({ expect: 1, resets: 0 })
      const send = () => {
        const w = ref.current && ref.current.contentWindow
        if (w) try { w.postMessage({ type: 'dsp-theme', theme: themeRef.current }, '*') } catch (_) { /* 已经卸了 */ }
      }
      // 别处改过数据、这一框的页面没跟上：先把攒着的存进 DSH，再整页重载（载进来就是新的）
      const reload = useRef(null)
      reload.current = () => flushState(id).then(() => {
        if (!ref.current) return
        nav.current.expect++
        ref.current.src = urlOf(id, v, themeRef.current)
      })
      useEffect(send, [theme])
      useEffect(() => {
        if (typeof window === 'undefined') return
        const on = (e) => {
          const f = ref.current
          if (!f || e.source !== f.contentWindow) return
          const d = e.data
          if (d && d.type === 'dsp-size' && typeof d.h === 'number' && sizeRef.current) sizeRef.current(d.h)
          if (d && d.type === 'dsp-reload' && !props.ariaHidden) reload.current()
          // 缩略图里跑的页面不算用户在用，不存
          const ops = d && d.type === 'dsp-state' && !props.ariaHidden ? opsOf(d) : null
          if (ops) saveState(id, ops, ref)
        }
        window.addEventListener('message', on)
        const set = liveFrames.get(id) || new Set()
        set.add(ref)
        liveFrames.set(id, set)
        return () => {
          window.removeEventListener('message', on)
          set.delete(ref)
          if (!set.size && liveFrames.get(id) === set) liveFrames.delete(id)
          // 页面框卸掉了（滚走、关掉右侧栏、换版本）：攒着的改动马上存，下次打开就是新的
          flushState(id)
        }
      }, [id])
      return h('iframe', {
        ref,
        src: urlOf(id, v, first),
        title: props.title,
        sandbox: SANDBOX,
        className: props.className,
        style: { colorScheme: theme, ...(props.style || {}) },
        loading: props.loading,
        scrolling: props.scrolling,
        tabIndex: props.tabIndex,
        'aria-hidden': props.ariaHidden,
        onLoad: () => {
          const n = nav.current
          if (n.expect > 0) n.expect--
          else if (n.resets < 3 && ref.current) {
            n.resets++
            n.expect = 1
            console.warn('[dsh-pages] 页面自己跳走了，拉回来')
            ref.current.src = urlOf(id, v, themeRef.current)
            return
          }
          // 重载过也按现在的深浅色
          send()
          if (props.onLoad) props.onLoad()
        },
      })
    }

    // ── 对话里 ────────────────────────────────────────────────────────────────

    function PageIcon() {
      return h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, 'aria-hidden': true },
        h('rect', { x: 2, y: 2.5, width: 12, height: 11, rx: 2 }),
        h('path', { d: 'M2 5.5h12M5 8.5h3.5M5 11h6' }))
    }

    function GuideIcon(props) {
      return h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', width: 26, height: 26, ...props },
        h('rect', { x: 3, y: 3.5, width: 18, height: 17, rx: 2.5 }),
        h('path', { d: 'M3 8h18M7 12h5M7 15.5h10' }))
    }

    /** 缩略图：iframe 按 THUMB_W 宽排版，按卡片实际宽度缩小 */
    function Thumb(props) {
      const box = useRef(null)
      const [scale, setScale] = useState(0.5)
      useEffect(() => {
        const el = box.current
        if (!el || typeof ResizeObserver === 'undefined') return
        const fit = () => { const w = el.clientWidth; if (w > 0) setScale(w / THUMB_W) }
        fit()
        const ro = new ResizeObserver(fit)
        ro.observe(el)
        return () => ro.disconnect()
      }, [])
      return h('div', { className: 'dsp-thumb', ref: box },
        h(Frame, {
          id: props.id,
          v: props.v,
          theme: props.theme,
          title: props.title,
          loading: 'lazy',
          scrolling: 'no',
          tabIndex: -1,
          ariaHidden: true,
          style: { width: THUMB_W + 'px', height: Math.ceil(THUMB_H / scale) + 'px', transform: 'scale(' + scale + ')' },
        }))
    }

    function thumbUrl(id, v, theme) {
      return API + 'thumb?id=' + encodeURIComponent(id) + '&v=' + v + '&theme=' + theme
    }

    /** 卡片上的缩略图：先用体检时截好的图（不用跑页面）；没有（没体检 / 老页面）再用活的 */
    function CardThumb(props) {
      const [failed, setFailed] = useState(!props.v)
      if (failed) return h(Thumb, props)
      return h('div', { className: 'dsp-thumb' },
        h('img', { className: 'dsp-shot', src: thumbUrl(props.id, props.v, props.theme), alt: '', onError: () => setFailed(true) }))
    }

    function PageCard(props) {
      const { block, t, open } = props
      const phase = props.phase || (block && 'kind' in block ? 'result' : block && block.phase) || 'preparing'
      const title = argText(block, 'title') || t('page')
      if (phase !== 'result') {
        const n = argText(block, 'html').length
        return h('div', { className: 'dsp-card', style: { cursor: 'default' }, 'aria-busy': true },
          h('div', { className: 'dsp-head' },
            h('span', { className: 'dsp-icon' }, h(PageIcon)),
            h('span', { className: 'dsp-titles' },
              h('div', { className: 'dsp-title' }, title),
              h('div', { className: 'dsp-sub' }, n ? t('writing') + ' ' + t('written', { n: fmtSize(n) }) : t('writing')))),
          h('div', { className: 'dsp-skel' },
            h('div', { className: 'dsp-bar', style: { width: '45%', height: 18 } }),
            h('div', { className: 'dsp-bar', style: { width: '90%' } }),
            h('div', { className: 'dsp-bar', style: { width: '80%' } }),
            h('div', { className: 'dsp-bar', style: { width: '60%' } })))
      }
      if (block.isError) {
        const msg = (block.error && (block.error.message || block.error)) || resultText(block) || ''
        return h('div', { className: 'dsp-err' }, t('failed') + (msg ? '：' + String(msg).slice(0, 200) : ''))
      }
      const ref = pageRefOf(block)
      if (!ref) return h('div', { className: 'dsp-err' }, t('noId'))
      // 写好了：页面挂在回复正下方（TurnTail），工具组里只留一行，展开「已完成」时不重复
      return h('button', { className: 'dsp-row', type: 'button', title: t('openRight'), onClick: () => open(ref.id, ref.v, title) },
        h('span', { className: 'dsp-icon' }, h(PageIcon)),
        h('span', null, title + (ref.v > 1 ? ' · v' + ref.v : '') + ' · ' + t('openRight')))
    }

    /** card：标题 + 活的缩略图，点一下到右侧 */
    function ReadyCard(props) {
      const { id, v, title, t, open } = props
      const theme = useTheme()
      const go = () => open(id, v, title)
      return h('div', {
        className: 'dsp-card',
        role: 'button',
        tabIndex: 0,
        title: t('open'),
        onClick: go,
        onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go() } },
      },
        h('div', { className: 'dsp-head' },
          h('span', { className: 'dsp-icon' }, h(PageIcon)),
          h('span', { className: 'dsp-titles' },
            h('div', { className: 'dsp-title' }, title),
            h('div', { className: 'dsp-sub' }, v > 1 ? t('page') + ' · v' + v : t('page'))),
          h('span', { className: 'dsp-go' }, t('open') + ' →')),
        h(CardThumb, { id, v, title, theme }))
    }

    // 每页每版上次量到的高度：对话滚走再滚回来（重新挂上）时直接用，不跳
    const heights = new Map()

    /** inline：页面直接嵌在对话里，高度跟着内容 */
    function InlinePage(props) {
      const { id, v, title, t, open } = props
      const theme = useTheme()
      const key = id + ':' + v
      // 先用上次量到的，再用体检量的，都没有才用默认高度；页面载好报上实际高度再改
      const [frameH, setFrameH] = useState(() => heights.get(key) || (props.h > 0 ? Math.max(MIN_H, Math.min(HARD_H, props.h)) : INIT_H))
      // 页面载好（报上高度或 load）之前盖一层骨架，不露白框
      const [ready, setReady] = useState(() => heights.has(key))
      const [expanded, setExpanded] = useState(false)
      const st = useRef({ cur: frameH, delta: 0, grow: 0, frozen: false })
      const onSize = (n) => {
        setReady(true)
        const s = st.current
        if (s.frozen) return
        const want = Math.max(MIN_H, Math.min(HARD_H, Math.ceil(n)))
        const d = want - s.cur
        if (Math.abs(d) < 2) return
        // 跟着视口长的页面（100vh 再加边距）：每撑开一次就多出同样一截，连着三次就不再跟
        if (d > 0 && Math.abs(d - s.delta) < 2) {
          if (++s.grow >= 3) { s.frozen = true; return }
        } else s.grow = 0
        s.delta = d
        s.cur = want
        heights.set(key, want)
        setFrameH(want)
      }
      const tall = frameH > COLLAPSE_AT
      const clip = tall && !expanded
      const box = useRef(null)
      const toggle = () => {
        // 收起时页面顶部可能已经滚出屏幕：滚回来，不然人就找不到刚才看的页面了
        if (expanded && box.current && box.current.scrollIntoView) try { box.current.scrollIntoView({ block: 'nearest' }) } catch (_) { /* 老浏览器 */ }
        setExpanded(!expanded)
      }
      return h('div', { className: 'dsp-inline', ref: box },
        h('div', { className: 'dsp-ihead' },
          h('span', { className: 'dsp-icon' }, h(PageIcon)),
          h('span', { className: 'dsp-ititle', title }, title),
          v > 1 ? h('span', { className: 'dsp-ver' }, 'v' + v) : null,
          h('span', { className: 'dsp-sp' }),
          tall ? h('button', { className: 'dsp-btn', type: 'button', 'aria-expanded': expanded, onClick: toggle }, expanded ? t('collapse') : t('expand')) : null,
          h('button', { className: 'dsp-btn', type: 'button', title: t('openRight'), 'aria-label': t('openRight'), onClick: () => open(id, v, title) },
            h('span', { className: 'dsp-long' }, t('openRight') + ' '), '↗')),
        h('div', { className: 'dsp-ibody' + (clip ? ' clip' : ''), style: clip ? { maxHeight: COLLAPSED_H + 'px' } : undefined },
          h(Frame, {
            id,
            v,
            theme,
            title,
            className: 'dsp-frame',
            scrolling: frameH >= HARD_H ? 'auto' : 'no',
            style: { height: frameH + 'px' },
            onSize,
            onLoad: () => setReady(true),
          }),
          ready ? null : h('div', { className: 'dsp-loading', 'aria-hidden': true },
            h('div', { className: 'dsp-bar', style: { width: '40%', height: 18 } }),
            h('div', { className: 'dsp-bar', style: { width: '85%' } }),
            h('div', { className: 'dsp-bar', style: { width: '70%' } })),
          clip ? h('button', { className: 'dsp-more', type: 'button', onClick: () => setExpanded(true) }, t('expandAll')) : null))
    }

    // ── 回合尾巴：这一回合做出的页面，挂在回复正下方 ─────────────────────────────

    function argsOf(argsRaw) {
      try {
        const o = JSON.parse(argsRaw || '{}')
        return {
          title: o && typeof o.title === 'string' ? o.title : '',
          display: o && o.display === 'card' ? 'card' : 'inline',
        }
      } catch (_) { return { title: '', display: 'inline' } }
    }

    /**
     * 按回合收集 show_page 的成功结果（只记数据，不出视图节点）。
     * 同一回合改了同一页几次（体检后修了再调）只留最后一版。
     * 会话回放时同样走一遍，所以重开 DSH、翻旧会话，页面照样在。
     */
    const pagesTurnDefinition = {
      kind: TURN_KEY,
      match: (event) => {
        const turn = event && event.data && event.data.turn
        if (turn === undefined) return null
        if (event.type === 'turn/start') return { id: String(turn), role: 'start' }
        if (event.type === 'tool/call' && event.data.name === TOOL) return { id: String(turn), role: 'update' }
        // 只认原样追加进来的结果；压缩上下文时替换进来的副本不算，不然页面会出两遍
        if (event.type === 'tool/result' && (event.surfaceOp === undefined || event.surfaceOp === 'append')) return { id: String(turn), role: 'update' }
        return null
      },
      start: (_context, match) => ({ turn: match.event.data.turn, calls: new Map(), pages: [] }),
      update: (context, match) => {
        const state = context.state
        const ev = match.event
        if (ev.type === 'tool/call') {
          const calls = new Map(state.calls)
          calls.set(String(ev.data.callId), argsOf(ev.data.arguments))
          return { ...state, calls }
        }
        if (ev.type !== 'tool/result') return state
        const message = ev.data && ev.data.message
        const callId = String((message && message.source && message.source.callId) || '')
        const call = state.calls.get(callId)
        if (!call || !message || message.isError === true) return state
        const ref = pageRefOf({ content: message.content })
        if (!ref) return state
        const old = state.pages.find((p) => p.id === ref.id)
        if (old && old.v >= ref.v) return state
        const page = { id: ref.id, v: ref.v, h: ref.h, title: call.title, display: call.display, seq: ev.seq, callId }
        return { ...state, pages: [...state.pages.filter((p) => p.id !== ref.id), page] }
      },
      buildLocationData: (context, scope, previous) => {
        if (scope !== 'turn' || context.state === undefined) return null
        const st = context.state
        if (previous && previous.kind === 'turn' && previous.turn === st.turn && previous.key === TURN_KEY && previous.value.pages === st.pages) return previous
        return { kind: 'turn', turn: st.turn, key: TURN_KEY, value: { pages: st.pages } }
      },
    }

    function TurnTail(props) {
      const { t, open } = props
      const turn = props.turn
      const data = turn && turn.data && typeof turn.data.get === 'function' ? turn.data.get(TURN_KEY) : undefined
      const bound = (turn && turn.end && turn.end.seq) || props.seq || Number.POSITIVE_INFINITY
      const pages = data && Array.isArray(data.pages) ? data.pages.filter((p) => !(p.seq > bound)) : []
      if (!pages.length) return null
      return h('div', { className: 'dsp-tail' },
        pages.map((p) => h(p.display === 'card' ? ReadyCard : InlinePage, { key: p.id + ':' + p.v, id: p.id, v: p.v, h: p.h, title: p.title || t('page'), t, open })))
    }

    // ── 右侧栏 ────────────────────────────────────────────────────────────────

    // 页面多到这个数才出搜索框
    const SEARCH_AT = 8

    /** 我的页面：最近改过的在前，点一下看那一页；多了能搜；能删（挪进回收站，点两下才删） */
    function Gallery(props) {
      const { t, pick } = props
      const theme = useTheme()
      const [list, setList] = useState(null)
      const [q, setQ] = useState('')
      const [arm, setArm] = useState('') // 点过一次「删除」的那一页，再点才真删
      const [err, setErr] = useState('')
      useEffect(() => {
        let off = false
        getJson(API + 'list').then((r) => { if (!off) setList(r.pages || []) }).catch(() => { if (!off) setList([]) })
        return () => { off = true }
      }, [])
      useEffect(() => {
        if (!arm) return
        const timer = setTimeout(() => setArm(''), 3000)
        return () => clearTimeout(timer)
      }, [arm])
      if (!list) return h('div', { className: 'dsp-empty' }, t('loading'))
      if (!list.length) return h('div', { className: 'dsp-empty' }, t('galleryEmpty'))
      const del = (p) => {
        if (arm !== p.id) return setArm(p.id)
        setArm('')
        postJson(API + 'delete', { id: p.id })
          .then(() => setList((l) => (l || []).filter((x) => x.id !== p.id)))
          .catch((e) => setErr(t('deleteFail', { n: e.message })))
      }
      const word = q.trim().toLowerCase()
      const shown = word ? list.filter((p) => String(p.title || '').toLowerCase().includes(word)) : list
      return h('div', { className: 'dsp-gallery' },
        list.length >= SEARCH_AT ? h('input', { className: 'dsp-search', type: 'search', value: q, placeholder: t('search'), 'aria-label': t('search'), onChange: (e) => setQ(e.target.value) }) : null,
        err ? h('div', { className: 'dsp-note err', role: 'status' }, h('span', null, err)) : null,
        shown.length ? h('div', { className: 'dsp-grid' },
          shown.map((p) => h('div', { key: p.id, className: 'dsp-gcell' },
            h('button', { className: 'dsp-gitem', type: 'button', title: p.title, onClick: () => pick(p) },
              h('div', { className: 'dsp-gthumb' },
                p.thumb ? h('img', { src: thumbUrl(p.id, p.v, theme), alt: '', loading: 'lazy' }) : h(GuideIcon)),
              h('div', { className: 'dsp-gname' }, p.title || t('page')),
              h('div', { className: 'dsp-gsub' }, fmtTime(p.updated) + (p.count > 1 ? ' · ' + t('count', { n: p.count }) : ''))),
            h('button', {
              className: 'dsp-gdel' + (arm === p.id ? ' arm' : ''),
              type: 'button',
              title: t('delete'),
              'aria-label': t('delete') + ' ' + (p.title || ''),
              onClick: () => del(p),
            }, arm === p.id ? t('deleteSure') : '×')))) : h('div', { className: 'dsp-empty' }, t('noMatch')))
    }

    /** 看一页：翻版本、导出、刷新、回到全部页面 */
    function Viewer(props) {
      const { id, t, back } = props
      const theme = useTheme()
      const [meta, setMeta] = useState(null)
      const [ver, setVer] = useState(props.v || 0)
      const [bust, setBust] = useState(0)
      const [menu, setMenu] = useState(false)
      const [note, setNote] = useState(null) // { busy } | { path, name } | { error }
      const pop = useRef(null)
      // 对话里又点了一次（revision 变了，哪怕还是同一版）：回到点的那一版
      useEffect(() => { setVer(props.v || 0) }, [id, props.v, props.revision])
      useEffect(() => {
        if (!menu || typeof document === 'undefined') return
        const away = (e) => { if (pop.current && !pop.current.contains(e.target)) setMenu(false) }
        const esc = (e) => { if (e.key === 'Escape') setMenu(false) }
        document.addEventListener('mousedown', away, true)
        document.addEventListener('keydown', esc, true)
        return () => {
          document.removeEventListener('mousedown', away, true)
          document.removeEventListener('keydown', esc, true)
        }
      }, [menu])
      useEffect(() => {
        let off = false
        getJson(API + 'meta?id=' + encodeURIComponent(id)).then((m) => { if (!off) setMeta(m) }).catch(() => { if (!off) setMeta(null) })
        return () => { off = true }
        // 右侧栏开着时对话里又点了新版本（revision 变了）：版本列表重新取
      }, [id, bust, props.v, props.revision])
      const versions = (meta && meta.versions) || []
      const last = versions.length ? versions[versions.length - 1].v : 0
      const cur = ver || last
      const idx = versions.findIndex((x) => x.v === cur)
      const title = (versions[idx] && versions[idx].title) || props.title || (meta && meta.title) || t('page')
      const go = (d) => { const x = versions[idx + d]; if (x) setVer(x.v) }
      const doExport = (format) => {
        setMenu(false)
        setNote({ busy: true })
        postJson(API + 'export', { id, v: cur || undefined, format, theme })
          .then((r) => setNote({ path: r.path, name: r.name }))
          .catch((e) => setNote({ error: e.message }))
      }
      return h('div', { className: 'dsp-tab' },
        h('div', { className: 'dsp-tabbar' },
          h('button', { className: 'dsp-btn', type: 'button', onClick: back, title: t('all'), 'aria-label': t('all') }, '‹', h('span', { className: 'dsp-long' }, ' ' + t('all'))),
          h('b', { title }, title),
          versions.length > 1 ? h('span', { className: 'dsp-vers' },
            h('button', { className: 'dsp-btn', type: 'button', disabled: idx <= 0, onClick: () => go(-1), title: t('prev'), 'aria-label': t('prev') }, '‹'),
            h('span', null, 'v' + cur + ' / ' + versions.length),
            h('button', { className: 'dsp-btn', type: 'button', disabled: idx < 0 || idx >= versions.length - 1, onClick: () => go(1), title: t('next'), 'aria-label': t('next') }, '›')) : null,
          h('span', { className: 'dsp-pop', ref: pop },
            h('button', { className: 'dsp-btn', type: 'button', 'aria-expanded': menu, onClick: () => setMenu(!menu) }, t('exportBtn') + ' ▾'),
            menu ? h('div', { className: 'dsp-menu', role: 'menu' },
              h('button', { className: 'dsp-btn', type: 'button', role: 'menuitem', onClick: () => doExport('png') }, t('exportPng')),
              h('button', { className: 'dsp-btn', type: 'button', role: 'menuitem', onClick: () => doExport('pdf') }, t('exportPdf')),
              h('button', { className: 'dsp-btn', type: 'button', role: 'menuitem', onClick: () => doExport('html') }, t('exportHtml'))) : null),
          h('button', { className: 'dsp-btn', type: 'button', onClick: () => setBust((n) => n + 1) }, t('reload'))),
        note ? h('div', { className: 'dsp-note' + (note.error ? ' err' : ''), role: 'status' },
          h('span', null, note.busy ? t('exporting') : note.error ? t('exportFail', { n: note.error }) : t('saved', { n: note.name })),
          note.path ? h('button', { className: 'dsp-btn', type: 'button', onClick: () => postJson(API + 'reveal', { path: note.path }).catch(() => {}) }, t('reveal')) : null,
          note.busy ? null : h('button', { className: 'dsp-btn', type: 'button', onClick: () => setNote(null), 'aria-label': '×' }, '×')) : null,
        h(Frame, { key: id + ':' + cur + ':' + bust + ':' + (props.revision || 0), id, v: cur || undefined, theme, title, className: 'dsp-full' }))
    }

    function PageTab(props) {
      const t = props.t
      const info = typeof props.useTabInfo === 'function' ? props.useTabInfo() : null
      const nav = info && info.tab && info.tab.navigation
      const params = (nav && nav.params) || {}
      const revision = (nav && nav.revision) || 0
      // 在这个标签页里自己点过的（全部页面 / 某一页）；对话里又点开别的页面（revision 变了）就作废
      const [sel, setSel] = useState(null)
      const cur = sel && sel.revision === revision ? sel : { id: typeof params.id === 'string' ? params.id : '', v: Number(params.v) || 0, title: params.title || '' }
      if (!cur.id) {
        return h('div', { className: 'dsp-tab' },
          h('div', { className: 'dsp-tabbar' }, h('b', null, t('gallery'))),
          h(Gallery, { t, pick: (p) => setSel({ id: p.id, v: 0, title: p.title, revision }) }))
      }
      return h(Viewer, { key: cur.id, id: cur.id, v: cur.v, title: cur.title, revision, t, back: () => setSel({ id: '', revision }) })
    }

    // ── 注册 ─────────────────────────────────────────────────────────────────

    function apply(ctx) {
      ensureStyle()
      const t = makeT(ctx)
      try { ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'dsh-pages: copy') } catch (e) { console.warn('[dsh-pages] locale', e) }

      const open = (id, v, title) => {
        try {
          ctx.sidebarRight.openTab(KIND, { params: { id, v: v || 0, title } })
        } catch (e) {
          // 右侧栏用不了（没有这个服务、窄屏布局之类）：新标签页里看整页
          console.warn('[dsh-pages] 打不开右侧栏', e)
          try { window.open(urlOf(id, v, themeStore.get()), '_blank', 'noopener') } catch (_) { /* 也开不了就算了 */ }
        }
      }

      ctx.effect(() => ctx.sidebarRightTabs.register({
        id: TAB_ID,
        kind: KIND,
        title: () => t('tabTitle'),
        guide: [{ id: 'gallery', order: 40, title: () => t('gallery'), description: () => t('guideDesc'), icon: GuideIcon }],
      }), 'dsh-pages: tab type')

      ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab',
        key: TAB_ID,
        locale: NS,
        inject: () => ({ t }),
      }, PageTab)), 'dsh-pages: tab body')

      ctx.effect(() => ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
        name: 'tool.call.toolview',
        key: TOOL,
        locale: NS,
      }, (props) => h(PageCard, { ...props, t, open }))), 'dsh-pages: tool row')

      // 回复正下方的页面：先注册按回合收集的定义，再挂 turnTail
      try {
        if (ctx.uiConversation && ctx.uiConversation.events && typeof ctx.uiConversation.events.register === 'function') {
          ctx.effect(() => ctx.uiConversation.events.register(pagesTurnDefinition), 'dsh-pages: turn pages')
          ctx.effect(() => ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
            name: 'conversation.chat.turnTail',
            id: 'dsh-pages',
            order: 15,
            locale: NS,
            inject: () => ({ t, open }),
          }, TurnTail)), 'dsh-pages: turn tail')
        }
      } catch (e) { console.warn('[dsh-pages] 回复下方的页面挂不上', e) }
    }

    exports.apply = apply
    // 注意：这里是客户端**服务名**（短的），不是包名
    exports.inject = INJECT
    exports._test = { mergeOps, argText, pageIdOf, pageRefOf, PageCard, PageTab, TurnTail, InlinePage, ReadyCard, Viewer, Gallery, pagesTurnDefinition, makeT, fmtSize }
    return module.exports
  },
})
