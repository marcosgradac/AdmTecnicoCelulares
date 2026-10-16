const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// A second touch during a native fling first brakes the existing gesture.
// Wait for an actual snap point AND sustained rest, not a platform-specific delay.
async function waitForHorizontalRest(page, track) {
  await track.evaluate(element => { delete element.__mobileHorizontalRest })
  await page.waitForFunction(element => {
    const x = element.scrollLeft, now = performance.now(), previous = element.__mobileHorizontalRest
    if (!previous || Math.abs(previous.x - x) > .25) {
      element.__mobileHorizontalRest = { x, at: now }
      return false
    }
    const items = [...element.querySelectorAll('[data-carousel-item]')]
    const first = items[0]?.offsetLeft || 0
    return now - previous.at >= 160 && items.some(item => Math.abs(item.offsetLeft - first - x) < 1.1)
  }, await track.elementHandle(), { polling: 'raf', timeout: 5000 })
}

async function waitForPageRest(page) {
  await page.evaluate(() => { delete window.__mobilePageRest })
  await page.waitForFunction(() => {
    const now = performance.now(), previous = window.__mobilePageRest
    if (!previous || Math.abs(previous.y - scrollY) > .25) {
      window.__mobilePageRest = { y: scrollY, at: now }
      return false
    }
    return now - previous.at >= 160
  }, null, { polling: 'raf', timeout: 5000 })
}

async function pointOnTrack(page, track) {
  await track.scrollIntoViewIfNeeded()
  await waitForPageRest(page)
  const bounds = await track.boundingBox()
  assert(bounds, 'Carousel must have a visible touch target')
  const viewport = page.viewportSize()
  const point = {
    x: Math.min(bounds.x + bounds.width * .8, viewport.width - 30),
    y: (Math.max(0, bounds.y) + Math.min(viewport.height, bounds.y + bounds.height)) / 2,
  }
  assert(await track.evaluate((element, point) => element.contains(document.elementFromPoint(point.x, point.y)), point), 'Touch must start on the actual carousel')
  return { ...point, width: bounds.width }
}

async function swipe(session, point, dx, dy) {
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: point.x, y: point.y }] })
  for (let step = 1; step <= 6; step++) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x + dx * step / 6, y: point.y + dy * step / 6 }] })
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

async function assertNativeTouch(page, track) {
  const session = await page.context().newCDPSession(page)
  try {
    await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 })
    await track.press('Home')
    await waitForHorizontalRest(page, track)
    const horizontalPoint = await pointOnTrack(page, track)
    const horizontalBefore = await track.evaluate(element => element.scrollLeft)
    await swipe(session, horizontalPoint, -horizontalPoint.width * .65, 0)
    await waitForHorizontalRest(page, track)
    const horizontalAfter = await track.evaluate(element => element.scrollLeft)
    assert(horizontalAfter > horizontalBefore + 1, 'Native touch swipe must move carousel')

    // Recompute geometry after the previous gesture and any page movement.
    const verticalPoint = await pointOnTrack(page, track)
    const beforeVertical = process.env.MOBILE_UX_DIAGNOSTICS
      ? await require('./mobile-touch-diagnostics.cjs').capture(page, track, verticalPoint) : undefined
    const room = await page.evaluate(() => ({ y: scrollY, below: document.documentElement.scrollHeight - innerHeight - scrollY }))
    const direction = room.below >= 48 ? 1 : room.y >= 48 ? -1 : 0
    const result = { horizontal: { before: horizontalBefore, after: horizontalAfter }, vertical: null }
    if (direction) {
      const distance = Math.min(120, direction > 0 ? verticalPoint.y - 16 : page.viewportSize().height - verticalPoint.y - 16)
      assert(distance >= 30, 'Vertical gesture needs a visible path inside the viewport')
      await swipe(session, verticalPoint, 0, -direction * distance)
      await waitForPageRest(page)
      const after = await page.evaluate(() => scrollY)
      assert(direction * (after - room.y) > 1, 'Vertical touch on carousel must scroll page')
      result.vertical = { before: room.y, after, direction }
    } else {
      result.vertical = { noScrollRoom: true, before: room.y, below: room.below }
    }
    if (process.env.MOBILE_UX_DIAGNOSTICS) {
      const directory = path.resolve(process.env.MOBILE_UX_OUTPUT_DIR || path.join(__dirname, '../../artifacts/mobile-ux'))
      fs.mkdirSync(directory, { recursive: true })
      const afterVertical = await require('./mobile-touch-diagnostics.cjs').capture(page, track, verticalPoint)
      fs.appendFileSync(path.join(directory, 'native-touch.jsonl'), JSON.stringify({ url: page.url(), viewport: page.viewportSize(), label: await track.getAttribute('aria-label'), ...result, beforeVertical, afterVertical }) + '\n')
    }
    return result
  } finally {
    await session.detach()
  }
}
module.exports = { waitForHorizontalRest, assertNativeTouch }
