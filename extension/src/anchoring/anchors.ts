/**
 * anchors.ts — Anchor classes that convert between DOM Ranges and Selectors.
 *
 * Each class handles one selector type:
 *   - RangeAnchor:        XPath-based (precise but fragile)
 *   - TextPositionAnchor: Character offset-based (fast fallback)
 *   - TextQuoteAnchor:    Fuzzy text-based (most robust)
 *
 * Each class has two static constructors:
 *   - fromRange(root, range)     → create from a user's text selection
 *   - fromSelector(root, selector) → create from stored annotation data
 *
 * And two instance methods:
 *   - toSelector() → serialize to JSON (for storage)
 *   - toRange()    → resolve to a DOM Range (for highlighting)
 *
 * Adapted from Hypothesis client (MIT license).
 */

import type {
  RangeSelector,
  TextPositionSelector,
  TextQuoteSelector,
} from './types';
import { matchQuote } from './match-quote';
import { TextRange, TextPosition } from './text-range';
import { nodeFromXPath, xpathFromNode } from './xpath';

// ─────────────────────────────────────────────────────────────────────────────
// RangeAnchor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts between RangeSelector (XPath + offsets) and DOM Range.
 *
 * This is the fastest anchor to resolve, but it's fragile:
 * any DOM change that shifts node positions will break it.
 * That's why we always store TextQuoteSelector as a fallback.
 */
export class RangeAnchor {
  root: Node;
  range: Range;

  constructor(root: Node, range: Range) {
    this.root = root;
    this.range = range;
  }

  /** Create a RangeAnchor from a live DOM Range (e.g., user's selection). */
  static fromRange(root: Node, range: Range): RangeAnchor {
    return new RangeAnchor(root, range);
  }

  /** Create a RangeAnchor from a stored RangeSelector (from the backend). */
  static fromSelector(root: Element, selector: RangeSelector): RangeAnchor {
    // Resolve XPath strings to DOM nodes
    const startContainer = nodeFromXPath(selector.startContainer, root);
    if (!startContainer) {
      throw new Error('Failed to resolve startContainer XPath');
    }
    const endContainer = nodeFromXPath(selector.endContainer, root);
    if (!endContainer) {
      throw new Error('Failed to resolve endContainer XPath');
    }

    // Convert to character offsets, then to a Range
    const startPos = TextPosition.fromCharOffset(
      startContainer,
      selector.startOffset,
    );
    const endPos = TextPosition.fromCharOffset(
      endContainer,
      selector.endOffset,
    );
    const range = new TextRange(startPos, endPos).toRange();
    return new RangeAnchor(root, range);
  }

  /** Return the DOM Range. */
  toRange(): Range {
    return this.range;
  }

  /** Serialize to a RangeSelector (XPath + character offsets). */
  toSelector(): RangeSelector {
    // Normalize the range to tightly wrap just the text content
    const normalizedRange = TextRange.fromRange(this.range).toRange();
    const textRange = TextRange.fromRange(normalizedRange);

    const startContainer = xpathFromNode(textRange.start.element, this.root);
    const endContainer = xpathFromNode(textRange.end.element, this.root);

    return {
      type: 'RangeSelector',
      startContainer,
      startOffset: textRange.start.offset,
      endContainer,
      endOffset: textRange.end.offset,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TextPositionAnchor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts between TextPositionSelector (absolute char offsets) and DOM Range.
 *
 * This is fast to resolve but brittle: if any text is added or removed
 * before the annotated region, the offsets become invalid.
 */
export class TextPositionAnchor {
  root: Element;
  start: number;
  end: number;

  constructor(root: Element, start: number, end: number) {
    this.root = root;
    this.start = start;
    this.end = end;
  }

  /** Create from a DOM Range by computing character offsets relative to root. */
  static fromRange(root: Element, range: Range): TextPositionAnchor {
    const textRange = TextRange.fromRange(range).relativeTo(root);
    return new TextPositionAnchor(
      root,
      textRange.start.offset,
      textRange.end.offset,
    );
  }

  /** Create from a stored TextPositionSelector. */
  static fromSelector(
    root: Element,
    selector: TextPositionSelector,
  ): TextPositionAnchor {
    return new TextPositionAnchor(root, selector.start, selector.end);
  }

  /** Serialize to a TextPositionSelector. */
  toSelector(): TextPositionSelector {
    return {
      type: 'TextPositionSelector',
      start: this.start,
      end: this.end,
    };
  }

  /** Resolve to a DOM Range. */
  toRange(): Range {
    return TextRange.fromOffsets(this.root, this.start, this.end).toRange();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TextQuoteAnchor
// ─────────────────────────────────────────────────────────────────────────────

/** Options for resolving a TextQuoteAnchor. */
type QuoteMatchOptions = {
  /** Expected position of match in text (used as a hint for disambiguation). */
  hint?: number;
};

/**
 * Converts between TextQuoteSelector (exact text + context) and DOM Range.
 *
 * This is the MOST ROBUST anchor type. It stores:
 * - The exact selected text
 * - 32 characters of surrounding context (prefix + suffix)
 *
 * When re-anchoring, it uses fuzzy matching to find the best match even
 * if the page content has been slightly edited. This is what makes
 * annotations survive across page updates.
 */
export class TextQuoteAnchor {
  root: Element;
  exact: string;
  context: { prefix?: string; suffix?: string };

  constructor(
    root: Element,
    exact: string,
    context: { prefix?: string; suffix?: string } = {},
  ) {
    this.root = root;
    this.exact = exact;
    this.context = context;
  }

  /**
   * Create from a DOM Range by extracting the text and 32 chars of surrounding context.
   */
  static fromRange(root: Element, range: Range): TextQuoteAnchor {
    const text = root.textContent!;
    const textRange = TextRange.fromRange(range).relativeTo(root);

    const start = textRange.start.offset;
    const end = textRange.end.offset;

    // Capture 32 chars of context around the selection.
    // This helps disambiguate when the same text appears multiple times.
    const contextLen = 32;

    return new TextQuoteAnchor(root, text.slice(start, end), {
      prefix: text.slice(Math.max(0, start - contextLen), start),
      suffix: text.slice(end, Math.min(text.length, end + contextLen)),
    });
  }

  /** Create from a stored TextQuoteSelector. */
  static fromSelector(
    root: Element,
    selector: TextQuoteSelector,
  ): TextQuoteAnchor {
    const { prefix, suffix } = selector;
    return new TextQuoteAnchor(root, selector.exact, { prefix, suffix });
  }

  /** Serialize to a TextQuoteSelector. */
  toSelector(): TextQuoteSelector {
    return {
      type: 'TextQuoteSelector',
      exact: this.exact,
      prefix: this.context.prefix,
      suffix: this.context.suffix,
    };
  }

  /**
   * Resolve to a DOM Range using fuzzy text matching.
   * This is where the magic happens for surviving page edits.
   */
  toRange(options: QuoteMatchOptions = {}): Range {
    return this.toPositionAnchor(options).toRange();
  }

  /**
   * Find the best match for this quote in the document text,
   * then return it as a TextPositionAnchor.
   */
  toPositionAnchor(options: QuoteMatchOptions = {}): TextPositionAnchor {
    const text = this.root.textContent!;
    const match = matchQuote(text, this.exact, {
      ...this.context,
      hint: options.hint,
    });
    if (!match) {
      throw new Error('Quote not found');
    }
    return new TextPositionAnchor(this.root, match.start, match.end);
  }
}
