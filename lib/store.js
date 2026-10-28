/**
 * 页面存在 ~/.dsh/dsh-pages/pages/<id>/ 下：
 *
 *   meta.json  { id, title, display, created, updated, versions: [{ v, title, created, bytes, check }] }
 *   v1.html …  模型给的原样 HTML（套外壳、塞脚本都在送出去时做，以后改外壳老页面也跟着变）
 *   v1.jpg …   体检时截的缩略图（「我的页面」里用）；v1-dark.jpg 是深色的
 *   state.json 页面自己用 localStorage 存的东西（各版本共用：改出新版本，用户填过的还在）
 *
 * 最早的原型存成平铺的 <id>.html + <id>.json：照样能读，当第 1 版；带它的 page_id 改页面时搬进文件夹。
 * 「我的页面」里删掉的整页挪进 ~/.dsh/dsh-pages/trash/（不真删，手动挪回 pages/ 就回来了）。
 * 同一页的写入排队，两次改同一页不会抢版本号；另外还有一把跨进程的锁（pages/.locks/<id>，DSH 桌面端和命令行
 * 同时开着、都在改同一页时也不会互相覆盖）。
 * meta.json 读进来先校验：版本号只认正整数（拼文件名用），坏掉的记录当没有这一页，不拖垮整个列表。
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

export const ID_RE = /^[a-z0-9]{6,16}-[a-f0-9]{8}$/
const MAX_VERSIONS = 200

export function dataDir() {
  return path.join(os.homedir(), '.dsh', 'dsh-pages', 'pages')
}

export function newId() {
  return Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex')
}

const pageDir = (id) => path.join(dataDir(), id)

async function readJson(file) {
  try { return JSON.parse(await fs.promises.readFile(file, 'utf8')) } catch { return null }
}

/** 校验 meta：版本号必须是正整数、不重复（按从小到大排），一个像样的版本都没有 → null */
export function cleanMeta(meta, id) {
  if (!meta || typeof meta !== 'object' || !Array.isArray(meta.versions)) return null
  const seen = new Set()
  const versions = meta.versions
    .filter((x) => x && typeof x === 'object' && Number.isSafeInteger(x.v) && x.v > 0 && !seen.has(x.v) && seen.add(x.v))
    .map((x) => ({ ...x, title: typeof x.title === 'string' ? x.title : '' }))
    .sort((a, b) => a.v - b.v)
  if (!versions.length) return null
  return { ...meta, id, title: typeof meta.title === 'string' ? meta.title : '', display: meta.display === 'card' ? 'card' : 'inline', versions }
}

/** 这一页的记录；没有这一页（或记录坏了）→ null */
export async function readMeta(id) {
  if (!ID_RE.test(String(id))) return null
  const raw = await readJson(path.join(pageDir(id), 'meta.json'))
  if (raw) return cleanMeta(raw, id)
  // 原型留下的平铺文件
  const old = await readJson(path.join(dataDir(), id + '.json'))
  if (!old || !fs.existsSync(path.join(dataDir(), id + '.html'))) return null
  const created = old.created || new Date(0).toISOString()
  const title = typeof old.title === 'string' ? old.title : ''
  return { id, title, display: 'card', created, updated: created, legacy: true, versions: [{ v: 1, title, created }] }
}

/** 某一版的 HTML（v 不给就是最新一版）→ { v, html } 或 null */
export async function readVersion(id, v) {
  const meta = await readMeta(id)
  if (!meta || !meta.versions.length) return null
  const want = v ? meta.versions.find((x) => x.v === Number(v)) : meta.versions[meta.versions.length - 1]
  if (!want) return null
  const file = meta.legacy ? path.join(dataDir(), id + '.html') : path.join(pageDir(id), `v${want.v}.html`)
  try { return { v: want.v, meta, html: await fs.promises.readFile(file, 'utf8') } } catch { return null }
}

export function thumbFile(id, v, dark) {
  return path.join(pageDir(id), `v${Number(v)}${dark ? '-dark' : ''}.jpg`)
}

