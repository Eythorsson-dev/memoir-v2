/**
 * A generic serializer contract for converting between a domain value `T`
 * and an array of DOM `Node` instances.
 */
export type Serializer<T> = {
  /**
   * Reconstructs a domain value from an array of DOM nodes.
   * Only required to handle output produced by `render`.
   */
  parse(nodes: Node[]): T

  /** Converts a domain value into an array of DOM nodes. */
  render(item: T): Node[]
}