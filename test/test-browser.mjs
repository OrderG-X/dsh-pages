/**
 * 无头浏览器的进程管理（不开真浏览器，用假进程）：node --test test/test-browser.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'

const { createBrowser } = await import(new URL('../lib/browser.js', import.meta.url))

/** 假浏览器：收到指令过 delay 毫秒才回话 */
function fakeLaunch(delay) {
  const spawned = []
  const launch = () => {
    const p = new EventEmitter()
    const input = new PassThrough()
    const output = new PassThrough()
    p.pid = 4242
    p.stdio = [null, null, null, input, output]
    p.kill = () => { setImmediate(() => p.emit('exit', 0)) }
    let buf = ''
    input.on('data', (c) => {
      buf += c
      let i
      while ((i = buf.indexOf('\0')) >= 0) {
        const msg = JSON.parse(buf.slice(0, i))
        buf = buf.slice(i + 1)
        setTimeout(() => output.write(JSON.stringify({ id: msg.id, result: { product: 'Fake/1' } }) + '\0'), delay)
      }
    })
    spawned.push(p)
    return p
  }
  return { launch, spawned }
}

test('浏览器还在开（进程有了、还没回话）：第二个来的也一起等，开好前不算 running', async () => {
  const { launch, spawned } = fakeLaunch(150)
  const b = createBrowser({ bin: '/fake/chrome', launch, platform: 'linux' })
  try {
    const t0 = Date.now()
    const a = b.ready()
    await new Promise((r) => setTimeout(r, 20))
    assert.equal(b.running(), false)
    await b.ready()
    assert.ok(Date.now() - t0 >= 140, '第二个也等到了回话：' + (Date.now() - t0))
    await a
    assert.equal(b.running(), true)
    assert.equal(spawned.length, 1)
  } finally {
    b.destroy()
  }
})
