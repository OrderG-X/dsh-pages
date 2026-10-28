/**
 * 每个页面送出去时塞在 <head> 最前面的一小段脚本（页面自己的代码之前跑）：
 *
 *   深浅色  跟着 DSH 走：地址上的 theme= 是初始值，之后对话 / 右侧栏发 { type: 'dsp-theme' } 来切换。
 *           在 <html> 上设 data-theme / data-bs-theme / .dark / color-scheme（自己写的变量、Tailwind、DaisyUI、Bootstrap 都认）；
 *           页面里写的 @media (prefers-color-scheme: …) 也改成跟着 DSH 走（DSH 选了深色、系统是浅色时照样变深）
 *   高度    内容高度变了就告诉外面（{ type: 'dsp-size', h }），对话里的页面按内容撑开
 *   链接    点外部链接在新窗口开，不把对话里的页面整个跳走
 *   报错    脚本错误、资源载不进来、被 CSP 拦下的都记在 window.__dsp.errors，体检时读
 *   存东西  沙箱（不透明源）里一碰 localStorage / sessionStorage / cookie / IndexedDB 就抛 SecurityError，页面整个挂掉：
 *           换成能用的。localStorage 按页面存进 DSH（送出去时带上存过的；改了就把改动 { type: 'dsp-state', ops } 发出去存），
 *           重开、改出新版本都还在；sessionStorage 只在内存里；cookie 读出来是空的；IndexedDB 当没有
 */

