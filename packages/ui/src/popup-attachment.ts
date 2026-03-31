import { mount, unmount } from 'svelte'
import type { Component, Snippet } from 'svelte'
import type { Attachment } from 'svelte/attachments'
import PopupContainer from './popup-container.svelte'
import TooltipContainer from './tooltip-container.svelte'
import type { Shortcut } from './shortcut.ts'

export type PopupBody = string | Snippet

export interface PopupOptions {
  title: string
  subtitle?: string
  body: PopupBody
}

const MARGIN = 8   // minimum distance from viewport edge

const CLOSE_DELAY = 100   // ms grace before hiding
const INITIAL_OPEN_DELAY = 300   // ms dwell before first popup opens
const SWITCH_OPEN_DELAY = 150   // ms dwell when switching within a warm group
// must be > CLOSE_DELAY so old popup always closes first
const TOOLTIP_DELAY = 400   // ms dwell before tooltip appears
const MENU_GAP = 4     // px gap between trigger bottom and menu

// module-level singleton registry: group name → hide() of currently visible popup
const groups = new Map<string, () => void>()

/**
 * Shared hover lifecycle: mounts `component` to `document.body` on mouseenter
 * (after an optional delay) and unmounts on mouseleave (with a close grace period).
 *
 * @param component - Svelte component to mount.
 * @param makeProps - Builds the component's props from the cursor and anchor geometry.
 * @param options.group - Named group for mutual exclusion (only one popup per group is visible).
 * @param options.canShow - Called before mounting; returning false suppresses the popup.
 * @param options.openDelay - Fixed delay in ms. Omit to use group-aware dynamic delay.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mountOnHover<P extends Record<string, any>>(
  component: Component<P>,
  makeProps: (x: number, anchorTop: number, anchorBottom: number) => P,
  {
    group,
    canShow,
    openDelay,
  }: {
    group?: string
    canShow?: (element: Element) => boolean
    openDelay?: number
  } = {}
): Attachment {
  return (element) => {
    let instance: ReturnType<typeof mount> | null = null
    const container = document.createElement('div')
    let hideTimeout: ReturnType<typeof setTimeout> | null = null
    let openTimeout: ReturnType<typeof setTimeout> | null = null

    const doHide = () => {
      if (instance) { unmount(instance); instance = null }
      container.remove()
      if (group && groups.get(group) === doHide) groups.delete(group)
    }

    const doShow = (x: number, anchorTop: number, anchorBottom: number) => {
      if (canShow && !canShow(element)) return
      if (group) {
        const prev = groups.get(group)
        if (prev && prev !== doHide) prev()
        groups.set(group, doHide)
      }
      if (instance) return  // re-entered while hide was pending; already mounted
      document.body.appendChild(container)
      instance = mount(component, { target: container, props: makeProps(x, anchorTop, anchorBottom) })
    }

    const scheduleHide = () => {
      hideTimeout = setTimeout(doHide, CLOSE_DELAY)
    }

    const cancelHide = () => {
      if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null }
    }

    const cancelOpen = () => {
      if (openTimeout) { clearTimeout(openTimeout); openTimeout = null }
    }

    const computeDelay = openDelay !== undefined
      ? openDelay
      : () => {
        const isWarm = group != null && groups.has(group) && groups.get(group) !== doHide
        return isWarm ? SWITCH_OPEN_DELAY : (group != null ? INITIAL_OPEN_DELAY : 0)
      }

    const onEnter = (evt: Event) => {
      cancelHide()
      cancelOpen()
      const { clientX } = evt as MouseEvent
      const delay = typeof computeDelay === 'function' ? computeDelay() : computeDelay
      if (delay > 0) {
        openTimeout = setTimeout(() => {
          openTimeout = null
          const rect = element.getBoundingClientRect()
          doShow(clientX, rect.top, rect.bottom)
        }, delay)
      } else {
        const rect = element.getBoundingClientRect()
        doShow(clientX, rect.top, rect.bottom)
      }
    }

    const onLeave = () => { cancelOpen(); scheduleHide() }

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
      doHide()
    }
  }
}

/**
 * @param x - Anchor x coordinate. Meaning depends on `align`:
 *   `'center'` — the popup is centered on this x (e.g. cursor position);
 *   `'left'`   — the popup's left edge is aligned to this x (e.g. trigger's left edge).
 * @param align - Horizontal alignment strategy. Defaults to `'center'`.
 * @param gap - Extra spacing between the anchor and the popup. Defaults to `0`.
 */
export function computePosition(
  x: number,
  anchorTop: number, anchorBottom: number,
  popupW: number, popupH: number,
  vw: number, vh: number,
  { align = 'center', gap = 0 }: { align?: 'center' | 'left'; gap?: number } = {}
): { left: number; top: number } {
  const rawLeft = align === 'left' ? x : x - popupW / 2
  const left = Math.max(MARGIN, Math.min(rawLeft, vw - popupW - MARGIN))

  const prefTop = anchorBottom + gap
  const flipTop = anchorTop - popupH - gap
  const rawTop = prefTop + popupH > vh - MARGIN ? flipTop : prefTop
  const top = Math.max(MARGIN, Math.min(rawTop, vh - popupH - MARGIN))

  return { left, top }
}


/**
 * Positions the attached element directly below (or above, if viewport-constrained)
 * a trigger element using fixed positioning, left-aligned with the trigger.
 *
 * Repositions automatically on resize, scroll, and menu size change.
 *
 * @param trigger - The element to anchor the menu against.
 */
export function popupOnClick(trigger: Element): Attachment {
  return (menuEl: Element) => {
    const reposition = () => {
      const rect = trigger.getBoundingClientRect()
      const el = menuEl as HTMLElement
      const { left, top } = computePosition(
        rect.left, rect.top, rect.bottom,
        el.offsetWidth, el.offsetHeight,
        window.innerWidth, window.innerHeight,
        { align: 'left', gap: MENU_GAP }
      )
      el.style.left = `${left}px`
      el.style.top = `${top}px`
    }

    const ro = new ResizeObserver(reposition)
    ro.observe(menuEl)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, { passive: true, capture: true })

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, { capture: true })
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

export function popupOnHover(options: PopupOptions, group?: string): Attachment {
  return mountOnHover(
    PopupContainer,
    (x, anchorTop, anchorBottom) => ({ ...options, x, anchorTop, anchorBottom }),
    { group }
  )
}

/**
 * Attachment that shows a tooltip above the element on hover.
 * Suppresses the tooltip while the element is disabled.
 *
 * @param label - Accessible label displayed in the tooltip.
 * @param shortcut - Optional keyboard shortcut displayed alongside the label.
 */
export function tooltip(label: string, shortcut?: Shortcut): Attachment {
  return mountOnHover(
    TooltipContainer,
    (x, anchorTop, anchorBottom) => ({ label, shortcut, x, anchorTop, anchorBottom }),
    {
      openDelay: TOOLTIP_DELAY,
      canShow: (el) => !(el as HTMLButtonElement).disabled,
    }
  )
}
