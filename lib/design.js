/**
 * 设计：模板和模型手写的页面共用一套（颜色变量 + 元素本身的样子 + 现成的类）。
 *
 *   · 靠字号、字重和留白分层：标题上方一条蓝色短线 + 类别小字（眉题），大数字当主角
 *   · 只有一个强调色（DeepSeek 蓝）；绿 / 红 / 琥珀只表示好 / 不好 / 要留意
 *   · 面板一律白底 + 发丝线 + 很淡的阴影（圆角 14）；控件圆角 8，标签全圆；列表靠细线分隔，不套灰底框
 *   · 图表配色是校验过色盲区分度的固定顺序（第一色就是强调色），按序列取、不循环
 *
 * 手写的页面存的时候在 <head> 最前面塞一份（withDesign），整份包在 @layer dsp 里：
 * 页面自己写的 CSS 不管先后、不管选择器多弱都盖得过它，所以只补没写的，不会把页面改坏。
 */

const LIGHT = 'color-scheme:light;--bg:#fbfbfc;--surface:#fff;--sunk:#f3f4f6;--hover:#f6f7f9;--line:#e8e9ed;--line2:#d8dae0;' +
  '--fg:#15171c;--fg2:#3b414b;--muted:#6b717c;--faint:#9ca1aa;--accent:#4d6bfe;--accent-ink:#3a56e8;--accent-soft:#eef1ff;--on-accent:#fff;' +
  '--good:#16a34a;--good-ink:#11803b;--good-soft:#e9f7ef;--bad:#e5484d;--bad-ink:#c8292f;--bad-soft:#fdeeee;--warn:#e38b00;--warn-ink:#975a00;--warn-soft:#fff4df;' +
  '--shadow:0 1px 2px rgba(18,22,33,.04),0 3px 12px rgba(18,22,33,.04);--lift:0 2px 4px rgba(18,22,33,.04),0 16px 36px -10px rgba(18,22,33,.16);' +
  '--c1:#4d6bfe;--c2:#eb6834;--c3:#1baf7a;--c4:#eda100;--c5:#e87ba4;--c6:#008300;--c7:#6250d6;--c8:#e34948'
const DARK = 'color-scheme:dark;--bg:#17181b;--surface:#1e1f23;--sunk:#26272c;--hover:#232429;--line:#2d2f35;--line2:#3b3e45;' +
  '--fg:#eceef2;--fg2:#c4c8cf;--muted:#969ca5;--faint:#6d737c;--accent:#4d6bfe;--accent-ink:#93a5ff;--accent-soft:rgba(98,128,255,.15);--on-accent:#fff;' +
  '--good:#2fb866;--good-ink:#5bd68c;--good-soft:rgba(47,184,102,.14);--bad:#ec4f55;--bad-ink:#ff878b;--bad-soft:rgba(236,79,85,.14);--warn:#e39b2f;--warn-ink:#f2be6c;--warn-soft:rgba(227,155,47,.14);' +
  '--shadow:none;--lift:0 18px 40px -14px rgba(0,0,0,.55);' +
  '--c1:#6f88ff;--c2:#d95926;--c3:#199e70;--c4:#c98500;--c5:#d55181;--c6:#008300;--c7:#9085e9;--c8:#e66767'

// 半透明的浅色底叠在面板色上，放在线条上面也不透
export const solid = (v) => `linear-gradient(var(${v}),var(${v})),var(--surface)`

export const TOKENS = `:root{${LIGHT}}:root[data-theme=dark]{${DARK}}@media (prefers-color-scheme:dark){:root:not([data-theme=light]){${DARK}}}`