const LOCK_STALE_MS = 15000 // 锁放了这么久还没撤：拿锁的进程多半没了
const LOCK_WAIT_MS = 10000

/** 跨进程的锁：mkdir 是原子的，建成了就是拿到了 */
async function withLock(id, fn) {
  const dir = path.join(dataDir(), '.locks')
  const lock = path.join(dir, id)
  await fs.promises.mkdir(dir, { recursive: true })
  const until = Date.now() + LOCK_WAIT_MS
  for (;;) {
    try {
      await fs.promises.mkdir(lock)
      break
    } catch (e) {
      if (e.code !== 'EEXIST') throw e
      try {
        if (Date.now() - (await fs.promises.stat(lock)).mtimeMs > LOCK_STALE_MS) { await fs.promises.rmdir(lock).catch(() => {}); continue }
      } catch { continue } // 刚被放掉
      if (Date.now() > until) throw new Error('这一页正忙（别的 DSH 进程在改它），稍后再试')
      await new Promise((r) => setTimeout(r, 25 + Math.random() * 50))
    }
  }
  try { return await fn() } finally { await fs.promises.rmdir(lock).catch(() => {}) }
}

const queues = new Map()
function serial(id, fn0) {
  const fn = () => withLock(id, fn0)
  const prev = queues.get(id) || Promise.resolve()
  const next = prev.then(fn, fn)
  const tail = next.catch(() => {})
  queues.set(id, tail)
  tail.then(() => { if (queues.get(id) === tail) queues.delete(id) })
  return next
}

async function writeMeta(id, meta) {
  const file = path.join(pageDir(id), 'meta.json')
  const tmp = file + '.' + process.pid + '.tmp'
  await fs.promises.writeFile(tmp, JSON.stringify(meta, null, 2), 'utf8')
  await fs.promises.rename(tmp, file)
}

/**
 * 存一版。没给 pageId → 新页面第 1 版；给了 → 这一页的下一版（找不到这一页 → 抛错）。
 * 返回 { id, v, meta }
 */
export function saveVersion({ pageId, title, html, display }) {
  const id = pageId || newId()
  return serial(id, async () => {
    const now = new Date().toISOString()
    let meta = null
    if (pageId) {
      meta = await readMeta(pageId)
      if (!meta) throw new Error(`找不到 page_id「${pageId}」。要做新页面就别带 page_id`)
      if (meta.versions.length >= MAX_VERSIONS) throw new Error(`这一页已经存了 ${MAX_VERSIONS} 版，做成新页面吧（别带 page_id）`)
    }
    await fs.promises.mkdir(pageDir(id), { recursive: true })
    if (meta && meta.legacy) {
      // 原型的平铺文件搬进文件夹当第 1 版（原文件留着不动）
      await fs.promises.copyFile(path.join(dataDir(), id + '.html'), path.join(pageDir(id), 'v1.html'))
      delete meta.legacy
    }
    if (!meta) meta = { id, title, display, created: now, updated: now, versions: [] }
    const v = (meta.versions.length ? meta.versions[meta.versions.length - 1].v : 0) + 1
    await fs.promises.writeFile(path.join(pageDir(id), `v${v}.html`), html, 'utf8')
    meta = {
      ...meta,
      title,
      display: display || meta.display || 'inline',
      updated: now,
      versions: [...meta.versions, { v, title, created: now, bytes: Buffer.byteLength(html, 'utf8') }],
    }
    await writeMeta(id, meta)
    return { id, v, meta }
  })
}

/** 体检做完把结果记到那一版上（缩略图另存） */
export function noteCheck(id, v, check, jpg, jpgDark) {
  return serial(id, async () => {
    const meta = await readMeta(id)
    if (!meta || meta.legacy) return
    if (jpg && jpg.length) await fs.promises.writeFile(thumbFile(id, v), jpg).catch(() => {})
    if (jpgDark && jpgDark.length) await fs.promises.writeFile(thumbFile(id, v, true), jpgDark).catch(() => {})
    const versions = meta.versions.map((x) => (x.v === v ? { ...x, check, thumb: !!(jpg && jpg.length) } : x))
    await writeMeta(id, { ...meta, versions })
  })
}

