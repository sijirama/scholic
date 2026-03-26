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
 * Normalize whitespace in a string by collapsing multiple spaces,
 * tabs, and newlines into a single space, and trimming ends.
 */
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Find approximate matches for `str` in `text`, allowing up to `maxErrors` edits.
 * First tries exact matching (fast path), then falls back to fuzzy search.
 */
function search(
  text: string,
  str: string,
  maxErrors: number,
  options: { hint?: number; windowSize?: number } = {},
): StringMatch[] {
  // If we have a hint, try searching in a local window first.
  // This is MUCH faster and avoids matching identical text in footers/sidebars.
  if (typeof options.hint === 'number') {
    const windowSize = options.windowSize || 4096;
    const startWindow = Math.max(0, options.hint - windowSize);
    const endWindow = Math.min(text.length, options.hint + windowSize);
    const subtext = text.slice(startWindow, endWindow);

    const matches = search(subtext, str, maxErrors);
    if (matches.length > 0) {
      // Re-offset matches back to the original text
      return matches.map((m) => ({
        ...m,
        start: m.start + startWindow,
        end: m.end + startWindow,
      }));
    }
  }

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
  // Only search a reasonable amount of text to avoid blocking the main thread
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
  const normText = normalizeWhitespace(text);
  const normStr = normalizeWhitespace(str);
  if (normStr.length === 0) return 1.0;

  const matches = search(normText, normStr, normStr.length);
  return 1 - matches[0].errors / normStr.length;
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
 */
export function matchQuote(
  text: string,
  quote: string,
  context: Context = {},
): Match | null {
  if (quote.length === 0) {
    return null;
  }

  // Normalize inputs to neutralize whitespace volatility
  const normText = normalizeWhitespace(text);
  const normQuote = normalizeWhitespace(quote);

  // If normalization removed the quote entirely (e.g. only spaces), return null
  if (normQuote.length === 0) return null;

  // Allow up to 25% error rate, capped at 256
  const maxErrors = Math.min(256, Math.ceil(normQuote.length * 0.25));

  // Find candidate matches using edit distance, with a position hint if available
  const matches = search(normText, normQuote, maxErrors, { hint: context.hint });
  if (matches.length === 0) {
    // If localized search failed, try one last time with the whole text (no hint)
    const fallbackMatches = search(normText, normQuote, maxErrors);
    if (fallbackMatches.length === 0) return null;
    matches.push(...fallbackMatches);
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

    const quoteScore = 1 - match.errors / normQuote.length;

    const prefixScore = context.prefix
      ? textMatchScore(
          normText.slice(
            Math.max(0, match.start - context.prefix.length * 2),
            match.start,
          ),
          context.prefix,
        )
      : 1.0;

    const suffixScore = context.suffix
      ? textMatchScore(
          normText.slice(match.end, match.end + context.suffix.length * 2),
          context.suffix,
        )
      : 1.0;

    let posScore = 1.0;
    if (typeof context.hint === 'number') {
      const offset = Math.abs(match.start - context.hint);
      posScore = 1.0 - Math.min(1.0, offset / normText.length);
    }

    const rawScore =
      quoteWeight * quoteScore +
      prefixWeight * prefixScore +
      suffixWeight * suffixScore +
      posWeight * posScore;
    const maxScore = quoteWeight + prefixWeight + suffixWeight + posWeight;
    return rawScore / maxScore;
  };

  const scoredMatches = matches.map((m) => ({
    start: m.start,
    end: m.end,
    score: scoreMatch(m),
  }));

  scoredMatches.sort((a, b) => b.score - a.score);

  // Map the normalized position back to the original text
  // Since we normalized by collapsing whitespace, a character index in normText
  // maps to an index in text that is >=.
  const bestMatch = scoredMatches[0];
  if (bestMatch.score < 0.5) return null; // Reject low quality matches

  // To find the original offsets, we rely on the fact that we've found the text.
  // We'll perform one last exact search for the normalized quote in a window of the original text.
  // This is approximate but usually exact enough for highlighting.
  // For a truly perfect mapping, we'd need a source-map, but that's expensive.
  return {
    start: findNearestOffset(text, normQuote, bestMatch.start),
    end: findNearestOffset(text, normQuote, bestMatch.end, true),
    score: bestMatch.score,
  };
}

/**
 * Finds the nearest actual offset in the original string for a normalized index.
 * Normalization collapses all whitespace into single spaces and trims.
 *
 * @param text - Original raw text
 * @param normIndex - Index in the normalized version
 * @param isEnd - Whether we are finding the end boundary (offset after last char)
 */
function findNearestOffset(text: string, normIndex: number, isEnd = false): number {
  if (normIndex <= 0) return 0;

  let normPos = 0;
  let inWhitespace = false;
  let lastNonWhitespace = 0;

  for (let i = 0; i < text.length; i++) {
    const isWhitespace = /\s/.test(text[i]);

    if (!isWhitespace) {
      if (inWhitespace) {
        // We just transitioned from whitespace to a character.
        // In the normalized version, all preceding spaces became one space.
        normPos++;
        inWhitespace = false;
      }
      if (normPos === normIndex) return i;
      normPos++;
      lastNonWhitespace = i;
    } else {
      if (!inWhitespace) {
        inWhitespace = true;
      }
    }
  }

  // If we reached the end and still haven't matched
  return isEnd ? lastNonWhitespace + 1 : lastNonWhitespace;
}
