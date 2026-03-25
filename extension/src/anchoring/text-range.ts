/**
 * text-range.ts — Character-offset-based text positioning in the DOM.
 *
 * Two key classes:
 *
 * 1. TextPosition — represents a single character offset within an element.
 *    Can be resolved to a specific (textNode, offset) pair in the current DOM.
 *
 * 2. TextRange — a (start, end) pair of TextPositions.
 *    Can be converted to/from a DOM Range.
 *
 * These are the building blocks for TextPositionSelector and TextQuoteSelector.
 * They handle the complexity of the DOM where text is split across multiple
 * text nodes (e.g., <p>Hello <em>world</em>!</p> has 3 text nodes).
 *
 * Adapted from Hypothesis client (MIT license).
 */

/**
 * When resolving a TextPosition, specifies the direction to search for the
 * nearest text node if `offset` is 0 and the element has no text.
 */
export enum ResolveDirection {
  FORWARDS = 1,
  BACKWARDS,
}

/**
 * Return the combined length of all text content in `node`.
 * Works for both element nodes (sums all descendant text) and text nodes.
 */
function nodeTextLength(node: Node): number {
  switch (node.nodeType) {
    case Node.ELEMENT_NODE:
    case Node.TEXT_NODE:
      return node.textContent?.length ?? 0;
    default:
      return 0;
  }
}

/**
 * Return the total text length of all previous siblings of `node`.
 * This tells us the character offset of `node` within its parent.
 */
function previousSiblingsTextLength(node: Node): number {
  let sibling = node.previousSibling;
  let length = 0;
  while (sibling) {
    length += nodeTextLength(sibling);
    sibling = sibling.previousSibling;
  }
  return length;
}

/**
 * Resolve character offsets within an element to (textNode, localOffset) pairs.
 *
 * Given an element and one or more character offsets (sorted ascending),
 * walks the text nodes to find which text node contains each offset.
 *
 * @param element - The parent element
 * @param offsets - Character offsets to resolve (must be sorted ascending)
 * @returns Array of {node, offset} pairs
 * @throws RangeError if any offset exceeds the element's text length
 */
function resolveOffsets(
  element: Element,
  ...offsets: number[]
): Array<{ node: Text; offset: number }> {
  let nextOffset = offsets.shift();
  const nodeIter = element.ownerDocument.createNodeIterator(
    element,
    NodeFilter.SHOW_TEXT,
  );
  const results: Array<{ node: Text; offset: number }> = [];

  let currentNode = nodeIter.nextNode() as Text | null;
  let textNode: Text | undefined;
  let length = 0;

  // Walk text nodes until we find the one containing each offset
  while (nextOffset !== undefined && currentNode) {
    textNode = currentNode;
    if (length + textNode.data.length > nextOffset) {
      results.push({ node: textNode, offset: nextOffset - length });
      nextOffset = offsets.shift();
    } else {
      currentNode = nodeIter.nextNode() as Text | null;
      length += textNode.data.length;
    }
  }

  // Handle boundary case: offset exactly at end of last text node
  while (nextOffset !== undefined && textNode && length === nextOffset) {
    results.push({ node: textNode, offset: textNode.data.length });
    nextOffset = offsets.shift();
  }

  if (nextOffset !== undefined) {
    throw new RangeError('Offset exceeds text length');
  }

  return results;
}

/**
 * Represents a character offset within an element's text content.
 *
 * Example: In <p>Hello <em>world</em>!</p>, offset 8 = the 'r' in "world".
 * TextPosition can resolve this to the exact text node inside <em>.
 */
export class TextPosition {
  /** The element this offset is relative to */
  public element: Element;

  /** Character offset from the start of element.textContent */
  public offset: number;

  constructor(element: Element, offset: number) {
    if (offset < 0) {
      throw new Error('Offset is invalid');
    }
    this.element = element;
    this.offset = offset;
  }

  /**
   * Return a copy of this position with offset relative to an ancestor element.
   * This "walks up" the DOM, adding sibling text lengths at each level.
   *
   * @param parent - Must be an ancestor of this.element
   */
  relativeTo(parent: Element): TextPosition {
    if (!parent.contains(this.element)) {
      throw new Error('Parent is not an ancestor of current element');
    }

    let el = this.element;
    let offset = this.offset;
    while (el !== parent) {
      offset += previousSiblingsTextLength(el);
      el = el.parentElement!;
    }

    return new TextPosition(el, offset);
  }

