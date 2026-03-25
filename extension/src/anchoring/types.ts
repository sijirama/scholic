/**
 * types.ts — Selector types shared between the extension and backend.
 *
 * These interfaces define the JSON shape of the selectors stored per annotation.
 * Each annotation stores an array of these selectors for maximum re-anchoring
 * reliability.
 */

/**
 * RangeSelector — stores XPath paths + character offsets for the start/end
 * containers. This is the most precise selector but also the most fragile.
 *
 * Example:
 *   {
 *     type: "RangeSelector",
 *     startContainer: "/article[1]/p[3]/text()[1]",
 *     startOffset: 14,
 *     endContainer: "/article[1]/p[3]/text()[1]",
 *     endOffset: 38
 *   }
 */
export interface RangeSelector {
  type: 'RangeSelector';
  startContainer: string;
  startOffset: number;
  endContainer: string;
  endOffset: number;
}

/**
 * TextPositionSelector — stores absolute character offsets from the root element.
 * Fast to resolve but breaks if any text is added/removed before the annotation.
 *
 * Example:
 *   { type: "TextPositionSelector", start: 1452, end: 1481 }
 */
export interface TextPositionSelector {
  type: 'TextPositionSelector';
  start: number;
  end: number;
}

/**
 * TextQuoteSelector — stores the exact text plus surrounding context.
 * The most robust selector: survives layout changes, ad injection, and
 * minor content edits thanks to fuzzy matching.
 *
 * Example:
 *   {
 *     type: "TextQuoteSelector",
 *     exact: "transformers changed NLP",
 *     prefix: "In 2017, ",
 *     suffix: " dramatically."
 *   }
 */
export interface TextQuoteSelector {
  type: 'TextQuoteSelector';
  exact: string;
  prefix?: string;
  suffix?: string;
}

/** Union of all selector types. Each annotation stores an array of these. */
export type Selector = RangeSelector | TextPositionSelector | TextQuoteSelector;