// 元素本身的样子（字、标题字号、链接、表格、按钮、输入框）；标题和列表的间距模板、手写各管各的
export const CORE = `
*{box-sizing:border-box}[hidden]{display:none!important}
body{margin:0;font:15px/1.7 system-ui,-apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Segoe UI",sans-serif;color:var(--fg);background:var(--bg);-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%}
body>:last-child{margin-bottom:0}
h1{font-size:30px;line-height:1.25;font-weight:750;letter-spacing:-.012em;text-wrap:balance}
h2{font-size:18px;line-height:1.4;font-weight:700}
h3{font-size:15px;line-height:1.45;font-weight:650}
p{margin:0 0 12px}strong{font-weight:650}
ul,ol{margin:0 0 12px;padding:0}
ol{padding-left:1.5em}ol>li{margin:5px 0;padding-left:2px}ol>li::marker{color:var(--muted);font-weight:650;font-variant-numeric:tabular-nums}
a{color:var(--accent-ink);text-decoration:underline;text-decoration-color:color-mix(in srgb,currentColor 35%,transparent);text-underline-offset:3px}
a:hover{text-decoration-color:currentColor}
code{font:.88em/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:var(--sunk);border:1px solid var(--line);padding:1px 5px;border-radius:6px}
hr{margin:28px 0;border:0;border-top:1px solid var(--line)}
table{border-collapse:separate;border-spacing:0;width:100%;font-size:14px}
th,td{padding:10px 14px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line)}
th{font-size:12px;line-height:1.5;font-weight:650;color:var(--muted);white-space:nowrap;background:var(--sunk)}
tbody tr:last-child td{border-bottom:0}tbody tr:hover td{background:var(--hover)}
th.num,td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
button{font:inherit;font-size:13px;line-height:20px;font-weight:600;color:var(--fg2);background:var(--surface);border:1px solid var(--line2);border-radius:9px;padding:5px 13px;cursor:pointer;transition:background-color .15s,border-color .15s,color .15s}
button:hover:not(:disabled){background:var(--hover);border-color:var(--faint);color:var(--fg)}
button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
button:disabled{opacity:.4;cursor:default}
button.primary{background:var(--accent);border-color:var(--accent);color:var(--on-accent);box-shadow:0 1px 2px rgba(77,107,254,.3)}
button.primary:hover:not(:disabled){background:var(--accent);border-color:var(--accent);color:var(--on-accent);filter:brightness(1.08)}
button.quiet{border-color:transparent;background:none;color:var(--muted)}
:where(input:not([type=checkbox],[type=radio],[type=range],[type=color],[type=file],[type=button],[type=submit],[type=reset],[type=image]),select,textarea){min-width:0;font:inherit;font-size:14px;line-height:20px;color:var(--fg);background:var(--surface);border:1px solid var(--line2);border-radius:9px;padding:7px 11px;transition:border-color .15s,box-shadow .15s}
:where(input,select,textarea):focus-visible{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
:where(input,textarea)::placeholder{color:var(--faint)}
:where(input[type=checkbox],input[type=radio],input[type=range],progress){accent-color:var(--accent)}`

// 现成的类：模板和手写页面都能用
export const KIT = `
.muted{color:var(--muted)}.grow{flex:1}
.sr{position:absolute;opacity:0;width:1px;height:1px;pointer-events:none}
.hd{margin:0 0 32px}.hd h1{margin:0}
.kicker{display:flex;align-items:center;gap:10px;margin:0 0 14px;font-size:12px;line-height:1;font-weight:700;letter-spacing:.12em;color:var(--accent-ink)}
.kicker::before{content:"";width:18px;height:3px;border-radius:2px;background:var(--accent)}
.sub{margin:10px 0 0;font-size:15px;color:var(--muted)}
.chip{display:inline-flex;align-items:center;padding:0 8px;border-radius:999px;font-size:12px;line-height:20px;font-weight:600;white-space:nowrap;vertical-align:1px;background:var(--accent-soft);color:var(--accent-ink)}
.chip.solid{background:var(--accent);color:var(--on-accent)}.chip.mute{background:var(--sunk);color:var(--muted)}.chip.warn{background:var(--warn-soft);color:var(--warn-ink)}.chip.good{background:var(--good-soft);color:var(--good-ink)}
.panel{background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow)}
.lab{display:block;margin:0 0 8px;font-size:12px;line-height:1;font-weight:700;letter-spacing:.12em;color:var(--accent-ink)}
.lead{margin:0 0 32px;font-size:17px;line-height:1.8;color:var(--fg2)}.lead>:last-child{margin-bottom:0}
.aside{margin:0 0 16px;padding:14px 18px;border-radius:12px;background:var(--sunk);font-size:14px;color:var(--fg2)}.aside>:last-child{margin-bottom:0}
.verdict{margin:28px 0 0;padding:18px 22px;border-radius:14px;background:var(--accent-soft)}.verdict>:last-child{margin-bottom:0}
.foot{margin-top:32px;padding-top:16px;border-top:1px solid var(--line);font-size:13px;color:var(--muted)}.foot>:last-child{margin-bottom:0}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));margin:0 0 32px;overflow:hidden}
.stat{min-width:0;padding:18px 22px 16px;box-shadow:-1px 0 0 var(--line),0 -1px 0 var(--line)}
.stat .l{font-size:13px;line-height:1.4;color:var(--muted)}
.stat .v{margin-top:8px;font-size:28px;line-height:1.15;font-weight:750;letter-spacing:-.01em;overflow-wrap:anywhere}.stat .v.sm{font-size:22px;line-height:1.3}
.stat .m{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;margin-top:10px;font-size:12px;line-height:1.4;color:var(--faint)}
.d{display:inline-flex;align-items:center;gap:1px;padding:0 7px;border-radius:999px;font-size:12px;line-height:20px;font-weight:650;white-space:nowrap;font-variant-numeric:tabular-nums;background:var(--sunk);color:var(--muted)}
.d.good{background:var(--good-soft);color:var(--good-ink)}.d.bad{background:var(--bad-soft);color:var(--bad-ink)}
.sec{padding:28px 0 20px;border-top:1px solid var(--line)}.sec>:last-child{margin-bottom:0}
.sec h2{display:flex;align-items:baseline;gap:12px}
.sec h2 .no{flex:none;font-size:13px;font-weight:750;letter-spacing:.04em;color:var(--accent-ink);font-variant-numeric:tabular-nums}
.sec .stats{margin-bottom:16px}
.tbl{overflow-x:auto;margin:0 0 16px}
.bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px 18px;margin:0 0 20px}
.seg{display:inline-flex;gap:2px;padding:3px;border-radius:10px;background:var(--sunk)}
.seg button{border:0;background:none;border-radius:7px;padding:4px 14px;color:var(--muted)}
.seg button:hover:not(:disabled){background:none;color:var(--fg)}
.seg button[aria-pressed=true]{background:var(--surface);color:var(--fg);box-shadow:0 1px 2px rgba(18,22,33,.1),0 0 0 1px var(--line)}
.toggle{display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--muted);cursor:pointer;user-select:none}
.toggle input{appearance:none;-webkit-appearance:none;position:relative;flex:none;width:30px;height:18px;margin:0;border-radius:999px;background:var(--line2);cursor:pointer;transition:background-color .2s}
.toggle input::after{content:"";position:absolute;left:2px;top:2px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .2s}
.toggle input:checked{background:var(--accent)}.toggle input:checked::after{transform:translateX(12px)}
.toggle input:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin:0 0 24px}
.field{display:flex;flex-direction:column;gap:6px;min-width:0}
.field>span:first-child{font-size:13px;line-height:1.4;font-weight:600;color:var(--fg2)}
.field :is(input,select,textarea){width:100%}
@media (max-width:560px){.hd{margin-bottom:24px}h1{font-size:24px}.lead{font-size:16px}
.stats{grid-template-columns:1fr 1fr}.stat{padding:14px 16px}.stat .v{font-size:22px}.stat .v.sm{font-size:18px}}`

