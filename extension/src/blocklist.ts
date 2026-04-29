/**
 * blocklist.ts — Runtime blocklist for the extension.
 *
 * Source of truth lives on the backend (GET /api/blocklist). The extension:
 *   1. Hydrates an in-memory cache from chrome.storage.local on every script
 *      start (background SW + content script).
 *   2. Background SW refreshes the list from the API every 30 minutes via
 *      chrome.alarms, plus on install/startup.
 *   3. Patterns are stored as RegExp source strings on the wire; we compile
 *      them to RegExp once at hydration time so isBlockedUrl() stays sync.
 *
 * Bootstrapping note: there is intentionally NO bundled fallback list. On a
 * fresh install before the first fetch completes, the blocklist is empty
 * and Scholic is visible everywhere — refreshes resolve this within seconds.
 * After the first successful fetch the cache persists across SW restarts.
 */

import { CONFIG } from './config';

interface RawPattern {
  hostname?: string;
  hostnameRegex?: string;
  blockPath?: string;
  allowPath?: string;
  reason: string;
}

interface CompiledPattern {
  hostname: string | null;
  hostnameRegex: RegExp | null;
  blockPath: RegExp | null;
  allowPath: RegExp | null;
}

interface CachedBlocklist {
  patterns: RawPattern[];
  fetchedAt: number;
}

const STORAGE_KEY = 'blocklistCache';
const ENDPOINT = `${CONFIG.API_BASE}/blocklist`;

let compiled: CompiledPattern[] = [];

function compile(raw: RawPattern[]): CompiledPattern[] {
  const out: CompiledPattern[] = [];
  for (const p of raw) {
    try {
      out.push({
        hostname: p.hostname || null,
        hostnameRegex: p.hostnameRegex ? new RegExp(p.hostnameRegex) : null,
        blockPath: p.blockPath ? new RegExp(p.blockPath) : null,
        allowPath: p.allowPath ? new RegExp(p.allowPath) : null,
      });
    } catch (err) {
      // Invalid regex — skip this rule rather than poison the whole list.
      console.warn('[Scholic] Skipping invalid blocklist pattern:', p, err);
    }
  }
  return out;
}

/**
 * Read the cached list from chrome.storage.local into memory. Call once at
 * script start (background SW + content script) so isBlockedUrl is ready.
 */
export async function hydrateBlocklist(): Promise<void> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const cached = stored[STORAGE_KEY] as CachedBlocklist | undefined;
  if (cached?.patterns?.length) {
    compiled = compile(cached.patterns);
  }
}

/**
 * Fetch the latest list from the backend and overwrite the cache. Background
 * SW only — content scripts pick up the new list via chrome.storage.onChanged.
 */
export async function refreshBlocklist(): Promise<void> {
  try {
    const response = await fetch(ENDPOINT);
    if (!response.ok) {
      console.warn(`[Scholic] Blocklist fetch failed: ${response.status}`);
      return;
    }
    const patterns = await response.json() as RawPattern[];
    if (!Array.isArray(patterns)) {
      console.warn('[Scholic] Blocklist response is not an array');
      return;
    }
    const cached: CachedBlocklist = { patterns, fetchedAt: Date.now() };
    await chrome.storage.local.set({ [STORAGE_KEY]: cached });
    compiled = compile(patterns);
  } catch (err) {
    console.warn('[Scholic] Blocklist refresh error:', err);
  }
}

/**
 * Wire chrome.storage.onChanged so content scripts pick up new lists pushed
 * by the background SW without needing to re-fetch themselves.
 */
export function watchBlocklistStorage(): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const change = changes[STORAGE_KEY];
    if (!change?.newValue) return;
    const next = change.newValue as CachedBlocklist;
    if (Array.isArray(next.patterns)) {
      compiled = compile(next.patterns);
    }
  });
}

/**
 * Returns true if Scholic should be fully disabled for the given URL.
 * Sync — reads from the in-memory compiled list only. Returns false (allow)
 * if the cache hasn't been hydrated yet.
 */
export function isBlockedUrl(href: string): boolean {
  if (compiled.length === 0) return false;

  let parsed: URL;
  try {
    parsed = new URL(href);
  } catch {
    return false;
  }

  const hostname = parsed.hostname;
  const pathname = parsed.pathname;

  for (const p of compiled) {
    const hostnameMatches = p.hostname
      ? hostname === p.hostname
      : p.hostnameRegex
        ? p.hostnameRegex.test(hostname)
        : false;
    if (!hostnameMatches) continue;

    if (p.allowPath && p.allowPath.test(pathname)) continue;
    if (!p.blockPath || p.blockPath.test(pathname)) {
      return true;
    }
  }

  return false;
}
