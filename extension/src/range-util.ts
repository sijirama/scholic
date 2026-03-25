/**
 * range-util.ts — Utilities for working with DOM Ranges.
 *
 * Ported from Hypothesis client (MIT license).
 */

/**
 * Returns true if any part of `node` lies within `range`.
 *
 * Uses `range.comparePoint()` which is more precise than `range.intersectsNode()`.
 * `intersectsNode` can return true for nodes that are only adjacent to the range
 * but don't actually overlap with the selected text.
 */
export function isNodeInRange(range: Range, node: Node): boolean {
  try {
    const length = node.nodeValue?.length ?? node.childNodes.length;
    return (
      // Check start of node is before end of range.
      range.comparePoint(node, 0) <= 0 &&
      // Check end of node is after start of range.
      range.comparePoint(node, length) >= 0
    );
  } catch {
    // `comparePoint` may fail if the `range` and `node` do not share a common
    // ancestor or `node` is a doctype.
    return false;
  }
}