// 页面里按字数限 25 万字左右（runtime.js 的 LIMIT）；一个汉字 3 字节，这里按字节放宽到 1 MB
const STATE_MAX = 1024 * 1024

/** 页面存过的 localStorage：{ 键: 值 }，都是字符串；没有就是 {} */
export async function readState(id) {
  if (!ID_RE.test(String(id))) return {}
  const st = await readJson(path.join(pageDir(id), 'state.json'))
  return st && typeof st === 'object' && !Array.isArray(st) ? st : {}
}

/**
 * 把页面对 localStorage 的改动合进存着的那份：{ clear?, del?: [键], set?: { 键: 值 } }（先清、再删、再设）。
 * 发的是改动不是整份：两个窗口（电脑上和手机上）开着同一页、各改各的键，谁也不会抹掉谁。
 * 不是这一页 / 格式不对 / 太大 → 抛错（带 code）
 */
export function writeState(id, ops) {
  return serial(id, async () => {
    if (!(await readMeta(id))) throw Object.assign(new Error('找不到这一页'), { code: 404 })
    if (!ops || typeof ops !== 'object' || Array.isArray(ops)) throw Object.assign(new Error('bad state'), { code: 400 })
    const set = ops.set && typeof ops.set === 'object' && !Array.isArray(ops.set) ? ops.set : {}
    const del = Array.isArray(ops.del) ? ops.del : []
    const clean = ops.clear === true ? {} : await readState(id)
    for (const k of del) delete clean[String(k)]
    for (const [k, v] of Object.entries(set)) if (typeof v === 'string') clean[k] = v
    const text = JSON.stringify(clean)
    if (Buffer.byteLength(text, 'utf8') > STATE_MAX) throw Object.assign(new Error('too large'), { code: 413 })
    await fs.promises.mkdir(pageDir(id), { recursive: true })
    const file = path.join(pageDir(id), 'state.json')
    const tmp = file + '.' + process.pid + '.tmp'
    await fs.promises.writeFile(tmp, text, 'utf8')
    await fs.promises.rename(tmp, file)
  })
}

export function trashDir() {
  return path.join(path.dirname(dataDir()), 'trash')
}

/** 删一页：整个文件夹（和原型的平铺文件）挪进回收站。没有这一页 → false */
export function trashPage(id) {
  if (!ID_RE.test(String(id))) return Promise.resolve(false)
  return serial(id, async () => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const moves = [[pageDir(id), id], [path.join(dataDir(), id + '.html'), id + '.html'], [path.join(dataDir(), id + '.json'), id + '.json']]
      .filter(([from]) => fs.existsSync(from))
    if (!moves.length) return false
    await fs.promises.mkdir(trashDir(), { recursive: true })
    for (const [from, name] of moves) await fs.promises.rename(from, path.join(trashDir(), `${stamp}-${name}`))
    return true
  })
}

/** 「我的页面」：最近改过的在前 */
export async function listPages(limit = 300) {
  let names = []
  try { names = await fs.promises.readdir(dataDir()) } catch { return [] }
  const ids = new Set()
  for (const n of names) {
    const id = n.replace(/\.json$/, '')
    if (ID_RE.test(id)) ids.add(id)
  }
  const out = []
  for (const id of ids) {
    const meta = await readMeta(id).catch(() => null)
    if (!meta || !meta.versions.length) continue
    const last = meta.versions[meta.versions.length - 1]
    out.push({ id, title: meta.title || last.title || '', updated: meta.updated, created: meta.created, v: last.v, count: meta.versions.length, thumb: !!last.thumb })
  }
  out.sort((a, b) => String(b.updated).localeCompare(String(a.updated)))
  return out.slice(0, limit)
}
