import { mount, unmount } from 'svelte'
import type { Attachment } from 'svelte/attachments'
import type { Shortcut } from './shortcut.ts'
import { hoverAttachment } from './popup-attachment.ts'
import TooltipContainer from './tooltip-container.svelte'

const SHOW_DELAY = 400 // ms dwell before tooltip appears

/**
 * Attachment that shows a tooltip above the element on hover.
 *
 * Suppresses the tooltip while the element is disabled. Uses the shared
 * hover lifecycle from popup-attachment (hoverAttachment) for consistent
 * show/hide timing behaviour.
 *
 * @param label - Accessible label displayed in the tooltip.
 * @param shortcut - Optional keyboard shortcut displayed alongside the label.
 */
export function tooltip(label: string, shortcut?: Shortcut): Attachment {
  return (element: Element) => {
    let instance: ReturnType<typeof mount> | null = null
    const container = document.createElement('div')

    const doShow = (x: number, anchorTop: number) => {
      if ((element as HTMLButtonElement).disabled) return
      document.body.appendChild(container)
      instance = mount(TooltipContainer, {
        target: container,
        props: { label, shortcut, x, anchorTop },
      })
    }

    const doHide = () => {
      if (instance) { unmount(instance); instance = null }
      container.remove()
    }

    return hoverAttachment(doShow, doHide, { openDelay: SHOW_DELAY })(element)
  }
}