const SCRIPT = String.raw`(function(){
var P = window.parent, D = document, de = D.documentElement, theme = ''
var errs = [], once = new Set()
function note(s){ s = String(s).slice(0, 240); if (errs.length < 20 && !once.has(s)) { once.add(s); errs.push(s) } }
addEventListener('error', function(e){
  var t = e.target
  if (t && t !== window && (t.src || t.href)) note('载不进来：' + (t.src || t.href) + (/^https:\/\/(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|unpkg\.com)\//.test(t.src || t.href) ? '（地址写错了，或者这台电脑连不上这个 CDN：换一个 CDN，或者把代码直接写进页面）' : ''))
  else note((e.message || '脚本出错') + (e.lineno ? '（第 ' + e.lineno + ' 行）' : ''))
}, true)
addEventListener('unhandledrejection', function(e){ var r = e.reason; note('Promise 出错：' + (r && r.message || r)) })
// 被沙箱拦下的：说清楚为什么、该怎么改
var HINT = [
  [/^connect-src/, '页面不能联网取数据（fetch / XHR / WebSocket），数据直接写进页面'],
  [/^(script|style|font)-src/, '库和字体只能从 cdn.jsdelivr.net / cdnjs.cloudflare.com / unpkg.com 引（字体还能用 Google Fonts）'],
  [/^(img|media)-src/, '别处的图片、音视频载不进来：图用 SVG / emoji / CSS 画，或者写成 data: 地址'],
  [/^frame-src/, '页面里不能再嵌 iframe'],
  [/^form-action/, '表单不能提交到别处：在 submit 里 preventDefault，用脚本处理'],
]
D.addEventListener('securitypolicyviolation', function(e){
  var dir = e.effectiveDirective || e.violatedDirective || ''
  var hint = ''
  for (var i = 0; i < HINT.length; i++) if (HINT[i][0].test(dir)) { hint = HINT[i][1]; break }
  note('被沙箱拦下：' + dir + ' ' + (e.blockedURI || '') + (hint ? '（' + hint + '）' : ''))
})
var ce = console.error
console.error = function(){ try { note([].map.call(arguments, function(a){ return a && a.message || String(a) }).join(' ')) } catch (_) {} return ce.apply(console, arguments) }

var LIMIT = 256 * 1024 // 键加值的字数
function storage(init, persist){
  var m = Object.create(null), ops = null
  for (var k0 in init) if (typeof init[k0] === 'string') m[k0] = init[k0]
  // 记下改了什么（不是整份）；同一轮里改的几下攒成一条，马上发出去（页面随时可能被关掉，不能等）
  function save(op, k, v){
    // 别处改过、这一框还是旧的：它写的都是拿旧数据算出来的，不发（马上会重载）
    if (!persist || P === window || stale) return
    if (!ops) { ops = { clear: false, set: {}, del: {} }; Promise.resolve().then(flush) }
    if (op === 'clear') { ops = { clear: true, set: {}, del: {} } }
    else if (op === 'set') { ops.set[k] = v; delete ops.del[k] }
    else { delete ops.set[k]; ops.del[k] = 1 }
  }
  function flush(){
    var o = ops
    ops = null
    if (o) P.postMessage({ type: 'dsp-state', ops: { clear: o.clear, set: o.set, del: Object.keys(o.del) } }, '*')
  }
  function size(){ var n = 0; for (var k in m) n += k.length + m[k].length; return n }
  var api = {
    getItem: function(k){ k = String(k); return k in m ? m[k] : null },
    setItem: function(k, v){
      k = String(k); v = String(v)
      var had = k in m, old = m[k]
      if (had && old === v) return
      m[k] = v
      if (size() > LIMIT) { if (had) m[k] = old; else delete m[k]; throw new DOMException('页面存的东西太多了', 'QuotaExceededError') }
      save('set', k, v)
    },
    removeItem: function(k){ k = String(k); if (k in m) { delete m[k]; save('del', k) } },
    clear: function(){ m = Object.create(null); save('clear') },
    key: function(i){ var ks = Object.keys(m); return i >= 0 && i < ks.length ? ks[i] : null },
    // 别处（同一页开着的另一个框）改了：照着改，不再往外发；返回真变了的 [键, 旧值, 新值]，
    // 按 storage 事件的样子：清空是一条 [null, null, null]，清空后再存的旧值都是 null
    _apply: function(o){
      var ch = [], k
      if (o.clear === true) { if (Object.keys(m).length) ch.push([null, null, null]); m = Object.create(null) }
      if (Array.isArray(o.del)) o.del.forEach(function(k){ k = String(k); if (k in m) { ch.push([k, m[k], null]); delete m[k] } })
      if (o.set && typeof o.set === 'object') for (k in o.set) if (typeof o.set[k] === 'string' && m[k] !== o.set[k]) { ch.push([k, k in m ? m[k] : null, o.set[k]]); m[k] = o.set[k] }
      return ch
    },
  }
  Object.defineProperty(api, 'length', { get: function(){ return Object.keys(m).length }, configurable: true })
  if (typeof Proxy === 'undefined') return api
  return new Proxy(api, {
    get: function(t, p){ return p in t ? t[p] : (typeof p === 'string' && p in m ? m[p] : undefined) },
    set: function(t, p, v){ if (!(p in t)) t.setItem(p, v); return true },
    has: function(t, p){ return p in t || p in m },
    deleteProperty: function(t, p){ if (!(p in t)) t.removeItem(p); return true },
    ownKeys: function(){ return Object.keys(m) },
    getOwnPropertyDescriptor: function(t, p){ return typeof p === 'string' && p in m ? { value: m[p], enumerable: true, configurable: true, writable: true } : undefined },
  })
}
var local = null, stale = false
if (window.origin === 'null') {
  var put = function(name, value){ try { Object.defineProperty(window, name, { value: value, configurable: true, writable: true }) } catch (_) {} }
  local = storage(__STATE__, true)
  put('localStorage', local)
  put('sessionStorage', storage({}, false))
  put('indexedDB', undefined)
  try { Object.defineProperty(D, 'cookie', { get: function(){ return '' }, set: function(){}, configurable: true }) } catch (_) {}
}

var MQ = /\(\s*prefers-color-scheme\s*:\s*(dark|light)\s*\)/gi
var tracked = [], seen = new Set()
function collect(rules){
  for (var i = 0; i < rules.length; i++) {
    var r = rules[i]
    if (typeof CSSMediaRule !== 'undefined' && r instanceof CSSMediaRule && !seen.has(r)) {
      var txt = r.media.mediaText
      MQ.lastIndex = 0
      if (MQ.test(txt)) { seen.add(r); tracked.push({ r: r, t: txt }) }
    }
    try { if (r.cssRules) collect(r.cssRules) } catch (_) {}
  }
}
function scan(){
  for (var i = 0; i < D.styleSheets.length; i++) { try { collect(D.styleSheets[i].cssRules) } catch (_) { /* 跨域的样式表读不了 */ } }
  tracked.forEach(function(x){
    var want = theme ? x.t.replace(MQ, function(_, s){ return s.toLowerCase() === theme ? '(min-width: 0px)' : '(max-width: 0.01px)' }) : x.t
    if (x.r.media.mediaText !== want) x.r.media.mediaText = want
  })
}
function setTheme(t){
  theme = t === 'dark' || t === 'light' ? t : ''
  if (theme) {
    de.setAttribute('data-theme', theme)
    de.setAttribute('data-bs-theme', theme)
    de.classList.toggle('dark', theme === 'dark')
    de.style.colorScheme = theme
  }
  scan()
}
setTheme('__THEME__')
var pend = 0
function later(){ if (!pend) pend = setTimeout(function(){ pend = 0; scan() }, 30) }
new MutationObserver(function(ms){
  for (var i = 0; i < ms.length; i++) for (var j = 0; j < ms[i].addedNodes.length; j++) {
    var n = ms[i].addedNodes[j]
    if (n.nodeName === 'STYLE' || n.nodeName === 'LINK') return later()
  }
}).observe(de, { childList: true, subtree: true })

function measure(){
  var b = D.body
  var h = de.getBoundingClientRect().height
  if (b) h = Math.max(h, b.scrollHeight)
  return Math.ceil(h)
}
var last = -1
function report(){
  if (P === window) return
  var h = measure()
  if (Math.abs(h - last) < 2) return
  last = h
  P.postMessage({ type: 'dsp-size', h: h }, '*')
}
addEventListener('message', function(e){
  if (e.source !== P) return
  var d = e.data
  if (d && d.type === 'dsp-theme') setTheme(d.theme)
  if (d && d.type === 'dsp-ping') { last = -1; report() }
  // 同一页在别处（对话里 / 右侧栏）存了：跟上
  if (d && d.type === 'dsp-state-sync' && local && d.ops && typeof d.ops === 'object') synced(local._apply(d.ops))
})
// 页面自己听 storage 事件就交给它（和浏览器里开两个标签页一样）；没人接的（没听、听了又撤掉）先记下「旧了」，
// 用户回到这一框（鼠标移进来、点、按键）时让外面整页重载，免得拿旧数据把别处的改动盖掉。
// 有没有人接：页面挂的 storage 监听都包一层，真被调到才算（撤掉的、once 用过的、AbortSignal 撤的自然不算）
var heard = false, wraps = new WeakMap()
var ael = window.addEventListener, rel = window.removeEventListener
function wrap(l){
  if (!l || (typeof l !== 'function' && typeof l !== 'object')) return l
  var w = wraps.get(l)
  if (!w) { w = function(e){ heard = true; return typeof l === 'function' ? l.call(this, e) : l.handleEvent(e) }; wraps.set(l, w) }
  return w
}
try {
  window.addEventListener = function(t, l){ if (t !== 'storage') return ael.apply(this || window, arguments); var a = [].slice.call(arguments); a[1] = wrap(l); return ael.apply(this || window, a) }
  window.removeEventListener = function(t, l){ if (t !== 'storage' || !l || !wraps.has(l)) return rel.apply(this || window, arguments); var a = [].slice.call(arguments); a[1] = wraps.get(l); return rel.apply(this || window, a) }
} catch (_) {}
function synced(ch){
  if (!ch.length) return
  heard = false
  ch.forEach(function(c){
    try {
      var e = new StorageEvent('storage', { key: c[0], oldValue: c[1], newValue: c[2], url: location.href })
      // 替身不是真的 Storage，构造时塞不进去：补在事件上，页面拿 e.storageArea === localStorage 判断照样对
      Object.defineProperty(e, 'storageArea', { value: local })
      window.dispatchEvent(e)
    } catch (_) {}
  })
  if (!heard && typeof window.onstorage !== 'function') stale = true
}
var asked = 0
function back(){
  if (!stale || P === window || Date.now() - asked < 3000) return
  asked = Date.now()
  P.postMessage({ type: 'dsp-reload' }, '*')
}
D.addEventListener('pointerover', back, true)
D.addEventListener('focusin', back, true)
// 旧了以后用户的操作（按键、点、输入）先拦下：不然页面照常处理、存的却被丢掉，重载之后这一下就没了
function hold(e){
  if (!stale || P === window) return
  if (e.cancelable) e.preventDefault()
  e.stopImmediatePropagation()
  back()
}
['keydown', 'keypress', 'beforeinput', 'input', 'change', 'submit', 'pointerdown', 'mousedown', 'mouseup', 'click', 'touchstart', 'touchend'].forEach(function(t){
  ael.call(window, t, hold, { capture: true, passive: false })
})
D.addEventListener('click', function(e){
  var a = e.target && e.target.closest ? e.target.closest('a[href]') : null
  if (!a || e.defaultPrevented) return
  var href = a.getAttribute('href') || ''
  if (!/^https?:/i.test(href)) return
  e.preventDefault()
  window.open(a.href, '_blank', 'noopener,noreferrer')
})
function watch(){
  scan()
  if (typeof ResizeObserver !== 'undefined') { var ro = new ResizeObserver(report); ro.observe(de); if (D.body) ro.observe(D.body) }
  report()
}
if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', watch); else watch()
addEventListener('load', function(){ scan(); report() })
// 体检靠它：页面自己的代码改不掉、删不掉
try { Object.defineProperty(window, '__dsp', { value: Object.freeze({ setTheme: setTheme, measure: measure, errors: errs }), writable: false, configurable: false }) } catch (_) {}
})()`

