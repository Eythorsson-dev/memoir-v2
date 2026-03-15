import { mount, unmount } from 'svelte'
import type { Snippet } from 'svelte'
import type { Attachment } from 'svelte/attachments'
import PopupContainer from './popup-container.svelte'

export type PopupBody = string | Snippet

export interface PopupOptions {
  title:     string
  subtitle?: string
  body:      PopupBody
}

const MARGIN = 8   // minimum distance from viewport edge

const CLOSE_DELAY        = 100   // ms grace before hiding
const INITIAL_OPEN_DELAY = 300   // ms dwell before first popup opens
const SWITCH_OPEN_DELAY  = 150   // ms dwell when switching within a warm group
                                  // must be > CLOSE_DELAY so old popup always closes first

// module-level singleton registry: group name → hide() of currently visible popup
const groups = new Map<string, () => void>()

export function computePosition(
  x: number,
  anchorTop: number, anchorBottom: number,
  popupW: number, popupH: number,
  vw: number, vh: number
): { left: number; top: number } {
  // x-axis: center on cursor, clamp to viewport edges
  const rawLeft = x - popupW / 2
  const left    = Math.max(MARGIN, Math.min(rawLeft, vw - popupW - MARGIN))

  // y-axis: prefer below row bottom, flip above row top if overflow
  const prefTop = anchorBottom
  const flipTop = anchorTop - popupH
  const rawTop  = prefTop + popupH > vh - MARGIN ? flipTop : prefTop
  const top     = Math.max(MARGIN, Math.min(rawTop, vh - popupH - MARGIN))

  return { left, top }
}

export function popup(options: PopupOptions, group?: string): Attachment {
  return (element: Element) => {
    let instance: ReturnType<typeof mount> | null = null
    const container = document.createElement('div')
    let hideTimeout: ReturnType<typeof setTimeout> | null = null
    let openTimeout: ReturnType<typeof setTimeout> | null = null

    const hide = () => {
      if (instance) { unmount(instance); instance = null }
      container.remove()
      if (group && groups.get(group) === hide) groups.delete(group)
    }

    const scheduleHide = () => {
      hideTimeout = setTimeout(hide, CLOSE_DELAY)
    }

    const cancelHide = () => {
      if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null }
    }

    const cancelOpen = () => {
      if (openTimeout) { clearTimeout(openTimeout); openTimeout = null }
    }

    const show = (x: number, anchorTop: number, anchorBottom: number) => {
      // Close any other popup in the same group immediately (no delay)
      if (group) {
        const prev = groups.get(group)
        if (prev && prev !== hide) prev()
        groups.set(group, hide)
      }
      if (instance) return  // re-entered while hide was pending; already mounted
      document.body.appendChild(container)
      instance = mount(PopupContainer, {
        target: container,
        props: { ...options, x, anchorTop, anchorBottom }
      })
    }

    const onEnter = (evt: Event) => {
      cancelHide()
      cancelOpen()
      const e = evt as MouseEvent
      const isWarm = group != null && groups.has(group) && groups.get(group) !== hide
      const delay = isWarm ? SWITCH_OPEN_DELAY : (group != null ? INITIAL_OPEN_DELAY : 0)
      if (delay > 0) {
        openTimeout = setTimeout(() => {
          openTimeout = null
          const rect = element.getBoundingClientRect()
          show(e.clientX, rect.top, rect.bottom)
        }, delay)
      } else {
        const rect = element.getBoundingClientRect()
        show(e.clientX, rect.top, rect.bottom)
      }
    }

    const onLeave = () => {
      cancelOpen()
      scheduleHide()
    }

    container.addEventListener('mouseenter', cancelHide)
    container.addEventListener('mouseleave', scheduleHide)
    element.addEventListener('mouseenter', onEnter)
    element.addEventListener('mouseleave', onLeave)

    return () => {
      element.removeEventListener('mouseenter', onEnter)
      element.removeEventListener('mouseleave', onLeave)
      container.removeEventListener('mouseenter', cancelHide)
      container.removeEventListener('mouseleave', scheduleHide)
      cancelHide()
      cancelOpen()
      hide()
    }
  }
}
