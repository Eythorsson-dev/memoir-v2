import { type Serializer } from '../serializer'
import { Blocks, TextBlock, OrderedListBlock, UnorderedListBlock, HeaderBlock, Header, type BlockId } from './blocks'
import { textSerializer } from '../text/serializer'

// ─── Render ───────────────────────────────────────────────────────────────────

function renderBlock(block: TextBlock | OrderedListBlock | UnorderedListBlock | HeaderBlock, depth = 0): Element {
  const div = document.createElement('div')
  div.className = 'block'
  div.id = block.id

  if (block instanceof TextBlock) {
    div.setAttribute('data-block-type', 'text')
  } else if (block instanceof OrderedListBlock) {
    const LIST_STYLES = ['decimal', 'lower-alpha', 'lower-roman'] as const
    div.setAttribute('data-block-type', 'ordered-list')
    div.setAttribute('data-list-style', LIST_STYLES[depth % 3])
  } else if (block instanceof UnorderedListBlock) {
    const LIST_STYLES = ['disc', 'circle', 'square'] as const
    div.setAttribute('data-block-type', 'unordered-list')
    div.setAttribute('data-list-style', LIST_STYLES[depth % 3])
  } else if (block instanceof HeaderBlock) {
    div.setAttribute('data-block-type', 'header')
    div.setAttribute('data-header-level', String(block.data.level))
  } else {
    const _exhaustive: never = block
    throw new Error(`Unknown block type: ${JSON.stringify(_exhaustive)}`)
  }

  const p = document.createElement('p')
  const text = block.getText()
  if (text.text.length === 0) {
    p.appendChild(document.createElement('br'))
  } else {
    textSerializer.render(text).forEach((node) => p.appendChild(node))
  }
  div.appendChild(p)

  if (block.children.length > 0) {
    const childrenDiv = document.createElement('div')
    childrenDiv.className = 'children'
    ;(block.children as ReadonlyArray<TextBlock | OrderedListBlock | UnorderedListBlock | HeaderBlock>).forEach(
      (child) => childrenDiv.appendChild(renderBlock(child, depth + 1))
    )
    div.appendChild(childrenDiv)
  }

  return div
}

function render(blocks: Blocks): Node[] {
  return blocks.blocks.map((b) => renderBlock(b))
}

// ─── Parse ────────────────────────────────────────────────────────────────────

function parseBlock(el: Element): TextBlock | OrderedListBlock | UnorderedListBlock | HeaderBlock {
  const id: BlockId | null = el.getAttribute('id')
  if (!id) throw new Error('Block element missing id attribute')

  const blockType = el.getAttribute('data-block-type')
  if (!blockType) throw new Error(`Block '${id}' is missing data-block-type attribute`)

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

  const children: Array<TextBlock | OrderedListBlock | UnorderedListBlock | HeaderBlock> = []
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

  switch (blockType) {
    case 'text':
      return new TextBlock(id, data, children)
    case 'ordered-list':
      return new OrderedListBlock(id, data, children)
    case 'unordered-list':
      return new UnorderedListBlock(id, data, children)
    case 'header': {
      const levelAttr = el.getAttribute('data-header-level')
      if (!levelAttr) throw new Error(`Header block '${id}' is missing data-header-level attribute`)
      const level = Number(levelAttr) as 1 | 2 | 3
      return new HeaderBlock(id, new Header(level, data), children)
    }
    default:
      throw new Error(`Block '${id}' has unknown data-block-type: '${blockType}'`)
  }
}

function parse(nodes: Node[]): Blocks {
  const dtos: Array<TextBlock | OrderedListBlock | UnorderedListBlock | HeaderBlock> = []
  for (const node of nodes) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      dtos.push(parseBlock(node as Element))
    }
  }
  return Blocks.from(dtos)
}

// ─── Export ───────────────────────────────────────────────────────────────────

export const blocksSerializer: Serializer<Blocks> = { render, parse }
