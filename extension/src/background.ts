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

const API_BASE = CONFIG.API_BASE;

/**
 * PDF Interception via HTTP Headers
 * This catches all PDF files, regardless of URL format,
 * by inspecting the actual Content-Type returned by the server.
 */
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    // Only intercept main frame navigation (full page loads)
    if (details.type !== 'main_frame') return;

    const url = details.url;
    // Avoid redirect loop
    if (url.includes('viewer.html?url=')) return;

    // Check if response is a PDF
    const contentTypeHeader = details.responseHeaders?.find(
      (h) => h.name.toLowerCase() === 'content-type'
    );
    const contentType = contentTypeHeader?.value?.toLowerCase() || '';

    // True PDF content type, or octet-stream fallback for .pdf URLs
    const isPdf = contentType.includes('application/pdf') || 
                  (contentType.includes('application/octet-stream') && url.toLowerCase().endsWith('.pdf'));

    if (isPdf) {
      console.log(`[Scholic] PDF detected via headers: ${url}. Redirecting to viewer...`);
      const viewerUrl = chrome.runtime.getURL(`viewer.html?url=${encodeURIComponent(url)}`);
      
      // We asynchronously update the tab. This cancels the ongoing PDF load
      // in the native viewer and navigates to our custom viewer.
      chrome.tabs.update(details.tabId, { url: viewerUrl });
    }
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

/**
 * Handle messages from content scripts or the PDF viewer.
 */
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) return;

  try {
    const url = new URL(tab.url);
    if (url.protocol.startsWith('chrome') || url.protocol.startsWith('about')) return;
    
    const domain = url.hostname;
    const result = await chrome.storage.local.get('enabledDomains');
    const enabledDomains = result.enabledDomains || {};
    
    const isEnabled = !enabledDomains[domain];
    enabledDomains[domain] = isEnabled;
    
    await chrome.storage.local.set({ enabledDomains });
    
    // Notify the content script of the change
    await chrome.tabs.sendMessage(tab.id, { 
      type: 'SET_ENABLED', 
      enabled: isEnabled 
    });

    console.log(`[Scholic] ${domain} is now ${isEnabled ? 'enabled' : 'disabled'}`);
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
      return fetchAnnotations(message.data.url);
    case 'DELETE_ANNOTATION':
      return deleteAnnotation(message.data.id);
    case 'CREATE_COMMENT':
      return createComment(message.data.annotationId, message.data.text);
    case 'FETCH_ME':
      return apiRequest('/auth/me');
    case 'CAPTURE_TAB':
      return captureVisibleTab();
    default:
      return { error: `Unknown message type: ${message.type}` };
  }
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
async function fetchAnnotations(url: string): Promise<any> {
  const annotations = await apiRequest(
    `/annotations?url=${encodeURIComponent(url)}`,
  );

  // Parse selectors from JSON string back to objects
  const parsed = (annotations || []).map((a: any) => ({
    ...a,
    selectors: typeof a.selectors === 'string' ? JSON.parse(a.selectors) : a.selectors,
  }));

  return { annotations: parsed };
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
