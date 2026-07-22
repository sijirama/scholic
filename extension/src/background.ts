/**
 * background.ts — Background service worker for the Scholic extension.
 *
 * Runs as a Manifest V3 service worker. Responsibilities:
 *
 * 1. API PROXY — Forwards requests from the content script to the backend.
 *    Content scripts can't make cross-origin requests directly, so they
 *    send messages here and we make the fetch() calls.
 *
 * 2. EXTENSION ICON — When the user clicks the Scholic icon, toggle the sidebar.
 *
 * 3. AUTH — Stores and retrieves the JWT token for authenticated API calls.
 */

/** Backend API base URL — updated to 8081 to match turva dev env */
import { CONFIG } from './config';
import { hydrateBlocklist, isBlockedUrl, refreshBlocklist, watchBlocklistStorage } from './blocklist';

const API_BASE = CONFIG.API_BASE;

// Defensive init: any throw at the top level would unregister the rest of the
// SW's listeners (icon click, header interception). Each block is isolated so
// a failure in blocklist setup never breaks PDF interception or the toggle.
try {
  hydrateBlocklist();
  watchBlocklistStorage();
} catch (err) {
  console.warn('[Scholic] Blocklist hydration failed at SW init:', err);
}

try {
  chrome.runtime.onInstalled.addListener(() => { refreshBlocklist(); });
  chrome.runtime.onStartup.addListener(() => { refreshBlocklist(); });
  if (chrome.alarms?.create) {
    chrome.alarms.create('blocklist-refresh', { periodInMinutes: 30 });
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === 'blocklist-refresh') refreshBlocklist();
    });
  } else {
    console.warn('[Scholic] chrome.alarms unavailable — manifest missing "alarms" permission?');
  }
} catch (err) {
  console.warn('[Scholic] Blocklist refresh setup failed:', err);
}

/**
 * PDF Interception via HTTP Headers
 * This catches all PDF files, regardless of URL format,
 * by inspecting the actual Content-Type returned by the server.
 */