/** 放进 <script> 里的 JSON：< 换掉，页面存的东西里有 </script> 也跳不出去 */
function scriptJson(v) {
  return JSON.stringify(v).replace(/</g, '\\u003c')
}

/** theme 只认 light / dark，别的一律当没给；state 是这一页存过的 localStorage（键、值都是字符串） */
export function runtimeTag(theme, state) {
  const t = theme === 'dark' || theme === 'light' ? theme : ''
  const st = {}
  if (state && typeof state === 'object') for (const [k, v] of Object.entries(state)) if (typeof v === 'string') st[k] = v
  return `<script>${SCRIPT.replace('__THEME__', t).replace('__STATE__', () => scriptJson(st))}</script>`
}

/**
 * 塞在文档最前面：跳过开头的空白和注释，有 doctype 就放在它后面（放在 doctype 前面会进怪异模式）。
 * 不找 <head>：注释、脚本字符串里也可能写着 <head>，找错了脚本就进了注释里。
 * 放在 <html> 前面的脚本，浏览器照样把它归进 <head>，后面写的 <html lang> 等属性也照样生效。
 */
export function injectRuntime(html, theme, state) {
  const tag = runtimeTag(theme, state)
  let i = html.charCodeAt(0) === 0xfeff ? 1 : 0
  for (;;) {
    while (i < html.length && /\s/.test(html[i])) i++
    if (!html.startsWith('<!--', i)) break
    const end = html.indexOf('-->', i + 4)
    if (end < 0) break // 没收尾的注释：就放在这儿（放后面会被吞进注释）
    i = end + 3
  }
  const m = /^<!doctype[^>]*>/i.exec(html.slice(i, i + 200))
  if (m) i += m[0].length
  return html.slice(0, i) + tag + html.slice(i)
}