// 只给手写页面的：标题、列表的间距（模板自己排），外层 .page 管宽度和留白；
// .panel 自带内边距（模板里各个部件自己给），一排大数字和表格贴着面板边（表格面板里别的东西，比如标题，还是缩进来）
const PAGE = `
h1{margin:0 0 12px}h2{margin:32px 0 12px}h3{margin:20px 0 8px}:is(h1,h2,h3):first-child{margin-top:0}
ul{padding-left:1.4em}ul>li{margin:5px 0;padding-left:2px}ul>li::marker{color:var(--accent)}
.page{max-width:960px;margin:0 auto;padding:36px 40px 40px}
.panel{padding:20px 22px;margin:0 0 20px}.panel>:last-child{margin-bottom:0}.panel.stats,.panel.tbl{padding:0}.panel.stats{margin-bottom:32px}
.panel.tbl>:not(table){padding-left:22px;padding-right:22px}.panel.tbl>:first-child:not(table,:has(table)){padding-top:18px}.panel.tbl>:last-child:not(table,:has(table)){padding-bottom:16px}
@media (max-width:560px){.page{padding:24px 18px 28px}}`

const MARK = 'dsp-design'
export const PAGE_STYLE = `@layer dsp{${TOKENS}${CORE}${PAGE}${KIT}}`

// 大数字（.stat .v）一行放不下就缩小字号（最小 16px），不折成两行；数字变了、窗口变了再量
const FIT = '(function(){var q=0;function fit(){q=0;var vs=document.querySelectorAll(".stat .v");for(var i=0;i<vs.length;i++){var v=vs[i];v.style.fontSize="";v.style.whiteSpace="nowrap";var f=parseFloat(getComputedStyle(v).fontSize),min=Math.min(f,16);while(v.scrollWidth>v.clientWidth+1&&f>min){f--;v.style.fontSize=f+"px"}v.style.whiteSpace=""}}' +
  'function later(){if(!q){q=1;requestAnimationFrame(fit)}}' +
  'addEventListener("DOMContentLoaded",function(){fit();new MutationObserver(later).observe(document.body,{subtree:true,childList:true,characterData:true})});addEventListener("resize",later);addEventListener("load",later)})()'

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

/** 手写的页面带上这套设计：整页就塞进 <head> 最前面；只给了一段就套成整页（外层 .page） */
export function withDesign(html, title = '') {
  if (html.includes(`id="${MARK}"`)) return html
  const tag = `<style id="${MARK}">${PAGE_STYLE}</style><script id="dsp-fit">${FIT}</script>`
  if (!/<!doctype\s+html|<html[\s>]/i.test(html)) {
    const lang = /[㐀-鿿]/.test(String(title) + html) ? 'zh' : 'en'
    const body = /\bclass\s*=\s*["'][^"']*\bpage\b/i.test(html) ? html : `<main class="page">${html}</main>`
    return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">` +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      `<title>${esc(title)}</title>${tag}</head><body>${body}</body></html>`
  }
  // 越靠前越好：dsp 这一层最先声明，页面自己要是也用 @layer，那些层都排在它后面、盖得过它
  const at = /<head(\s[^>]*)?>/i.exec(html) || /<html(\s[^>]*)?>/i.exec(html) || /<!doctype[^>]*>/i.exec(html)
  const i = at ? at.index + at[0].length : 0
  return html.slice(0, i) + tag + html.slice(i)
}
