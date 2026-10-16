// Read-only diagnostics for the original Linux gesture failure. No event cancellation.
async function capture(page, track, point) {
  return track.evaluate((element, point) => {
    if (!window.__mobileTouchEvents) {
      window.__mobileTouchEvents = []
      for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
        document.addEventListener(type, event => {
          const touch = event.touches[0] || event.changedTouches[0]
          window.__mobileTouchEvents.push({ type, target: event.target.tagName, x: touch?.clientX, y: touch?.clientY, scrollY })
        }, { passive: true, capture: true })
      }
    }
    const rect = element.getBoundingClientRect()
    const hit = document.elementFromPoint(point.x, point.y)
    const ancestors = []
    for (let node = hit; node; node = node.parentElement) {
      const css = getComputedStyle(node)
      ancestors.push({ tag: node.tagName, carousel: node.getAttribute('data-mobile-carousel'), touchAction: css.touchAction, overflowY: css.overflowY, scrollTop: node.scrollTop })
    }
    return { point, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, hitInsideTrack: element.contains(hit), hitTag: hit?.tagName, scrollY, scrollLeft: element.scrollLeft, viewport: innerHeight, documentHeight: document.documentElement.scrollHeight, ancestors, events: [...window.__mobileTouchEvents] }
  }, point)
}
module.exports = { capture }
