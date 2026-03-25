/**
 * anchoring/index.ts — Main entry points for the annotation anchoring system.
 *
 * Two key functions:
 *
 * 1. describe(root, range) — When a user selects text, generate all 3 selectors.
 *    This is called once when creating an annotation.
 *
 * 2. anchor(root, selectors) — When a page loads, resolve stored selectors back
 *    to a DOM Range. Tries selectors in order: Range → Position → Quote.
 *    This is called for every stored annotation on page load.
 *
 * The fallback chain is the key design:
 *   - RangeSelector is fast but breaks on any DOM change
 *   - TextPositionSelector is fast but breaks on text changes before the annotation
 *   - TextQuoteSelector is slow but survives almost anything (fuzzy matching)
 */

import type { Selector, TextPositionSelector } from './types';
import {
  RangeAnchor,
  TextPositionAnchor,
  TextQuoteAnchor,
} from './anchors';

/**
 * Generate all available selectors from a DOM Range.
 *
 * Called when the user creates a new annotation. We generate all 3 selector
 * types so we have maximum chances of re-anchoring later.
 *
 * @param root - The root element (usually document.body)
 * @param range - The user's text selection as a DOM Range
 * @returns Array of selectors to store in the database
 *
 * @example
 *   const selection = window.getSelection();
 *   const range = selection.getRangeAt(0);
 *   const selectors = describe(document.body, range);
 *   // => [RangeSelector, TextPositionSelector, TextQuoteSelector]
 */
export function describe(root: Element, range: Range): Selector[] {
  const selectors: Selector[] = [];

  // Generate each selector type, silently skipping any that fail
  try {
    const rangeAnchor = RangeAnchor.fromRange(root, range);
    selectors.push(rangeAnchor.toSelector());
  } catch {
    // XPath generation might fail for unusual DOM structures
  }

  try {
    const positionAnchor = TextPositionAnchor.fromRange(root, range);
    selectors.push(positionAnchor.toSelector());
  } catch {
    // Position calculation might fail if range is in a detached subtree
  }

  try {
    const quoteAnchor = TextQuoteAnchor.fromRange(root, range);
    selectors.push(quoteAnchor.toSelector());
  } catch {
    // Quote extraction might fail for empty selections
  }

  return selectors;
}

/**
 * Resolve a set of stored selectors back to a DOM Range.
 *
 * Called on page load for each stored annotation. Tries selectors in order
 * from fastest/most-precise to slowest/most-robust:
 *
 *   1. RangeSelector   — XPath + offsets (instant, but fragile)
 *   2. TextPosition    — Character offsets (fast, medium robustness)
 *   3. TextQuote       — Fuzzy text match (slowest, but survives almost anything)
 *
 * The first selector that successfully resolves wins.
 *
 * @param root - The root element (usually document.body)
 * @param selectors - Array of selectors from the stored annotation
 * @returns Promise that resolves to a DOM Range, or rejects if no selector works
 *
 * @example
 *   const range = await anchor(document.body, annotation.selectors);
 *   highlightRange(range); // Render the highlight
 */
export async function anchor(
  root: Element,
  selectors: Selector[],
): Promise<Range> {
  // Collect selectors by type
  let position: TextPositionSelector | null = null;
  let quote: Selector | null = null;
  let rangeSelector: Selector | null = null;

  for (const selector of selectors) {
    switch (selector.type) {
      case 'RangeSelector':
        rangeSelector = selector;
        break;
      case 'TextPositionSelector':
        position = selector;
        break;
      case 'TextQuoteSelector':
        quote = selector;
        break;
    }
  }

  // Build a promise chain: try each selector in order, fall through on failure.
  // Start with a rejected promise; each .catch() adds a fallback attempt.
  let promise: Promise<Range> = Promise.reject(new Error('No selectors'));

  // 1st attempt: RangeSelector (fastest, most precise)
  if (rangeSelector && rangeSelector.type === 'RangeSelector') {
    const sel = rangeSelector;
    promise = promise.catch(() => {
      const anchor = RangeAnchor.fromSelector(root, sel);
      const range = anchor.toRange();
      // If we also have a quote, verify the text matches
      if (quote && quote.type === 'TextQuoteSelector' && quote.exact) {
        if (range.toString() !== quote.exact) {
          throw new Error('Quote mismatch after Range anchor');
        }
      }
      return range;
    });
  }

  // 2nd attempt: TextPositionSelector (fast fallback)
  if (position) {
    const pos = position;
    promise = promise.catch(() => {
      const anchor = TextPositionAnchor.fromSelector(root, pos);
      const range = anchor.toRange();
      // Verify against quote if available
      if (quote && quote.type === 'TextQuoteSelector' && quote.exact) {
        if (range.toString() !== quote.exact) {
          throw new Error('Quote mismatch after Position anchor');
        }
      }
      return range;
    });
  }

  // 3rd attempt: TextQuoteSelector (most robust, uses fuzzy matching)
  if (quote && quote.type === 'TextQuoteSelector') {
    const q = quote;
    promise = promise.catch(() => {
      const anchor = TextQuoteAnchor.fromSelector(root, q);
      // Use position hint to disambiguate multiple matches
      return anchor.toRange({ hint: position?.start });
    });
  }

  return promise;
}
