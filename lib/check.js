/**
 * 体检和导出：在无头浏览器里真打开页面（和对话里一样的沙箱、一样的注入脚本）。
 *
 *   checkPage   720 宽（对话里的宽度）量：脚本报错 / 资源载不进来、空白页、横向溢出、截缩略图；
 *               切到深色看背景变没变（再截一张深色缩略图）；再缩到 390 宽（手机）量一次横向溢出；
 *               最后照对话里的做法嵌一遍（先 420 高，再按页面报的高度撑开），量出嵌进去的高度，
 *               顺便看出「跟着窗口越撑越长」的页面（100vh 再加边距）
 *   shootPage   整页截 PNG（2 倍）
 *   printPage   存 PDF（A4，带背景色）
 */

const settle = (ms) => `new Promise((r) => setTimeout(r, ${ms}))`

// 在页面里跑：空白、溢出、背景亮度
const PROBE = String.raw`(() => {
  const vw = innerWidth
  const lum = (c) => {
    const m = String(c).match(/rgba?\(([^)]+)\)/)
    if (!m) return null
    const [r, g, b, a = 1] = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number)
    if (a < 0.1) return null
    const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const bgOf = () => {
    for (const el of [document.body, document.documentElement]) {
      if (!el) continue
      const l = lum(getComputedStyle(el).backgroundColor)
      if (l !== null) return l
    }
    // 都是透明：看 color-scheme 给的画布底色
    return getComputedStyle(document.documentElement).colorScheme.includes('dark') ? 0.02 : 1
  }
  const name = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '')
  const wide = []
  if (document.documentElement.scrollWidth > vw + 2) {
    for (const el of document.body ? document.body.querySelectorAll('*') : []) {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.right > vw + 2 && !(el.parentElement && el.parentElement.getBoundingClientRect().right > vw + 2)) {
        wide.push(name(el) + ' 宽 ' + Math.round(r.width) + 'px')
        if (wide.length >= 3) break
      }
    }
    if (!wide.length) wide.push('页面宽 ' + document.documentElement.scrollWidth + 'px')
  }
  const b = document.body
  const visible = b ? b.innerText.trim().length + b.querySelectorAll('canvas,svg,img,video,iframe,input,button,table').length : 0
  return {
    errors: (window.__dsp && window.__dsp.errors || []).slice(0, 8),
    blank: visible === 0,
    wide,
    bg: bgOf(),
    height: window.__dsp ? window.__dsp.measure() : document.documentElement.scrollHeight,
  }
})()`

const MEASURE = 'window.__dsp ? window.__dsp.measure() : document.documentElement.scrollHeight'
// 对话里嵌页面的规矩（同 client.js）：先按 EMBED_H 高，最高 EMBED_MAX
const EMBED_H = 420
const EMBED_MAX = 4000

/**
 * 照对话里的做法嵌一遍：视口先 720×420，页面报多高就把视口调成多高，直到不再变。
 * → { height, runaway }；runaway：每撑开一次就多出同样一截（高度跟着窗口走），永远停不下来
 */
async function embedHeight(page) {
  let h = EMBED_H
  let delta = 0
  let same = 0
  for (let i = 0; i < 6; i++) {
    await page.call('Emulation.setDeviceMetricsOverride', { width: 720, height: h, deviceScaleFactor: 1, mobile: false })
    const n = Math.min(EMBED_MAX, Math.max(60, Math.ceil(Number(await page.eval(`${settle(120)}.then(() => ${MEASURE})`)) || h)))
    const d = n - h
    if (Math.abs(d) < 2) return { height: h, runaway: false }
    if (d > 0 && Math.abs(d - delta) < 2) { if (++same >= 2) return { height: h, runaway: true } } else same = 0
    delta = d
    h = n
  }
  return { height: h, runaway: false }
}

/**
 * url：带体检口令、theme=light 的页面地址（或现算地址的函数）。
 * 返回 { ok, issues: [文字], height（嵌在对话里的高度）, darkOk, jpg, jpgDark }；
 * 载进来的不是这一页（口令过期、页面被删）→ 抛错，不记结果、不存缩略图
 */
export async function checkPage(browser, url) {
  return browser.withPage({ url, w: 720, h: 900 }, async (page) => {
    // 页面里的小脚本在：说明载进来的确实是这一页（401 / 404 回的都没有它）
    if (!(await page.eval('!!(window.__dsp && window.__dsp.measure)'))) throw new Error('page not served')
    await page.eval(settle(700)) // 图表库、动画跑一会儿
    const light = await page.eval(PROBE)
    let jpg = null
    try { jpg = await page.shot({ clip: { x: 0, y: 0, width: 720, height: 450 }, quality: 72 }) } catch { /* 没截到就不要缩略图 */ }
    await page.eval(`window.__dsp && window.__dsp.setTheme('dark'), ${settle(250)}`)
    const dark = await page.eval(PROBE)
    let jpgDark = null
    try { jpgDark = await page.shot({ clip: { x: 0, y: 0, width: 720, height: 450 }, quality: 72 }) } catch { /* 深色的没截到就用浅色的 */ }
    await page.call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false })
    await page.eval(`window.__dsp && window.__dsp.setTheme('light'), ${settle(300)}`)
    const phone = await page.eval(PROBE)
    let embed = { height: light.height, runaway: false }
    try { embed = await embedHeight(page) } catch { /* 量不了就用 900 高时量的 */ }

    const issues = []
    let errors = [...new Set([...light.errors, ...dark.errors, ...phone.errors])]
    // 页面里的小脚本没记到（被页面自己弄坏了之类），就用浏览器报上来的
    if (!errors.length) errors = [...new Set(page.exceptions)]
    if (errors.length) issues.push('页面报错：' + errors.slice(0, 5).join('；'))
    if (light.blank) issues.push('页面是空白的（没有文字和图）')
    if (light.wide.length) issues.push('对话宽度（720px）下横向溢出：' + light.wide.join('、'))
    if (phone.wide.length) issues.push('手机宽度（390px）下横向溢出：' + phone.wide.join('、'))
    // 浅色时背景就是深的（深色风格的页面）不算问题；深色时背景还是亮的才算没适配
    const darkOk = !(dark.bg > 0.4 && light.bg > 0.4)
    if (!darkOk) issues.push('深色模式下背景还是浅色：颜色写成 CSS 变量，在 :root[data-theme="dark"] 里给深色的值')
    if (page.blocked.length) issues.push('页面会自己跳到别的地址（' + page.blocked.slice(0, 2).join('、') + '），体检时拦下了：别让页面自己跳转；要给外部链接就用普通的 <a href>，用户点了会在新窗口开')
    if (embed.runaway) issues.push('嵌在对话里时高度跟着窗口越撑越长（用了 100vh / height:100% 又加了边距）：去掉 100vh，让高度跟着内容走')
    return { ok: issues.length === 0, issues, height: embed.height, darkOk, jpg, jpgDark }
  })
}