chrome.webRequest.onHeadersReceived.addListener(
  async (details) => {
    if (details.type !== 'main_frame') return;
    const url = details.url;
    if (url.includes('viewer.html?url=')) return;

    const contentTypeHeader = details.responseHeaders?.find(
      (h) => h.name.toLowerCase() === 'content-type'
    );
    const contentType = contentTypeHeader?.value?.toLowerCase() || '';
    const isPdf = contentType.includes('application/pdf') ||
                  (contentType.includes('application/octet-stream') && url.toLowerCase().endsWith('.pdf'));

    // Per-tab PDF flag: written here on every main-frame response so the
    // icon-click toggle has ground truth when deciding whether to swap to
    // Scholic's viewer. Necessary because Chrome 118+ runs content scripts on
    // the native PDF viewer, so a successful sendMessage no longer means
    // "regular HTML page". Setting on PDF / removing on non-PDF here (rather
    // than cleaning up in tabs.onUpdated) avoids a race with Chrome's internal
    // navigation to its built-in PDF viewer, which fires onUpdated with a
    // changeInfo.url and would otherwise wipe the mark we just set.
    if (details.tabId >= 0) {
      if (isPdf) {
        chrome.storage.session.set({ [`pdfTab:${details.tabId}`]: url }).catch(() => {});
      } else {
        chrome.storage.session.remove(`pdfTab:${details.tabId}`).catch(() => {});
      }
    }

    if (!isPdf) return;

    try {
      const domain = new URL(url).hostname;
      const result = await chrome.storage.local.get('enabledDomains');
      const enabledDomains = result.enabledDomains || {};
      if (!enabledDomains[domain]) return;
    } catch {
      return;
    }

    const viewerUrl = chrome.runtime.getURL(`viewer.html?url=${encodeURIComponent(url)}`);
    chrome.tabs.update(details.tabId, { url: viewerUrl });
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

/**
 * Grey out the icon as soon as a tab navigates to a blocked URL.
 * This fires before the content script loads, so the icon is never briefly active.
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'loading') return;
  const url = tab.url || changeInfo.url;
  if (!url) return;
  try {
    if (isBlockedUrl(url)) {
      chrome.action.setIcon({ tabId, path: ICON_GREY });
      chrome.action.setBadgeText({ text: '', tabId });
      chrome.action.disable(tabId);
    } else {
      chrome.action.setIcon({ tabId, path: ICON_DEFAULT });
      chrome.action.enable(tabId);
    }
  } catch {
    // ignore — tab may already be closed
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(`pdfTab:${tabId}`).catch(() => {});
});

/**
 * Handle messages from content scripts or the PDF viewer.
 */
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) return;

  try {
    // Special case: tab is already on Scholic's PDF viewer.
    // tab.url here is chrome-extension://<id>/viewer.html?url=<original>;
    // toggle uses the underlying PDF's domain, and disabling navigates the
    // tab back to the original PDF (Chrome's native viewer takes over since
    // onHeadersReceived will skip the redirect now that the domain is off).
    const viewerPrefix = chrome.runtime.getURL('viewer.html');
    if (tab.url.startsWith(viewerPrefix)) {
      const originalUrl = new URL(tab.url).searchParams.get('url');
      if (!originalUrl) return;
      const originalDomain = new URL(originalUrl).hostname;
      const stored = await chrome.storage.local.get('enabledDomains');
      const enabledDomains = stored.enabledDomains || {};
      const isEnabled = !enabledDomains[originalDomain];
      enabledDomains[originalDomain] = isEnabled;
      await chrome.storage.local.set({ enabledDomains });
      console.log(`[Scholic] ${originalDomain} (PDF) is now ${isEnabled ? 'enabled' : 'disabled'}`);
      if (!isEnabled) {
        chrome.tabs.update(tab.id, { url: originalUrl });
      }
      return;
    }

    const url = new URL(tab.url);
    if (url.protocol.startsWith('chrome') || url.protocol.startsWith('about')) return;

    // Never enable Scholic on blocked pages — the icon should stay greyed out
    if (isBlockedUrl(tab.url)) {
      await chrome.action.setIcon({ tabId: tab.id, path: ICON_GREY });
      await chrome.action.setBadgeText({ text: '', tabId: tab.id });
      await chrome.action.disable(tab.id);
      return;
    }

    const domain = url.hostname;
    const result = await chrome.storage.local.get('enabledDomains');
    const enabledDomains = result.enabledDomains || {};

    const isEnabled = !enabledDomains[domain];
    enabledDomains[domain] = isEnabled;
    await chrome.storage.local.set({ enabledDomains });

    console.log(`[Scholic] ${domain} is now ${isEnabled ? 'enabled' : 'disabled'}`);

    if (isEnabled) {
      // First check if onHeadersReceived flagged this tab as a PDF. Chrome 118+
      // injects content scripts onto its native PDF viewer, so sendMessage
      // succeeds there even though the content script can't swap viewers.
      // The session-storage flag is the only reliable "this is a PDF" signal.
      const pdfMark = await chrome.storage.session.get(`pdfTab:${tab.id}`);
      if (pdfMark[`pdfTab:${tab.id}`]) {
        const viewerUrl = chrome.runtime.getURL(`viewer.html?url=${encodeURIComponent(tab.url)}`);
        chrome.tabs.update(tab.id, { url: viewerUrl });
        return;
      }

      // Regular page path: notify the content script. If there's no listener
      // (some non-content-script page that escaped manifest matches), fall
      // back to assuming PDF and swapping anyway.
      const sent = await chrome.tabs.sendMessage(tab.id, { type: 'SET_ENABLED', enabled: true })
        .catch(() => null);
      if (sent) return;

      const viewerUrl = chrome.runtime.getURL(`viewer.html?url=${encodeURIComponent(tab.url)}`);
      chrome.tabs.update(tab.id, { url: viewerUrl });
      return;
    }

    // Disabling: just notify the content script (or silently ignore if not running)
    chrome.tabs.sendMessage(tab.id, { type: 'SET_ENABLED', enabled: false })
      .catch(() => { /* tab may not have content script */ });
  } catch (err) {
    console.warn('[Scholic] Could not toggle state:', err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Badge
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Update the extension badge for a specific tab.
 * Shows the annotation count when > 0, or clears the badge otherwise.
 */
async function updateBadge(tabId: number, count: number): Promise<void> {
  const text = count > 0 ? String(count) : '';
  await chrome.action.setBadgeText({ text, tabId });
  await chrome.action.setBadgeBackgroundColor({ color: '#6EB781', tabId });
}

/**
 * Grey out the extension icon for a specific tab (blocked page).
 * Uses chrome.action.disable() which dims the icon natively.
 */
const ICON_GREY = {
  '16': 'icons/icon16_grey.png',
  '48': 'icons/icon48_grey.png',
  '128': 'icons/icon128_grey.png',
};

const ICON_DEFAULT = {
  '16': 'icons/icon16.png',
  '48': 'icons/icon48.png',
  '128': 'icons/icon128.png',
};

async function setPageBlocked(tabId: number, blocked: boolean): Promise<void> {
  if (blocked) {
    await chrome.action.setIcon({ tabId, path: ICON_GREY });
    await chrome.action.setBadgeText({ text: '', tabId });
    await chrome.action.disable(tabId);
  } else {
    await chrome.action.setIcon({ tabId, path: ICON_DEFAULT });
    await chrome.action.enable(tabId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Message Listener — API Proxy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Listen for messages from content scripts and proxy API calls.
 *
 * Supported message types:
 *   - CREATE_ANNOTATION → POST /api/annotations
 *   - FETCH_ANNOTATIONS → GET /api/annotations?url=...
 *   - DELETE_ANNOTATION → DELETE /api/annotations/:id
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle badge updates directly (needs sender.tab.id, not routed through handleMessage)
  if (message.type === 'UPDATE_BADGE') {
    if (sender.tab?.id) {
      updateBadge(sender.tab.id, message.data?.count || 0);
    }
    sendResponse({ ok: true });
    return true;
  }

  // Handle blocked page — dim/restore the extension icon for this tab
  if (message.type === 'SET_PAGE_BLOCKED') {
    if (sender.tab?.id) {
      setPageBlocked(sender.tab.id, !!message.blocked);
    }
    sendResponse({ ok: true });
    return true;
  }

  handleMessage(message)
    .then((result) => {
      // Update badge when annotations are fetched
      if (message.type === 'FETCH_ANNOTATIONS' && sender.tab?.id && result?.annotations) {
        updateBadge(sender.tab.id, result.annotations.length);
      }
      sendResponse(result);
    })
    .catch((err) => {
      console.error('[Scholic] API error:', err);
      sendResponse({ error: err.message });
    });

  // Return true to indicate we'll respond asynchronously
  return true;
});

/**
 * Listen for messages from the Scholic web app (syncing the JWT).
 * Requires "externally_connectable" in manifest.json.
 */
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message.type === 'SCHOLIC_EXT_AUTH' && message.token) {
    console.log('[Scholic] Received token from sync page:', sender?.url);
    chrome.storage.local.set({ scholicToken: message.token }).then(() => {
      sendResponse({ success: true, message: 'Token saved' });
    });
    return true; // Keep channel open for async response
  }
});

/**
 * Route messages to the appropriate handler.
 */
async function handleMessage(message: any): Promise<any> {
  switch (message.type) {
    case 'CREATE_ANNOTATION':
      return createAnnotation(message.data);
    case 'FETCH_ANNOTATIONS':
      return fetchAnnotations(message.data.url, message.data.limit, message.data.offset);
    case 'DELETE_ANNOTATION':
      return deleteAnnotation(message.data.id);
    case 'CREATE_COMMENT':
      return createComment(message.data.annotationId, message.data.text);
    case 'TOGGLE_REACTION':
      return toggleReaction(message.data.annotationId, message.data.emoji);
    case 'CLEAR_REACTION':
      return clearReaction(message.data.annotationId);
    case 'FETCH_BOOKMARK':
      return fetchBookmark(message.data.url);
    case 'CREATE_BOOKMARK':
      return createBookmark(message.data.url, message.data.title, message.data.isPrivate);
    case 'UPDATE_BOOKMARK':
      return updateBookmark(message.data.url, message.data.isPrivate);
    case 'DELETE_BOOKMARK':
      return deleteBookmark(message.data.url);
    case 'FETCH_ME':
      return apiRequest('/auth/me');
    case 'SEARCH_USERS':
      return searchUsers(message.data.query, message.data.username);
    case 'CAPTURE_TAB':
      return captureVisibleTab();
    default:
      return { error: `Unknown message type: ${message.type}` };
  }
}

/**
 * Toggle a reaction on an annotation. Mirrors the web client.
 * Server resolves: insert / replace / toggle-off based on existing state.
 *
 * POST /api/annotations/:id/reactions
 */
async function toggleReaction(annotationId: string | number, emoji: string): Promise<any> {
  return apiRequest(`/annotations/${annotationId}/reactions`, {
    method: 'POST',
    body: JSON.stringify({ emoji }),
  });
}

/**
 * Clear the user's reaction outright (idempotent).
 *
 * DELETE /api/annotations/:id/reactions
 */
async function clearReaction(annotationId: string | number): Promise<any> {
  return apiRequest(`/annotations/${annotationId}/reactions`, {
    method: 'DELETE',
  });
}

async function fetchBookmark(url: string): Promise<any> {
  return apiRequest(`/bookmarks/by-url?url=${encodeURIComponent(url)}`);
}

async function createBookmark(url: string, title?: string, isPrivate = true): Promise<any> {
  return apiRequest('/bookmarks', {
    method: 'POST',
    body: JSON.stringify({ url, title, isPrivate }),
  });
}

async function updateBookmark(url: string, isPrivate: boolean): Promise<any> {
  return apiRequest(`/bookmarks/by-url?url=${encodeURIComponent(url)}`, {
    method: 'PATCH',
    body: JSON.stringify({ isPrivate }),
  });
}

async function deleteBookmark(url: string): Promise<any> {
  return apiRequest(`/bookmarks/by-url?url=${encodeURIComponent(url)}`, {
    method: 'DELETE',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// API Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the stored JWT token for API authentication.
 * The token is stored in chrome.storage.local after the user logs in.
 */
async function getAuthToken(): Promise<string | null> {
  const result = await chrome.storage.local.get('scholicToken');
  return result.scholicToken || null;
}

/**
 * Make an authenticated request to the backend API.
 *
 * @param path - API path (e.g., "/annotations")
 * @param options - Fetch options (method, body, etc.)
 * @returns Parsed JSON response
 */
async function apiRequest(path: string, options: RequestInit = {}): Promise<any> {
  const token = await getAuthToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  });

  if (response.status === 401) {
    console.warn('[Scholic] Session expired or invalid (401). Clearing token.');
    await chrome.storage.local.remove('scholicToken');
    throw new Error('Authentication session expired. Please sign in again.');
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`API error ${response.status}: ${errorBody}`);
  }

  return response.json();
}

/**
 * Create a new annotation.
 *
 * POST /api/annotations
 * Body: { url, quoteText, text, selectors, isPrivate }
 */
async function createAnnotation(data: any): Promise<any> {
  const annotation = await apiRequest('/annotations', {
    method: 'POST',
    body: JSON.stringify({
      url: data.url,
      quoteText: data.quoteText,
      text: data.text,
      selectors: JSON.stringify(data.selectors || []),
      isPrivate: data.isPrivate,
      type: data.type || 'text',
      image: data.image,
      pdfHash: data.pdfHash,
      pdfPage: data.pdfPage,
      highlightColor: data.highlightColor || '#A8D5B5',
      linkPreviewImageMode: data.linkPreviewImageMode || 'default',
    }),
  });

  return { annotation };
}

/**
 * Capture the visible tab and return as a data URL.
 */
async function captureVisibleTab(): Promise<any> {
  const dataUrl = await chrome.tabs.captureVisibleTab({ format: 'png' });
  return { dataUrl };
}

/**
 * Fetch all annotations for a given URL.
 *
 * GET /api/annotations?url=<encoded-url>
 */
async function fetchAnnotations(url: string, limit = 50, offset = 0): Promise<any> {
  const result = await apiRequest(
    `/annotations?url=${encodeURIComponent(url)}&limit=${limit}&offset=${offset}`,
  );

  const rawAnnotations = result?.annotations || [];
  const total = result?.total ?? rawAnnotations.length;

  // Parse selectors from JSON string back to objects
  const parsed = rawAnnotations.map((a: any) => ({
    ...a,
    selectors: typeof a.selectors === 'string' ? JSON.parse(a.selectors) : a.selectors,
  }));

  return { annotations: parsed, total };
}

/**
 * Search users for mention autocomplete.
 */
async function searchUsers(query: string, username?: string): Promise<any> {
  if (!query && username) {
    const result = await apiRequest(`/users/${encodeURIComponent(username)}/following?limit=24&offset=0`);
    const users = Array.isArray(result?.users)
      ? [...result.users].sort(() => Math.random() - 0.5).slice(0, 6)
      : [];
    return { ...result, users };
  }

  const q = encodeURIComponent(query || '');
  return apiRequest(`/users/search?q=${q}&limit=6`);
}

/**
 * Delete an annotation by ID.
 *
 * DELETE /api/annotations/:id
 */
async function deleteAnnotation(id: string): Promise<any> {
  await apiRequest(`/annotations/${id}`, { method: 'DELETE' });
  return { deleted: true };
}

/**
 * Create a new comment on an annotation.
 *
 * POST /api/annotations/:id/comments
 */
async function createComment(annotationId: string, text: string): Promise<any> {
  const comment = await apiRequest(`/annotations/${annotationId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
  return { comment };
}