  /**
   * Resolve this position to a specific (textNode, localOffset) pair.
   * This is the reverse of the constructor — it finds the exact text node.
   *
   * @param options.direction - Specifies in which direction to search for the
   *                            nearest text node if `this.offset` is 0 and
   *                            `this.element` has no text.
   * @throws RangeError if offset exceeds element's text length
   */
  resolve(options: { direction?: ResolveDirection } = {}): { node: Text; offset: number } {
    try {
      return resolveOffsets(this.element, this.offset)[0];
    } catch (err) {
      if (this.offset === 0 && options.direction !== undefined) {
        const tw = document.createTreeWalker(
          this.element.getRootNode(),
          NodeFilter.SHOW_TEXT,
        );
        tw.currentNode = this.element;
        const forwards = options.direction === ResolveDirection.FORWARDS;
        const text = forwards
          ? (tw.nextNode() as Text | null)
          : (tw.previousNode() as Text | null);
        if (!text) {
          throw err;
        }
        return { node: text, offset: forwards ? 0 : text.data.length };
      } else {
        throw err;
      }
    }
  }

  /**
   * Create a TextPosition from a character offset within a node.
   * If `node` is a text node, the offset is relative to that text node's parent.
   */
  static fromCharOffset(node: Node, offset: number): TextPosition {
    switch (node.nodeType) {
      case Node.TEXT_NODE:
        return TextPosition.fromPoint(node, offset);
      case Node.ELEMENT_NODE:
        return new TextPosition(node as Element, offset);
      default:
        throw new Error('Node is not an element or text node');
    }
  }

  /**
   * Create a TextPosition from a DOM Range boundary point (node, offset).
   * Converts the range point to a character offset within the parent element.
   */
  static fromPoint(node: Node, offset: number): TextPosition {
    switch (node.nodeType) {
      case Node.TEXT_NODE: {
        if (offset < 0 || offset > (node as Text).data.length) {
          throw new Error('Text node offset is out of range');
        }
        if (!node.parentElement) {
          throw new Error('Text node has no parent');
        }
        // Add up the text of all previous siblings + the offset within this node
        const textOffset = previousSiblingsTextLength(node) + offset;
        return new TextPosition(node.parentElement, textOffset);
      }
      case Node.ELEMENT_NODE: {
        if (offset < 0 || offset > node.childNodes.length) {
          throw new Error('Child node offset is out of range');
        }
        // Sum text lengths of all child nodes before `offset`
        let textOffset = 0;
        for (let i = 0; i < offset; i++) {
          textOffset += nodeTextLength(node.childNodes[i]);
        }
        return new TextPosition(node as Element, textOffset);
      }
      default:
        throw new Error('Point is not in an element or text node');
    }
  }
}

/**
 * Represents a region of a document as a (start, end) pair of TextPositions.
 *
 * This is the bridge between character-offset-based representations
 * and DOM Range objects. Changes to the DOM that don't affect text content
 * (e.g., adding a class to a parent) won't break a TextRange.
 */
export class TextRange {
  public start: TextPosition;
  public end: TextPosition;

  constructor(start: TextPosition, end: TextPosition) {
    this.start = start;
    this.end = end;
  }

  /**
   * Create a new TextRange with offsets relative to `element`.
   * Both start and end elements must be descendants of `element`.
   */
  relativeTo(element: Element): TextRange {
    return new TextRange(
      this.start.relativeTo(element),
      this.end.relativeTo(element),
    );
  }

  /**
   * Convert this TextRange to a DOM Range.
   * The resulting Range will start and end in text nodes.
   */
  toRange(): Range {
    let start;
    let end;

    if (
      this.start.element === this.end.element &&
      this.start.offset <= this.end.offset
    ) {
      // Fast path: both endpoints in the same element
      [start, end] = resolveOffsets(
        this.start.element,
        this.start.offset,
        this.end.offset,
      );
    } else {
      start = this.start.resolve({
        direction: ResolveDirection.FORWARDS,
      });
      end = this.end.resolve({ direction: ResolveDirection.BACKWARDS });
    }

    const range = new Range();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    return range;
  }

  /**
   * Create a TextRange from a DOM Range.
   */
  static fromRange(range: Range): TextRange {
    const start = TextPosition.fromPoint(
      range.startContainer,
      range.startOffset,
    );
    const end = TextPosition.fromPoint(range.endContainer, range.endOffset);
    return new TextRange(start, end);
  }

  /**
   * Create a TextRange from absolute character offsets within `root`.
   */
  static fromOffsets(root: Element, start: number, end: number): TextRange {
    return new TextRange(
      new TextPosition(root, start),
      new TextPosition(root, end),
    );
  }
}