// 页面里横着能滑的框（时间多的路线图、宽表格）还差多宽才能全露出来；外面套着的有最大宽度（正文 960px）的一起放宽同样多
const WIDEN = `(() => {
  let more = 0
  for (const el of document.querySelectorAll('body *')) {
    const s = getComputedStyle(el)
    if (!/auto|scroll/.test(s.overflowX) || !el.clientWidth || el.scrollWidth <= el.clientWidth + 1) continue
    const m = el.scrollWidth - el.clientWidth
    more = Math.max(more, m)
    for (let a = el; a; a = a.parentElement) if (getComputedStyle(a).maxWidth !== 'none') a.style.maxWidth = Math.ceil(a.getBoundingClientRect().width + m) + 'px'
  }
  return Math.ceil(more)
})()`
const SHOT_MAX_W = 2400

/**
 * 截图前把横着能滑的都撑开：放宽外层的最大宽度、视口加宽（最宽 2400px），直到不用再滑。返回撑到的宽度。
 * 撑开以后路线图的淡出遮罩会自己去掉（它听尺寸变化）
 */
export async function unscroll(page, width, scale = 1) {
  for (let i = 0; i < 3 && width < SHOT_MAX_W; i++) {
    const more = Number(await page.eval(WIDEN)) || 0
    if (!more) break
    width = Math.min(SHOT_MAX_W, width + more)
    await page.call('Emulation.setDeviceMetricsOverride', { width, height: 800, deviceScaleFactor: scale, mobile: false })
    await page.eval(settle(300))
  }
  return width
}

/** 整页截图：横着能滑的先撑开，再按内容高度撑开视口，再截（最高 12000px） */
export async function shootPage(browser, url, { width = 1024 } = {}) {
  return browser.withPage({ url, w: width, h: 800, scale: 2 }, async (page) => {
    await page.eval(settle(700))
    width = await unscroll(page, width, 2)
    const h = Math.min(12000, Math.max(200, Number(await page.eval('window.__dsp ? window.__dsp.measure() : document.documentElement.scrollHeight')) || 800))
    await page.call('Emulation.setDeviceMetricsOverride', { width, height: h, deviceScaleFactor: 2, mobile: false })
    await page.eval(settle(300))
    const r = await page.call('Page.captureScreenshot', { format: 'png' })
    return Buffer.from(r.data, 'base64')
  })
}

// A4 减去两边 0.4 英寸页边距，按 96 dpi 折成 CSS 像素：打印时页面就排这么宽（横过来就是长边那么宽）
const PRINT_W = Math.floor((8.27 - 0.8) * 96)
const PRINT_W_LAND = Math.floor((11.69 - 0.8) * 96)

export async function printPage(browser, url) {
  // 视口直接按纸的宽度开：流程图、思维导图这些用脚本量着画的线，量的和打出来的是同一种排版，不会错位
  return browser.withPage({ url, w: PRINT_W, h: 800 }, async (page) => {
    await page.eval(settle(700))
    // 横着能滑的（时间段多的路线图、宽表格）：纸上不能滑，按全露出来要的宽度排，再整体缩到纸宽；
    // 比竖版宽出 1/4 以上就横过来打，字不至于太小
    const need = await unscroll(page, PRINT_W)
    let landscape = false
    let scale = 1
    if (need > PRINT_W) {
      landscape = need > PRINT_W * 1.25
      const paper = landscape ? PRINT_W_LAND : PRINT_W
      scale = Math.max(0.1, Math.min(1, paper / need))
      // 排版宽度 = 纸宽 / 缩放；视口跟它一样宽，脚本画的线才对得上
      const w = Math.round(paper / scale)
      if (w !== need) {
        await page.call('Emulation.setDeviceMetricsOverride', { width: w, height: 800, deviceScaleFactor: 1, mobile: false })
        await page.eval(settle(300))
      }
    }
    const r = await page.call('Page.printToPDF', { printBackground: true, landscape, scale, paperWidth: 8.27, paperHeight: 11.69, marginTop: 0.4, marginBottom: 0.4, marginLeft: 0.4, marginRight: 0.4 })
    return Buffer.from(r.data, 'base64')
  })
}
