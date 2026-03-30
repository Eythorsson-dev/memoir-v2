import type { Attachment } from 'svelte/attachments'

const SHOW_DELAY = 400 // ms dwell before tooltip appears

/**
 * Attachment that shows a small tooltip above the element on hover.
 *
 * Suppresses the tooltip while the element is disabled. The shortcut
 * string (if any) must be pre-formatted by the caller — pass the output
 * of formatShortcut or an equivalent string.
 *
 * @param label - Accessible label displayed in the tooltip.
 * @param shortcutStr - Optional pre-formatted shortcut string (e.g. `⌘B`).
 */
export function tooltip(label: string, shortcutStr?: string): Attachment {
  return (element: Element) => {
    let el: HTMLSpanElement | null = null
    let showTimeout: ReturnType<typeof setTimeout> | null = null

    const show = () => {
      const rect = element.getBoundingClientRect()
      el = document.createElement('span')
      el.style.cssText = [
        'position:fixed',
        `left:${rect.left + rect.width / 2}px`,
        `bottom:${window.innerHeight - rect.top + 6}px`,
        'transform:translateX(-50%)',
        'white-space:nowrap',
        'font-size:11px',
        'padding:3px 8px',
        'border-radius:4px',
        'pointer-events:none',
        'z-index:100',
        'background:var(--tooltip-bg)',
        'color:var(--tooltip-color)',
      ].join(';')

      const text = document.createTextNode(label)
      el.appendChild(text)

      if (shortcutStr) {
        const kbd = document.createElement('kbd')
        kbd.textContent = shortcutStr
        kbd.style.cssText = 'opacity:0.65;font-family:inherit;margin-left:4px'
        el.appendChild(kbd)
      }

      document.body.appendChild(el)
    }

    const hide = () => {
      el?.remove()
      el = null
    }

    const cancelShow = () => {
      if (showTimeout) { clearTimeout(showTimeout); showTimeout = null }
    }

    const onEnter = () => {
      if ((element as HTMLButtonElement).disabled) return
      cancelShow()
      showTimeout = setTimeout(() => { showTimeout = null; show() }, SHOW_DELAY)
    }

    const onLeave = () => {
      cancelShow()
      hide()
    }

    element.addEventListener('mouseenter', onEnter)
    element.addEventListener('mouseleave', onLeave)

    return () => {
      element.removeEventListener('mouseenter', onEnter)
      element.removeEventListener('mouseleave', onLeave)
      cancelShow()
      hide()
    }
  }
}
