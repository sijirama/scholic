/**
 * match-quote.ts — Fuzzy text matching for re-anchoring annotations.
 *
 * When a user creates an annotation, we store the exact selected text along
 * with surrounding context (prefix + suffix). When the page reloads — even
 * if the content has been slightly edited — this module finds the best match.
 *
 * Uses the `approx-string-match` library for edit-distance-based fuzzy search.
 *
 * Scoring weights:
 *   - Quote similarity: 50% (how close the match is to the original text)
 *   - Prefix match:     20% (does the text before it look right?)
 *   - Suffix match:     20% (does the text after it look right?)
 *   - Position hint:    10% (is it near the expected location?)
 *
 * Adapted from Hypothesis client (MIT license).
 */

import approxSearch from 'approx-string-match';
import type { Match as StringMatch } from 'approx-string-match';

/** A matched region in the document text with a quality score. */
export type Match = {
  /** Start character offset in the document text */
  start: number;
  /** End character offset in the document text */
  end: number;
  /**
   * Match quality score between 0 and 1.0.
   * 1.0 = perfect match for quote and all context.
   */
  score: number;
};

/**
 * Find approximate matches for `str` in `text`, allowing up to `maxErrors` edits.
 * First tries exact matching (fast path), then falls back to fuzzy search.
 */
function search(text: string, str: string, maxErrors: number): StringMatch[] {
  // Fast path: check for exact matches first
  let matchPos = 0;
  const exactMatches: StringMatch[] = [];
  while (matchPos !== -1) {
    matchPos = text.indexOf(str, matchPos);
    if (matchPos !== -1) {
      exactMatches.push({
        start: matchPos,
        end: matchPos + str.length,
        errors: 0,
      });
      matchPos += 1;
    }
  }
  if (exactMatches.length > 0) {
    return exactMatches;
  }

  // Slow path: fuzzy search using edit distance
  return approxSearch(text, str, maxErrors);
}

/**
 * Compute a similarity score (0–1.0) between `text` and `str`.
 * Used to score prefix/suffix matches.
 */
function textMatchScore(text: string, str: string): number {
  if (str.length === 0 || text.length === 0) {
    return 0.0;
  }
  const matches = search(text, str, str.length);
  return 1 - (matches[0].errors / str.length);
}

/** Context surrounding the original quote, used to disambiguate matches. */
type Context = {
  /** Text that appeared before the quote */
  prefix?: string;
  /** Text that appeared after the quote */
  suffix?: string;
  /** Expected character offset of the quote in the document */
  hint?: number;
};

/**
 * Find the best approximate match for `quote` within `text`.
 *
 * This is the core re-anchoring function. It finds where the original
 * annotation text most likely exists in the (possibly modified) page.
 *
 * @param text - The full document text to search in
 * @param quote - The original selected text to find
 * @param context - Surrounding text and position hint for disambiguation
 * @returns Best match with position and score, or null if no good match found
 *
 * @example
 *   const match = matchQuote(
 *     document.body.textContent,
 *     "transformers changed NLP",
 *     { prefix: "In 2017, ", suffix: " dramatically." }
 *   );
 *   if (match) {
 *     console.log(`Found at offset ${match.start}–${match.end}`);
 *   }
 */
export function matchQuote(
  text: string,
  quote: string,
  context: Context = {},
): Match | null {
  if (quote.length === 0) {
    return null;
  }

  // Allow up to half the quote length in errors, capped at 256
  const maxErrors = Math.min(256, quote.length / 2);

  // Find candidate matches using edit distance
  const matches = search(text, quote, maxErrors);
  if (matches.length === 0) {
    return null;
  }

  /**
   * Score a candidate match based on:
   * 1. How closely it matches the original quote text (50%)
   * 2. How well the surrounding prefix matches (20%)
   * 3. How well the surrounding suffix matches (20%)
   * 4. How close it is to the expected position (10%)
   */
  const scoreMatch = (match: StringMatch) => {
    const quoteWeight = 50;
    const prefixWeight = 20;
    const suffixWeight = 20;
    const posWeight = 10;

    // Quote similarity: fewer errors = higher score
    const quoteScore = 1 - match.errors / quote.length;

    // Prefix similarity: compare text before match to stored prefix
    const prefixScore = context.prefix
      ? textMatchScore(
          text.slice(
            Math.max(0, match.start - context.prefix.length),
            match.start,
          ),
          context.prefix,
        )
      : 1.0;

    // Suffix similarity: compare text after match to stored suffix
    const suffixScore = context.suffix
      ? textMatchScore(
          text.slice(match.end, match.end + context.suffix.length),
          context.suffix,
        )
      : 1.0;

    // Position proximity: closer to expected position = higher score
    let posScore = 1.0;
    if (typeof context.hint === 'number') {
      const offset = Math.abs(match.start - context.hint);
      posScore = 1.0 - offset / text.length;
    }

    const rawScore =
      quoteWeight * quoteScore +
      prefixWeight * prefixScore +
      suffixWeight * suffixScore +
      posWeight * posScore;
    const maxScore = quoteWeight + prefixWeight + suffixWeight + posWeight;
    return rawScore / maxScore;
  };

  // Score all candidates and return the best one
  const scoredMatches = matches.map((m) => ({
    start: m.start,
    end: m.end,
    score: scoreMatch(m),
  }));

  scoredMatches.sort((a, b) => b.score - a.score);
  return scoredMatches[0];
}
