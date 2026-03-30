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

/**
 * Core hover attachment. Calls `show` after an optional delay on mouseenter
 * and `hide` (optionally deferred) on mouseleave.
 *
 * @param show - Called with `(x, anchorTop, anchorBottom)` when the hover delay elapses.
 * @param hide - Called to dismiss the overlay.
 * @param options.openDelay - ms to wait before calling `show`. Accepts a callback so
 *   the delay can be computed dynamically at hover time (e.g. warm-group detection).
 * @param options.closeDelay - ms grace period before calling `hide` on mouseleave.
 * @param options.keepOpen - If provided, mouseenter on this element cancels any
 *   pending hide so the overlay stays visible when the pointer moves onto it.
 */
export function hoverAttachment(
  show: (x: number, anchorTop: number, anchorBottom: number) => void,
  hide: () => void,
  {
    openDelay = 0,
    closeDelay = 0,
    keepOpen,
  }: {
    openDelay?: number | (() => number)
    closeDelay?: number
    keepOpen?: HTMLElement
  } = {}
): Attachment {
  return (element: Element) => {
    let hideTimeout: ReturnType<typeof setTimeout> | null = null
    let openTimeout: ReturnType<typeof setTimeout> | null = null

    const scheduleHide = () => {
      if (closeDelay > 0) {
        hideTimeout = setTimeout(hide, closeDelay)
      } else {
        hide()
      }
    }

    const cancelHide = () => {
      if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null }
    }

    const cancelOpen = () => {
      if (openTimeout) { clearTimeout(openTimeout); openTimeout = null }
    }

    const onEnter = (evt: Event) => {
      cancelHide()
      cancelOpen()
      const { clientX } = evt as MouseEvent
      const delay = typeof openDelay === 'function' ? openDelay() : openDelay
      if (delay > 0) {
        openTimeout = setTimeout(() => {
          openTimeout = null
          const rect = element.getBoundingClientRect()
          show(clientX, rect.top, rect.bottom)
        }, delay)
      } else {
        const rect = element.getBoundingClientRect()
        show(clientX, rect.top, rect.bottom)
      }
    }

    const onLeave = () => {
      cancelOpen()
      scheduleHide()
    }

    if (keepOpen) {
      keepOpen.addEventListener('mouseenter', cancelHide)
      keepOpen.addEventListener('mouseleave', scheduleHide)
    }
    element.addEventListener('mouseenter', onEnter)
    element.addEventListener('mouseleave', onLeave)

    return () => {
      element.removeEventListener('mouseenter', onEnter)
      element.removeEventListener('mouseleave', onLeave)
      if (keepOpen) {
        keepOpen.removeEventListener('mouseenter', cancelHide)
        keepOpen.removeEventListener('mouseleave', scheduleHide)
      }
      cancelHide()
      cancelOpen()
      hide()
    }
  }
}

/**
 * Attachment that calls `handler` whenever the user clicks outside the element.
 * Useful for closing dropdowns or popovers on outside interaction.
 */
export function clickOutside(handler: () => void): Attachment {
  return (element: Element) => {
    const onMouseDown = (e: MouseEvent) => {
      if (!element.contains(e.target as Node)) handler()
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }
}

export function popup(options: PopupOptions, group?: string): Attachment {
  return (element: Element) => {
    let instance: ReturnType<typeof mount> | null = null
    const container = document.createElement('div')

    const doHide = () => {
      if (instance) { unmount(instance); instance = null }
      container.remove()
      if (group && groups.get(group) === doHide) groups.delete(group)
    }

    const doShow = (x: number, anchorTop: number, anchorBottom: number) => {
      // Close any other popup in the same group immediately (no delay)
      if (group) {
        const prev = groups.get(group)
        if (prev && prev !== doHide) prev()
        groups.set(group, doHide)
      }
      if (instance) return  // re-entered while hide was pending; already mounted
      document.body.appendChild(container)
      instance = mount(PopupContainer, {
        target: container,
        props: { ...options, x, anchorTop, anchorBottom }
      })
    }

    return hoverAttachment(doShow, doHide, {
      openDelay: () => {
        const isWarm = group != null && groups.has(group) && groups.get(group) !== doHide
        return isWarm ? SWITCH_OPEN_DELAY : (group != null ? INITIAL_OPEN_DELAY : 0)
      },
      closeDelay: CLOSE_DELAY,
      keepOpen: container,
    })(element)
  }
}
