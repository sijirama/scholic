/**
 * xpath.ts — XPath generation and resolution for DOM nodes.
 *
 * This module provides utilities to:
 * 1. Generate a simple XPath string from a DOM node (for serialization)
 * 2. Resolve an XPath string back to a DOM node (for re-anchoring)
 *
 * Simple XPaths look like: /div[1]/article[1]/p[3]/text()[1]
 *
 * We use XPath instead of CSS selectors because XPath paths are more stable
 * when pages inject ads, change layouts, or rehydrate via frameworks like React.
 *
 * Adapted from Hypothesis client (MIT license).
 */

/**
 * Get the lowercase node name for use in XPath expressions.
 * Text nodes become "text()", element nodes use their tag name.
 */
function getNodeName(node: Node): string {
  const nodeName = node.nodeName.toLowerCase();
  return nodeName === '#text' ? 'text()' : nodeName;
}

/**
 * Get the 1-based index of `node` among its same-name siblings.
 * For example, if there are 3 <p> elements and `node` is the 2nd one, returns 2.
 */
function getNodePosition(node: Node): number {
  let pos = 0;
  let tmp: Node | null = node;
  while (tmp) {
    if (tmp.nodeName === node.nodeName) {
      pos += 1;
    }
    tmp = tmp.previousSibling;
  }
  return pos;
}

/**
 * Build a single XPath segment like "div[2]" or "text()[1]".
 */
function getPathSegment(node: Node): string {
  const name = getNodeName(node);
  const pos = getNodePosition(node);
  return `${name}[${pos}]`;
}

/**
 * Generate a simple XPath from `node` to `root`.
 *
 * @param node - The target node
 * @param root - The root node (XPath is relative to this)
 * @returns XPath string like "/div[1]/p[3]/text()[1]"
 *
 * @example
 *   const xpath = xpathFromNode(textNode, document.body);
 *   // => "/article[1]/div[2]/p[1]/text()[1]"
 */
export function xpathFromNode(node: Node, root: Node): string {
  let xpath = '';
  let elem: Node | null = node;

  while (elem !== root) {
    if (!elem) {
      throw new Error('Node is not a descendant of root');
    }
    xpath = getPathSegment(elem) + '/' + xpath;
    elem = elem.parentNode;
  }

  xpath = '/' + xpath;
  xpath = xpath.replace(/\/$/, ''); // Remove trailing slash
  return xpath;
}

/**
 * Return the `index`th child of `element` whose tag name matches `nodeName`.
 * Used internally by evaluateSimpleXPath.
 */
function nthChildOfType(
  element: Element,
  nodeName: string,
  index: number,
): Element | null {
  nodeName = nodeName.toUpperCase();
  let matchIndex = -1;

  for (let i = 0; i < element.children.length; i++) {
    const child = element.children[i];
    if (child.nodeName.toUpperCase() === nodeName) {
      ++matchIndex;
      if (matchIndex === index) {
        return child;
      }
    }
  }
  return null;
}

/**
 * Evaluate a simple XPath relative to `root` and return the matching element.
 *
 * A "simple XPath" is a sequence of /tagName[index] segments.
 * This is faster and more predictable than document.evaluate().
 */
function evaluateSimpleXPath(xpath: string, root: Element): Node | null {
  // Match XPaths like /div[1]/p[3] or /div[1]/p[3]/text()[1]
  const isSimpleXPath =
    xpath.match(/^(\/([A-Za-z0-9-]+|text\(\))(\[[0-9]+\])?)+$/) !== null;
  if (!isSimpleXPath) {
    throw new Error('Expression is not a simple XPath');
  }

  const segments = xpath.split('/');
  let currentNode: Node = root;

  // Remove leading empty segment from the split
  segments.shift();

  for (const segment of segments) {
    let nodeName: string;
    let nodeIndex: number;

    const separatorPos = segment.indexOf('[');
    if (separatorPos !== -1) {
      nodeName = segment.slice(0, separatorPos);
      const indexStr = segment.slice(separatorPos + 1, segment.indexOf(']'));
      nodeIndex = parseInt(indexStr) - 1;
      if (nodeIndex < 0) {
        return null;
      }
    } else {
      nodeName = segment;
      nodeIndex = 0;
    }

    // Handle text() nodes
    if (nodeName === 'text()') {
      let textIndex = 0;
      let found = false;
      for (let i = 0; i < currentNode.childNodes.length; i++) {
        const child = currentNode.childNodes[i];
        if (child.nodeType === Node.TEXT_NODE) {
          if (textIndex === nodeIndex) {
            currentNode = child;
            found = true;
            break;
          }
          textIndex++;
        }
      }
      if (!found) {
        return null;
      }
    } else {
      // Handle element nodes
      if (currentNode.nodeType !== Node.ELEMENT_NODE) {
        return null;
      }
      const child = nthChildOfType(currentNode as Element, nodeName, nodeIndex);
      if (!child) {
        return null;
      }
      currentNode = child;
    }
  }

  return currentNode;
}

/**
 * Resolve an XPath string to a DOM node.
 *
 * First tries the fast simple XPath evaluator.
 * Falls back to document.evaluate() for complex XPaths.
 *
 * @param xpath - XPath string like "/div[1]/p[3]"
 * @param root - Root element to resolve relative to (defaults to document.body)
 * @returns The matching DOM node, or null if not found
 *
 * @example
 *   const node = nodeFromXPath("/article[1]/p[2]", document.body);
 */
export function nodeFromXPath(
  xpath: string,
  root: Element = document.body,
): Node | null {
  try {
    return evaluateSimpleXPath(xpath, root);
  } catch {
    // Fallback to the browser's XPath evaluator for complex expressions
    return document.evaluate(
      '.' + xpath,
      root,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    ).singleNodeValue;
  }
}
