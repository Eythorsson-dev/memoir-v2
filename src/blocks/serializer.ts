import { Serializer } from '../serializer'
import { Blocks, Block, BlockId } from './blocks'
import { textSerializer } from '../text/serializer'

// ─── Render ───────────────────────────────────────────────────────────────────

function renderBlock(block: Block): Element {
  const div = document.createElement('div')
  div.className = 'block'
  div.id = block.id

  const p = document.createElement('p')
  textSerializer.render(block.data).forEach((node) => p.appendChild(node))
  div.appendChild(p)

  if (block.children.length > 0) {
    const childrenDiv = document.createElement('div')
    childrenDiv.className = 'children'
    block.children.forEach((child) => childrenDiv.appendChild(renderBlock(child)))
    div.appendChild(childrenDiv)
  }

  return div
}

function render(blocks: Blocks): Node[] {
  return blocks.blocks.map(renderBlock)
}

// ─── Parse ────────────────────────────────────────────────────────────────────

function parseBlock(el: Element): Block {
  const id: BlockId | null = el.getAttribute('id')
  if (!id) throw new Error('Block element missing id attribute')

  let pElement: Element | null = null
  let childrenElement: Element | null = null

  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      throw new Error(`Text node found directly inside block '${id}'`)
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const child = node as Element
      const tag = child.tagName.toLowerCase()
      if (tag === 'p') {
        pElement = child
      } else if (tag === 'div' && child.classList.contains('children')) {
        childrenElement = child
      } else {
        throw new Error(
          `Unexpected element <${tag}> inside block '${id}'. Only <p> and <div class="children"> are allowed.`
        )
      }
    }
  }

  if (!pElement) throw new Error(`Block '${id}' is missing its <p> element`)

  const data = textSerializer.parse(Array.from(pElement.childNodes))

  const children: Block[] = []
  if (childrenElement) {
    for (const node of Array.from(childrenElement.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        throw new Error(`Text node found directly inside <div class="children"> of block '${id}'`)
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        children.push(parseBlock(node as Element))
      }
    }
    if (children.length === 0) {
      throw new Error(
        `Empty <div class="children"> in block '${id}' is not valid`
      )
    }
  }

  return new Block(id, data, children)
}

function parse(nodes: Node[]): Blocks {
  const blocks: Block[] = []
  for (const node of nodes) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      blocks.push(parseBlock(node as Element))
    }
  }
  return new Blocks(blocks)
}

// ─── Export ───────────────────────────────────────────────────────────────────

export const blocksSerializer: Serializer<Blocks> = { render, parse }