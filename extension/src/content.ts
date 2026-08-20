/**
 * content.ts — Content script orchestrator for the Scholic annotation extension.
 *
 * This is the MAIN entry point that runs on every webpage. It coordinates:
 *
 * 1. TEXT SELECTION → When the user selects text, show the popover
 * 2. ANNOTATE      → Generate selectors, open sidebar with form, save to backend
 * 3. HIGHLIGHT     → Generate selectors, save as private, render highlight
 * 4. PAGE LOAD     → Fetch stored annotations, re-anchor them, render highlights
 * 5. SIDEBAR       → Manage the sidebar panel for viewing/creating annotations
 *
 * Communication with the backend happens via chrome.runtime.sendMessage()
 * to the background script, which proxies API calls.
 */

import { describe, anchor } from './anchoring/index';
import { highlightRange, removeHighlights, getHighlightsForAnnotation } from './highlighter';
import { SelectionPopover } from './popover';
import { HIGHLIGHT_COLORS, Sidebar } from './sidebar';
import type { AnnotationData } from './sidebar';
import { HighlightPopup } from './highlight-popup';
import { Snipper, Area } from './snipper';
import { hydrateBlocklist, isBlockedUrl, watchBlocklistStorage } from './blocklist';
import { canonicalAnnotationUrl } from './url';

// Hydrate the in-memory blocklist from chrome.storage.local (populated by the
// background SW). Watch for live updates so a fresh blocklist landing in
// storage takes effect without a page reload.
hydrateBlocklist();
watchBlocklistStorage();

// ─────────────────────────────────────────────────────────────────────────────
// Iframe guard: skip content script in iframes to avoid duplicate sidebars
// ─────────────────────────────────────────────────────────────────────────────
const IS_IFRAME = window.self !== window.top;

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

/** Map of annotation ID → highlight elements (for removal/focus) */
const highlightMap = new Map<string, HTMLElement[]>();

/** All annotations for the current page */
let pageAnnotations: AnnotationData[] = [];

interface HighlightData {
  id?: string | number;
  url: string;
  quoteText: string;
  selectors: AnnotationData['selectors'];
  type?: 'text' | 'pdf';
  pdfHash?: string;
  pdfPage?: number;
  highlightColor?: string;
}

/** Private quick highlights for the current user/page. */
let pageHighlights: HighlightData[] = [];
const quickHighlightMap = new Map<string, HTMLElement[]>();
let highlightMenuHost: HTMLElement | null = null;

/** Pending highlight elements from the current annotate/highlight action (before save) */
let pendingHighlightElements: HTMLElement[] = [];

/** Current active tab ('mine' | 'community' | 'all') */
let currentActiveTab: 'mine' | 'community' | 'all' = 'mine';

/** Guard flag: when true, we're modifying the DOM ourselves */
let suppressSync = false;

/** Interval ID for the periodic highlight sync */
let syncInterval: ReturnType<typeof setInterval> | null = null;

/** How many sync cycles remain before we stop checking */
let syncAttemptsLeft = 0;

/** Total annotations available on the server for this page */
let annotationsTotal = 0;
/** How many annotations we've loaded so far */
let annotationsOffset = 0;
/** Page size for annotation fetches */
const ANNOTATIONS_PAGE_SIZE = 50;

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply a hex highlight color to a set of highlight elements via CSS custom
 * properties. The content.css uses var(--sr), var(--sg), var(--sb) for color
 * and var(--sa) for luminance-adaptive alpha, so hover states work automatically.
 *
 * mix-blend-mode: multiply handles text legibility on light backgrounds.
 * Darker colors get a lower alpha so they don't overpower light-colored text.
 */
function applyHighlightColor(elements: HTMLElement[], hex: string): void {
  const color = hex && hex.startsWith('#') && hex.length === 7 ? hex : '#A8D5B5';
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  // Relative luminance (0 = black, 1 = white)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  // Pastels stay visible; saturated mid/dark tones get heavily dimmed so text shows through
  const alpha = luminance >= 0.65 ? 0.30
              : luminance >= 0.45 ? 0.20
              : luminance >= 0.30 ? 0.14
              : 0.10;
  elements.forEach(el => {
    el.style.setProperty('--sr', String(r));
    el.style.setProperty('--sg', String(g));
    el.style.setProperty('--sb', String(b));
    el.style.setProperty('--sa', String(alpha));
  });
}

function hideHighlightMenu(): void {
  highlightMenuHost?.remove();
  highlightMenuHost = null;
}

function quickHighlightDomId(id: string | number): string {
  return `quick-highlight-${id}`;
}

function showQuickHighlightMenu(highlightId: string, highlightEl: HTMLElement): void {
  const highlight = pageHighlights.find((h) => String(h.id) === String(highlightId));
  if (!highlight) return;
  hideHighlightMenu();

  const host = document.createElement('scholic-quick-highlight-menu');
  host.style.cssText = 'position:absolute;z-index:2147483646;';
  const shadow = host.attachShadow({ mode: 'closed' });
  const currentColor = highlight.highlightColor || '#A8D5B5';

  const style = document.createElement('style');
  style.textContent = `
    .menu {
      width: 252px;
      display: flex;
      align-items: center;
      gap: 8px;
      border-radius: 12px;
      background: #151515;
      border: 1px solid rgba(255,255,255,0.11);
      box-shadow: 0 18px 48px rgba(0,0,0,0.42), 0 4px 14px rgba(0,0,0,0.28);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      padding: 7px;
      box-sizing: border-box;
    }
    .swatches {
      width: 164px;
      display: flex;
      align-items: center;
      gap: 7px;
      overflow-x: auto;
      overflow-y: hidden;
      scrollbar-width: none;
      padding: 3px;
      scroll-snap-type: x proximity;
    }
    .scroll {
      width: 24px;
      height: 30px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: none;
      border-radius: 8px;
      background: rgba(255,255,255,0.06);
      color: #b8b8b8;
      cursor: pointer;
      padding: 0;
      flex: 0 0 auto;
    }
    .scroll:hover { background: rgba(255,255,255,0.1); color: #f0f0f0; }
    .swatches::-webkit-scrollbar { display: none; }
    .swatch {
      width: 18px;
      height: 18px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.18);
      cursor: pointer;
      padding: 0;
      flex: 0 0 auto;
      scroll-snap-align: start;
      box-shadow: inset 0 0 0 1px rgba(0,0,0,0.16);
    }
    .swatch.active {
      outline: 2px solid #f4f4f4;
      outline-offset: 2px;
    }
    .delete {
      width: 30px;
      height: 30px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: none;
      border-radius: 999px;
      background: rgba(232,71,122,0.12);
      color: #ff8cab;
      cursor: pointer;
      padding: 0;
      flex: 0 0 auto;
    }
    .delete:hover { background: rgba(232,71,122,0.18); }
  `;
  shadow.appendChild(style);

  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.innerHTML = `
    <button class="scroll scroll-left" type="button" title="Previous colors" aria-label="Previous colors">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
    </button>
    <div class="swatches">
      ${HIGHLIGHT_COLORS.map((color) => `
        <button
          class="swatch ${color.hex.toLowerCase() === currentColor.toLowerCase() ? 'active' : ''}"
          style="background:${color.hex}"
          title="${color.name}"
          data-color="${color.hex}"
        ></button>
      `).join('')}
    </div>
    <button class="scroll scroll-right" type="button" title="More colors" aria-label="More colors">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
    </button>
    <button class="delete" type="button" title="Delete highlight" aria-label="Delete highlight">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
    </button>
  `;
  shadow.appendChild(menu);

  const swatches = menu.querySelector<HTMLElement>('.swatches');
  menu.querySelector<HTMLButtonElement>('.scroll-left')?.addEventListener('click', (event) => {
    event.stopPropagation();
    swatches?.scrollBy({ left: -88, behavior: 'smooth' });
  });
  menu.querySelector<HTMLButtonElement>('.scroll-right')?.addEventListener('click', (event) => {
    event.stopPropagation();
    swatches?.scrollBy({ left: 88, behavior: 'smooth' });
  });

  menu.querySelectorAll<HTMLButtonElement>('.swatch').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      const color = button.dataset.color || '#A8D5B5';
      await handleUpdateQuickHighlightColor(highlightId, color);
      hideHighlightMenu();
    });
  });
  menu.querySelector<HTMLButtonElement>('.delete')?.addEventListener('click', async (event) => {
    event.stopPropagation();
    await handleDeleteQuickHighlight(highlightId);
    hideHighlightMenu();
  });

  host.addEventListener('mousedown', (event) => event.stopPropagation());
  document.body.appendChild(host);
  highlightMenuHost = host;

  const rect = highlightEl.getBoundingClientRect();
  const width = 252;
  let left = rect.left + window.scrollX + rect.width / 2 - width / 2;
  left = Math.max(8 + window.scrollX, Math.min(left, window.scrollX + window.innerWidth - width - 8));
  host.style.left = `${left}px`;
  host.style.top = '-10000px';
  const menuHeight = menu.offsetHeight;
  host.style.top = rect.top < menuHeight + 16
    ? `${rect.bottom + window.scrollY + 8}px`
    : `${rect.top + window.scrollY - menuHeight - 8}px`;
}

// Initialize Components
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The selection popover — appears when user selects text.
 * "Annotate" opens the sidebar; "Highlight" creates a private highlight.
 */
const popover = new SelectionPopover({
  onAnnotate: (range, quoteText) => handleAnnotate(range, quoteText),
  onHighlight: (range, quoteText) => handleHighlight(range, quoteText),
});

/**
 * The sidebar panel — shows annotation form and annotation list.
 */
const sidebar = new Sidebar({
  onSave: (annotation) => handleSaveAnnotation(annotation),
  onDelete: (annotationId) => handleDeleteAnnotation(annotationId),
  onFocusAnnotation: (annotationId) => handleFocusAnnotation(annotationId),
  onComment: (annotationId, text) => handleComment(annotationId, text),
  onRefresh: () => loadAnnotations(),
  onTabChange: (tab) => handleTabChange(tab),
  onLoadMore: () => loadMoreAnnotations(),
  onDiscard: () => discardPendingAnnotation(),
  onReact: (annotationId, emoji) => handleReact(annotationId, emoji),
  getCurrentUrl: () => currentAnnotationUrl(),
  getPageTitle: () => document.title,
});

/**
 * The highlight popup — appears when hovering over a highlight element.
 */
const highlightPopup = new HighlightPopup(
  (id: string) => {
    return pageAnnotations.find((a) => String(a.id) === id);
  },
  (id: string, text: string) => handleComment(id, text),
  (id, emoji) => handleReact(id, emoji)
);

/**
 * The snipper — for area selection.
 */
const snipper = new Snipper(
  (area) => handleAreaSelected(area),
  () => sidebar.open() // Re-open sidebar on cancel
);

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle & Enablement
// ─────────────────────────────────────────────────────────────────────────────

let isEnabled = false;

function currentAnnotationUrl(): string {
  return canonicalAnnotationUrl(window.location.href);
}

/**
 * Periodically check if all annotations have visible highlights.
 * If any are missing (destroyed by framework re-render, or content just appeared),
 * re-anchor them.
 *
 * This is intentionally naive: no MutationObserver, no orphan tracking, no
 * complex event chains. Just check every 2s for 30s after page load. Handles
 * both failure modes uniformly:
 *   - Content not yet in DOM (lazy loading) → retry finds it when it appears
 *   - Highlight destroyed by framework re-render → retry re-creates it
 */
function startHighlightSync(): void {
  stopHighlightSync();
  syncAttemptsLeft = 15; // Check up to 15 times (30 seconds total)
  syncInterval = setInterval(() => syncHighlights(), 2000);
}

function stopHighlightSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  syncAttemptsLeft = 0;
}

async function syncHighlights(): Promise<void> {
  syncAttemptsLeft--;
  if (syncAttemptsLeft <= 0) {
    stopHighlightSync();
  }

  if (suppressSync || pageAnnotations.length === 0) return;

  // Find annotations that are missing highlights (never anchored, or destroyed)
  const missing: AnnotationData[] = [];
  for (const annotation of pageAnnotations) {
    if (!annotation.id || !annotation.selectors) continue;
    if (annotation.type === 'image') continue;

    const id = String(annotation.id);
    const highlights = highlightMap.get(id);

    if (!highlights || !highlights.some((h) => h.isConnected)) {
      // Clean up stale entries
      if (highlights) highlightMap.delete(id);
      missing.push(annotation);
    }
  }

  if (missing.length === 0) {
    // Everything is anchored — stop checking early
    stopHighlightSync();
    return;
  }

  console.log(`[Scholic] Sync: ${missing.length} annotations missing highlights, re-anchoring...`);
  const anchored = await resolveAndRenderAnnotations(missing);
  if (anchored > 0) {
    await filterHighlights();
  }
}

/**
 * Check if Scholic is enabled for the current domain.
 * If enabled, initialize components and show the "peek" sidebar.
 */
async function bootstrap(): Promise<void> {
  // Blocked URL check runs first — before any storage reads.
  // On blocked pages Scholic is completely invisible and the icon is greyed out.
  if (isBlockedUrl(window.location.href)) {
    console.log(`[Scholic] Blocked URL — staying fully hidden: ${window.location.href}`);
    sidebar.hideCompletely();
    removeListeners();
    stopHighlightSync();
    chrome.runtime.sendMessage({ type: 'SET_PAGE_BLOCKED', blocked: true });
    return;
  }

  // Signal background that this page is not blocked (restore icon if it was greyed)
  chrome.runtime.sendMessage({ type: 'SET_PAGE_BLOCKED', blocked: false });

  const domain = window.location.hostname;
  const result = await chrome.storage.local.get('enabledDomains');
  const enabledDomains = result.enabledDomains || {};

  const authResult = await chrome.storage.local.get('scholicToken');
  if (!authResult.scholicToken) {
    currentActiveTab = 'all';
  }

  isEnabled = !!enabledDomains[domain];
  console.log(`[Scholic] Bootstrap: enabled=${isEnabled} for ${domain}`);

  if (isEnabled) {
    // Show peek sidebar on load if enabled
    sidebar.showPeek();
    loadAnnotations();
    setupListeners();
    startHighlightSync();
  } else {
    sidebar.hideCompletely();
    clearStateAndHighlights();
    removeListeners();
    stopHighlightSync();
  }
}

/**
 * Global event listeners (selection) that should only run when enabled.
 */
function setupListeners(): void {
  document.addEventListener('mouseup', handleMouseUp);
  document.addEventListener('mousedown', handleMouseDown);
  document.addEventListener('keydown', handleKeyDown);
}

function removeListeners(): void {
  document.removeEventListener('mouseup', handleMouseUp);
  document.removeEventListener('mousedown', handleMouseDown);
  document.removeEventListener('keydown', handleKeyDown);
  popover.hide();
}

/**
 * Handle messages from the background script.
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'SET_ENABLED') {
    // Ignore enable requests on blocked URLs — the sidebar must stay hidden
    if (message.enabled && isBlockedUrl(window.location.href)) {
      chrome.runtime.sendMessage({ type: 'SET_PAGE_BLOCKED', blocked: true });
      sendResponse({ ok: true });
      return true;
    }
    isEnabled = message.enabled;
    if (isEnabled) {
      sidebar.showPeek();
      loadAnnotations();
      setupListeners();
      startHighlightSync();
    } else {
      sidebar.hideCompletely();
      clearStateAndHighlights();
      removeListeners();
      stopHighlightSync();
      chrome.runtime.sendMessage({ type: 'UPDATE_BADGE', data: { count: 0 } });
    }
    sendResponse({ ok: true });
  } else if (message.type === 'TOGGLE_SIDEBAR') {
    // This is for the manual toggle or icon click if we didn't use SET_ENABLED
    if (isEnabled) {
      sidebar.toggle();
    } else {
      // If disabled, icon click should maybe enable it? 
      // But background.ts handles the storage toggle now.
    }
    sendResponse({ ok: true });
  }
  return true;
});

/**
 * Handle screenshot request from sidebar.
 */
window.addEventListener('SCHOLIC_START_SCREENSHOT', () => {
  console.log('[Scholic] Screenshot mode started.');
  // Hide sidebar peek/open state so it's not in the screenshot
  sidebar.hideCompletely();
  // Start the snipping tool
  setTimeout(() => snipper.start(), 100);
});

async function handleAreaSelected(area: Area): Promise<void> {
  console.log('[Scholic] Area selected:', area);
  
  try {
    // 1. Capture the entire visible tab
    const response = await chrome.runtime.sendMessage({ type: 'CAPTURE_TAB' });
    if (!response?.dataUrl) throw new Error('Failed to capture tab');

    // 2. Crop the image using a canvas
    const croppedDataUrl = await cropImage(response.dataUrl, area);
    
    // 3. Open sidebar with the image preview and form
    sidebar.openWithImage(croppedDataUrl);
  } catch (err) {
    console.error('[Scholic] Screenshot failed:', err);
    sidebar.open(); // Re-open on error
  }
}

/**
 * Crop a data URL image to a specific area using a temporary canvas.
 */
function cropImage(dataUrl: string, area: Area): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = area.width;
      canvas.height = area.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      
      // Draw the selected portion of the image onto the canvas
      ctx.drawImage(
        img,
        area.x, area.y, area.width, area.height, // Source
        0, 0, area.width, area.height            // Destination
      );
      
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Failed to load image for cropping'));
    img.src = dataUrl;
  });
}

/**
 * Handle keyboard shortcuts.
 *
 *   Alt+S  — Toggle sidebar open/close
 *   Alt+H  — Highlight current text selection (same as clicking "Highlight" in popover)
 *   Escape — Hide popover if visible
 */
function handleKeyDown(e: KeyboardEvent): void {
  if (!isEnabled) return;

  // Don't trigger if user is typing in an input/textarea/contenteditable
  const target = e.target as HTMLElement;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

  if (e.altKey && e.key === 's') {
    e.preventDefault();
    sidebar.toggle();
  }

  if (e.altKey && e.key === 'h') {
    e.preventDefault();
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.toString().trim()) {
      try {
        const range = selection.getRangeAt(0);
        handleHighlight(range, selection.toString().trim());
        popover.hide();
      } catch {
        // ignore
      }
    }
  }

  if (e.key === 'Escape') {
    popover.hide();
    hideHighlightMenu();
    // If a pending optimistic highlight is on the page, the user is mid-annotate.
    // Esc should clear it just like clicking Cancel. (When Esc fires inside the
    // sidebar form's textarea, the form's own handler intercepts it first.)
    if (pendingHighlightElements.length > 0) {
      discardPendingAnnotation();
    }
  }
}

/**
 * Handle mouseup (selection)
 */
function handleMouseUp(e: MouseEvent): void {
  if (!isEnabled) return;

  const target = e.target as HTMLElement;
  if (
    target.closest('scholic-popover-host') ||
    target.closest('scholic-sidebar-host')
  ) {
    return;
  }

  setTimeout(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      popover.hide();
      return;
    }

    try {
      const range = selection.getRangeAt(0);
      popover.show(range);
    } catch {
      popover.hide();
    }
  }, 10);
}

/**
 * Handle mousedown (hide popover)
 */
function handleMouseDown(e: MouseEvent): void {
  const target = e.target as HTMLElement;
  if (
    !target.closest('scholic-popover-host') &&
    !target.closest('scholic-sidebar-host') &&
    !target.closest('scholic-quick-highlight-menu')
  ) {
    popover.hide();
    hideHighlightMenu();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Badge
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send an UPDATE_BADGE message to the background script so the extension icon
 * reflects the current annotation count for this tab.
 */
function updateBadgeCount(): void {
  chrome.runtime.sendMessage({
    type: 'UPDATE_BADGE',
    data: { count: pageAnnotations.length },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle "Annotate" button click from the popover.
 *
 * 1. Generate selectors from the selection Range
 * 2. Immediately highlight the selected text (pending style)
 * 3. Open the sidebar with the quoted text
 * 4. Wait for user to fill in a note and click Save
 */
function handleAnnotate(range: Range, quoteText: string): void {
  console.log('[Scholic] Annotate clicked. Quote:', quoteText);
  
  // Generate all 3 selector types for maximum re-anchoring reliability
  const selectors = describe(document.body, range);
  console.log('[Scholic] Generated selectors:', selectors);

  // Immediately render a temporary highlight so the user can see what they selected.
  // Clone the range first because highlightRange may modify the DOM (splitting text nodes)
  // which can invalidate the original range.
  pendingHighlightElements = [];
  try {
    const highlightClone = range.cloneRange();
    pendingHighlightElements = highlightRange(highlightClone, 'scholic-annotation-pending');
  } catch (e) {
    console.warn('[Scholic] Could not render pending highlight:', e);
  }

  // Clear the text selection
  window.getSelection()?.removeAllRanges();

  // Open sidebar with the form pre-filled
  sidebar.openWithQuote(quoteText, selectors);
  console.log('[Scholic] Sidebar opened.');
}

/**
 * Handle "Highlight" button click from the popover.
 *
 * Creates a private, page-only highlight. This intentionally does not create
 * an annotation, feed event, profile item, comment thread, or collection entry.
 */
async function handleHighlight(range: Range, quoteText: string): Promise<void> {
  // Generate selectors before any DOM modifications
  const selectors = describe(document.body, range);

  // Render the highlight immediately with private styling.
  // Clone the range because highlightRange may split text nodes.
  pendingHighlightElements = [];
  try {
    const highlightClone = range.cloneRange();
    pendingHighlightElements = highlightRange(highlightClone, 'scholic-private');
  } catch (e) {
    console.warn('[Scholic] Could not render highlight:', e);
  }

  // Clear the text selection
  window.getSelection()?.removeAllRanges();

  const tempElements = pendingHighlightElements;
  pendingHighlightElements = [];

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'CREATE_HIGHLIGHT',
      data: {
        url: currentAnnotationUrl(),
        quoteText,
        selectors,
        highlightColor: '#A8D5B5',
        type: 'text',
      },
    });
    if (response?.error) throw new Error(response.error);
    const savedHighlight = response?.highlight as HighlightData | undefined;
    if (!savedHighlight?.id) throw new Error('Highlight was not returned');

    pageHighlights.unshift(savedHighlight);
    const highlightId = String(savedHighlight.id);
    applyHighlightColor(tempElements, savedHighlight.highlightColor || '#A8D5B5');
    tempElements.forEach((el) => {
      el.className = 'scholic-highlight scholic-private';
      (el as any)._scholicHighlightId = highlightId;
      delete (el as any)._scholicAnnotationId;
      el.dataset.highlightId = highlightId;
      el.dataset.annotationId = quickHighlightDomId(highlightId);
      el.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        showQuickHighlightMenu(highlightId, el);
      });
    });
    quickHighlightMap.set(highlightId, tempElements);
  } catch (err) {
    console.error('[Scholic] Failed to save highlight:', err);
    removeHighlights(tempElements);
  }
}

async function handleUpdateQuickHighlightColor(highlightId: string, color: string): Promise<void> {
  const elements = quickHighlightMap.get(highlightId);
  const highlight = pageHighlights.find((h) => String(h.id) === String(highlightId));
  const previousColor = highlight?.highlightColor || '#A8D5B5';
  if (elements) applyHighlightColor(elements, color);
  if (highlight) highlight.highlightColor = color;

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'UPDATE_HIGHLIGHT',
      data: { id: highlightId, highlightColor: color },
    });
    if (response?.error) throw new Error(response.error);
    if (response?.highlight && highlight) {
      highlight.highlightColor = response.highlight.highlightColor || color;
      if (elements) applyHighlightColor(elements, highlight.highlightColor);
    }
  } catch (err) {
    console.error('[Scholic] Failed to update highlight color:', err);
    if (highlight) highlight.highlightColor = previousColor;
    if (elements) applyHighlightColor(elements, previousColor);
  }
}

async function handleDeleteQuickHighlight(highlightId: string): Promise<void> {
  const backup = pageHighlights.find((h) => String(h.id) === String(highlightId));
  const elements = quickHighlightMap.get(highlightId);
  if (elements) removeHighlights(elements);
  quickHighlightMap.delete(highlightId);
  pageHighlights = pageHighlights.filter((h) => String(h.id) !== String(highlightId));

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'DELETE_HIGHLIGHT',
      data: { id: highlightId },
    });
    if (response?.error) throw new Error(response.error);
  } catch (err) {
    console.error('[Scholic] Failed to delete highlight:', err);
    if (backup) {
      pageHighlights.unshift(backup);
      await resolveAndRenderHighlights([backup]);
    }
  }
}

/**
 * Save an annotation to the backend via the background script.
 *
 * After saving, re-render the annotation list in the sidebar.
 */
async function handleSaveAnnotation(annotation: AnnotationData): Promise<void> {
  console.log('[Scholic] Saving annotation...', annotation);

  // Optimistic: immediately show a pending card in the sidebar
  const tempId = `__temp_${Date.now()}`;
  const tempAnnotation: AnnotationData = {
    ...annotation,
    id: tempId,
    createdAt: new Date().toISOString(),
    _isPending: true,
  };
  pageAnnotations.unshift(tempAnnotation);
  const hasMore = annotationsOffset < annotationsTotal;
  await sidebar.renderAnnotationList(pageAnnotations, hasMore);

  try {
    // Send to background script, which forwards to the backend API
    const response = await chrome.runtime.sendMessage({
      type: 'CREATE_ANNOTATION',
      data: annotation,
    });
    console.log('[Scholic] Save response:', response);

    if (response?.annotation) {
      // Replace temp with the real annotation
      pageAnnotations = pageAnnotations.map((a) =>
        String(a.id) === tempId ? response.annotation : a
      );
      annotationsTotal = Math.max(annotationsTotal, pageAnnotations.filter(a => !a._isPending).length);
      annotationsOffset = pageAnnotations.length;
      await sidebar.renderAnnotationList(pageAnnotations, annotationsOffset < annotationsTotal);

      const savedAnnotation = response.annotation;
      const annotationId = String(savedAnnotation.id);
      const cssClass = savedAnnotation.isPrivate ? 'scholic-private' : 'scholic-annotation';

      if (pendingHighlightElements.length > 0) {
        // Upgrade existing highlight elements in-place with the real annotation ID
        // and correct CSS class. This avoids re-anchoring which can fail when
        // the DOM was already modified by the initial highlight.
        applyHighlightColor(pendingHighlightElements, savedAnnotation.highlightColor || '#A8D5B5');
        pendingHighlightElements.forEach((el) => {
          el.className = `scholic-highlight ${cssClass}`;
          (el as any)._scholicAnnotationId = annotationId;
          el.dataset.annotationId = annotationId;

          // Attach hover listeners for the popup
          el.addEventListener('mouseenter', () => {
            highlightPopup.show(annotationId, el);
          });
          el.addEventListener('mouseleave', () => {
            highlightPopup.scheduleHide();
          });
        });
        highlightMap.set(String(annotationId), pendingHighlightElements);
        pendingHighlightElements = [];
      } else {
        // Fallback: no pending elements (e.g. sidebar-only creation)
        removePendingHighlights();
        await resolveAndRenderAnnotations([savedAnnotation]);
      }

      updateBadgeCount();
    } else {
      // Save failed — remove temp annotation
      pageAnnotations = pageAnnotations.filter((a) => String(a.id) !== tempId);
      await sidebar.renderAnnotationList(pageAnnotations, annotationsOffset < annotationsTotal);
    }
  } catch (err) {
    console.error('[Scholic] Failed to save annotation:', err);
    // Rollback optimistic add
    pageAnnotations = pageAnnotations.filter((a) => String(a.id) !== tempId);
    await sidebar.renderAnnotationList(pageAnnotations, annotationsOffset < annotationsTotal);
  }
}

/**
 * Delete an annotation.
 */
async function handleDeleteAnnotation(annotationId: string): Promise<void> {
  // Optimistic: remove immediately from UI
  const backup = pageAnnotations.find((a) => String(a.id) === String(annotationId));
  pageAnnotations = pageAnnotations.filter((a) => String(a.id) !== String(annotationId));
  annotationsTotal = Math.max(0, annotationsTotal - 1);
  annotationsOffset = Math.max(0, annotationsOffset - 1);

  const backupHighlights = highlightMap.get(annotationId);
  suppressSync = true;
  if (backupHighlights) {
    removeHighlights(backupHighlights);
    highlightMap.delete(annotationId);
  }
  suppressSync = false;

  await sidebar.renderAnnotationList(pageAnnotations, annotationsOffset < annotationsTotal);
  updateBadgeCount();

  try {
    await chrome.runtime.sendMessage({
      type: 'DELETE_ANNOTATION',
      data: { id: annotationId },
    });
  } catch (err) {
    console.error('[Scholic] Failed to delete annotation:', err);
    // Rollback: restore the annotation and reload highlights
    if (backup) {
      pageAnnotations.push(backup);
      pageAnnotations.sort((a, b) =>
        new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );
      annotationsTotal += 1;
      annotationsOffset += 1;
      await sidebar.renderAnnotationList(pageAnnotations, annotationsOffset < annotationsTotal);
      // Re-anchor the restored annotation
      await resolveAndRenderAnnotations([backup]);
      updateBadgeCount();
    }
  }
}

/**
 * Toggle a reaction on an annotation. Drives optimistic UI for both the
 * sidebar list and any open highlight popup, then reconciles with the
 * server response (or rolls back on error).
 */
async function handleReact(annotationId: string | number, emoji: string): Promise<void> {
  const target = pageAnnotations.find((a) => String(a.id) === String(annotationId));
  if (!target) return;

  const prevCounts = { ...(target.reactionCounts || {}) };
  const prevMine = target.myReaction || '';

  // Optimistic update
  const next = { ...prevCounts };
  if (prevMine && prevMine !== emoji) {
    next[prevMine] = Math.max(0, (next[prevMine] || 1) - 1);
    if (next[prevMine] === 0) delete next[prevMine];
  }
  if (prevMine === emoji) {
    next[emoji] = Math.max(0, (next[emoji] || 1) - 1);
    if (next[emoji] === 0) delete next[emoji];
    target.myReaction = '';
  } else {
    next[emoji] = (next[emoji] || 0) + 1;
    target.myReaction = emoji;
  }
  target.reactionCounts = next;

  // Refresh both surfaces immediately
  sidebar.renderAnnotationList(pageAnnotations, annotationsOffset < annotationsTotal);
  highlightPopup.updateReactions();

  try {
    const res: any = await chrome.runtime.sendMessage({
      type: 'TOGGLE_REACTION',
      data: { annotationId, emoji },
    });
    if (res && !res.error) {
      target.reactionCounts = res.counts || {};
      target.myReaction = res.mine || '';
    } else {
      target.reactionCounts = prevCounts;
      target.myReaction = prevMine;
    }
  } catch {
    target.reactionCounts = prevCounts;
    target.myReaction = prevMine;
  }

  sidebar.renderAnnotationList(pageAnnotations, annotationsOffset < annotationsTotal);
  highlightPopup.updateReactions();
}

/**
 * Add a comment to an annotation.
 */
async function handleComment(annotationId: string, text: string): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'CREATE_COMMENT',
      data: { annotationId, text },
    });
    if (response?.comment) {
      // Update local state
      pageAnnotations = pageAnnotations.map((a) => {
        if (String(a.id) === String(annotationId)) {
          return {
            ...a,
            comments: a.comments ? [...a.comments, response.comment] : [response.comment],
          };
        }
        return a;
      });
      // Re-render sidebar to reflect the new comment
      await sidebar.renderAnnotationList(pageAnnotations, annotationsOffset < annotationsTotal);
      
      // Refresh popup if it's currently open
      highlightPopup.refresh();
    }
  } catch (err) {
    console.error('[Scholic] Failed to post comment:', err);
  }
}

/**
 * Focus a highlight in the page — scrolls it into view and briefly pulses it.
 * Uses highlightMap for reliable lookup instead of DOM querying.
 */
function handleFocusAnnotation(annotationId: string): void {
  // First try our tracked highlights (most reliable)
  let highlights = highlightMap.get(annotationId) || [];
  
  // Fallback to DOM query if not in map
  if (highlights.length === 0) {
    highlights = getHighlightsForAnnotation(annotationId) as HTMLElement[];
  }

  if (highlights.length > 0) {
    highlights[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Add a brief pulse animation
    highlights.forEach((h) => {
      h.classList.add('scholic-highlight-focused');
      setTimeout(() => h.classList.remove('scholic-highlight-focused'), 1500);
    });
  }
}

/**
 * Handle tab change from the sidebar.
 */
function handleTabChange(tab: 'mine' | 'community' | 'all'): void {
  currentActiveTab = tab;
  filterHighlights();
}

/**
 * Filter on-page highlights based on the active tab.
 */
async function filterHighlights(): Promise<void> {
  const result = await chrome.storage.local.get('scholicToken');
  const token = result.scholicToken;
  
  // If Guest, we show everything in 'all' tab (since other tabs are hidden anyway)
  if (!token) {
    for (const annotation of pageAnnotations) {
      const highlights = highlightMap.get(String(annotation.id));
      if (highlights) {
        highlights.forEach(h => h.classList.remove('scholic-hidden'));
      }
    }
    return;
  }

  const meResponse = await chrome.runtime.sendMessage({ type: 'FETCH_ME' });
  const myUserId = meResponse?.id;

  if (myUserId === undefined) return;

  for (const annotation of pageAnnotations) {
    const highlights = highlightMap.get(String(annotation.id));
    if (!highlights) continue;

    const isMine = String(annotation.userId) === String(myUserId);
    let shouldShow = false;
    if (currentActiveTab === 'all') {
      shouldShow = true;
    } else if (currentActiveTab === 'mine') {
      shouldShow = isMine;
    } else if (currentActiveTab === 'community') {
      shouldShow = !isMine;
    }

    highlights.forEach((h) => {
      if (shouldShow) {
        h.classList.remove('scholic-hidden');
      } else {
        h.classList.add('scholic-hidden');
      }
    });
  }
}

/**
 * Listen for storage changes (login/logout sync) to refresh state.
 * Stored as a named function so it can be removed if needed.
 */
function onStorageChanged(changes: { [key: string]: chrome.storage.StorageChange }, area: string) {
  if (area === 'local' && changes.scholicToken) {
    if (changes.scholicToken.newValue) {
      console.log('[Scholic] Token detected, refreshing page state...');
      loadAnnotations();
    } else {
      console.log('[Scholic] Token removed, clearing state...');
      clearStateAndHighlights();
      sidebar.renderAnnotationList([], false);
    }
  }
}
chrome.storage.onChanged.addListener(onStorageChanged);

/**
 * Clear all current highlights and local state.
 */
function clearStateAndHighlights(): void {
  suppressSync = true;
  for (const highlights of highlightMap.values()) {
    removeHighlights(highlights);
  }
  for (const highlights of quickHighlightMap.values()) {
    removeHighlights(highlights);
  }
  highlightMap.clear();
  quickHighlightMap.clear();
  hideHighlightMenu();
  pageAnnotations = [];
  pageHighlights = [];
  annotationsTotal = 0;
  annotationsOffset = 0;
  suppressSync = false;
  updateBadgeCount();
}

// ─────────────────────────────────────────────────────────────────────────────
// Page Load: Fetch and Restore Annotations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * On page load (or after login), fetch all annotations for the current URL.
 */
async function loadAnnotations(): Promise<void> {
  try {
    // Clear existing state for clean re-fetch
    clearStateAndHighlights();
    annotationsOffset = 0;
    annotationsTotal = 0;

    const response = await chrome.runtime.sendMessage({
      type: 'FETCH_ANNOTATIONS',
      data: { url: currentAnnotationUrl(), limit: ANNOTATIONS_PAGE_SIZE, offset: 0 },
    });

    if (response?.annotations && Array.isArray(response.annotations)) {
      pageAnnotations = response.annotations;
      annotationsTotal = response.total ?? pageAnnotations.length;
      annotationsOffset = pageAnnotations.length;

      const hasMore = annotationsOffset < annotationsTotal;
      await sidebar.renderAnnotationList(pageAnnotations, hasMore);

      // Resolve all annotations against the clean DOM, then render highlights.
      // This two-phase approach prevents highlight insertion from corrupting
      // the DOM for subsequent annotations.
      await resolveAndRenderAnnotations(pageAnnotations);

      // Ensure initial highlights match the default tab
      await filterHighlights();
      await loadQuickHighlights();

      updateBadgeCount();
    } else {
      // Still render empty list if no annotations found (to show 'No annotations' vs 'Sign in')
      await sidebar.renderAnnotationList([]);
      await loadQuickHighlights();
      updateBadgeCount();
    }
  } catch (err) {
    console.error('[Scholic] Failed to load annotations:', err);
  }
}

async function loadQuickHighlights(): Promise<void> {
  try {
    const auth = await chrome.storage.local.get('scholicToken');
    if (!auth.scholicToken) return;
    const response = await chrome.runtime.sendMessage({
      type: 'FETCH_HIGHLIGHTS',
      data: { url: currentAnnotationUrl(), limit: 200, offset: 0 },
    });
    if (response?.error) throw new Error(response.error);
    if (response?.highlights && Array.isArray(response.highlights)) {
      pageHighlights = response.highlights;
      await resolveAndRenderHighlights(pageHighlights);
    }
  } catch (err) {
    console.error('[Scholic] Failed to load quick highlights:', err);
  }
}

/**
 * Load the next page of annotations and append to the current list.
 */
async function loadMoreAnnotations(): Promise<void> {
  if (annotationsOffset >= annotationsTotal) return;

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'FETCH_ANNOTATIONS',
      data: { url: currentAnnotationUrl(), limit: ANNOTATIONS_PAGE_SIZE, offset: annotationsOffset },
    });

    if (response?.annotations && Array.isArray(response.annotations)) {
      const newAnnotations = response.annotations;
      pageAnnotations = [...pageAnnotations, ...newAnnotations];
      annotationsTotal = response.total ?? annotationsTotal;
      annotationsOffset = pageAnnotations.length;

      const hasMore = annotationsOffset < annotationsTotal;
      await sidebar.renderAnnotationList(pageAnnotations, hasMore);
      await resolveAndRenderAnnotations(newAnnotations);
      await filterHighlights();
      updateBadgeCount();
    }
  } catch (err) {
    console.error('[Scholic] Failed to load more annotations:', err);
  }
}

/**
 * Anchor and highlight a list of annotations. Simple one-at-a-time approach.
 * Returns the number successfully anchored.
 */
async function resolveAndRenderAnnotations(annotations: AnnotationData[]): Promise<number> {
  let count = 0;
  suppressSync = true;

  for (const annotation of annotations) {
    if (!annotation.selectors || !annotation.id) continue;
    if (annotation.type === 'image') continue;

    const annotationId = String(annotation.id);

    try {
      const range = await anchor(document.body, annotation.selectors);
      console.log(`[Scholic] Anchored ${annotationId}: "${range.toString().slice(0, 50)}..."`);

      const cssClass = annotation.isPrivate ? 'scholic-private' : 'scholic-annotation';
      const highlights = highlightRange(range, cssClass, annotationId);

      if (highlights.length === 0) {
        console.warn(`[Scholic] Anchored ${annotationId} but highlightRange returned 0 elements`);
        continue;
      }

      const defaultColor = annotation.isPrivate ? '#E8C547' : '#A8D5B5';
      applyHighlightColor(highlights, (annotation as any).highlightColor || defaultColor);

      highlightMap.set(annotationId, highlights);
      highlights.forEach((el) => {
        el.addEventListener('mouseenter', () => {
          highlightPopup.show(annotationId, el);
        });
        el.addEventListener('mouseleave', () => {
          highlightPopup.scheduleHide();
        });
      });
      count++;
    } catch (err) {
      console.warn(`[Scholic] Failed to anchor ${annotationId}:`, err);
    }
  }

  suppressSync = false;
  return count;
}

async function resolveAndRenderHighlights(highlightsToRender: HighlightData[]): Promise<number> {
  let count = 0;
  suppressSync = true;

  for (const highlight of highlightsToRender) {
    if (!highlight.selectors || !highlight.id) continue;
    const highlightId = String(highlight.id);

    try {
      const range = await anchor(document.body, highlight.selectors);
      const elements = highlightRange(range, 'scholic-private', quickHighlightDomId(highlightId));
      if (elements.length === 0) continue;

      applyHighlightColor(elements, highlight.highlightColor || '#A8D5B5');
      quickHighlightMap.set(highlightId, elements);
      elements.forEach((el) => {
        (el as any)._scholicHighlightId = highlightId;
        el.dataset.highlightId = highlightId;
        el.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          showQuickHighlightMenu(highlightId, el);
        });
      });
      count++;
    } catch (err) {
      console.warn(`[Scholic] Failed to anchor quick highlight ${highlightId}:`, err);
    }
  }

  suppressSync = false;
  return count;
}

/**
 * Remove any "pending" highlights (created during the annotation flow
 * before the annotation is saved).
 */
function removePendingHighlights(): void {
  const pending = document.querySelectorAll(
    'scholic-highlight.scholic-annotation-pending',
  );
  const parentsToNormalize = new Set<Node>();
  pending.forEach((el) => {
    const parent = el.parentNode;
    if (parent) {
      const children = Array.from(el.childNodes);
      children.forEach((child) => parent.insertBefore(child, el));
      parent.removeChild(el);
      parentsToNormalize.add(parent);
    }
  });
  // Batch normalize — only once per unique parent instead of per element
  parentsToNormalize.forEach((parent) => parent.normalize());
}

/**
 * User dismissed the annotation form (Cancel / Esc) without saving.
 * Strip the optimistic highlight so the page returns to its pre-Annotate state.
 */
function discardPendingAnnotation(): void {
  if (pendingHighlightElements.length === 0) {
    // Form may have been opened without an optimistic highlight — still clean up
    // any orphaned pending elements left in the DOM just in case.
    removePendingHighlights();
    return;
  }
  suppressSync = true;
  removeHighlights(pendingHighlightElements);
  suppressSync = false;
  pendingHighlightElements = [];
}

// ─────────────────────────────────────────────────────────────────────────────
// SPA URL change monitoring
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SPA navigations (history.pushState / replaceState / popstate) keep the same
 * content-script context, so bootstrap() never re-fires. Without this hook, a
 * user navigating from an allowed URL into a blocked one keeps the sidebar
 * visible until they reload.
 *
 * On any URL change, re-run the bootstrap-relevant logic so the sidebar +
 * annotation list always matches the current page.
 */
let lastUrl = window.location.href;

function handleUrlChange(): void {
  const currentUrl = window.location.href;
  if (currentUrl === lastUrl) return;
  lastUrl = currentUrl;
  console.log(`[Scholic] URL changed → ${currentUrl}`);
  sidebar.refreshForPageChange();
  // bootstrap() handles both blocked and unblocked transitions, including
  // re-fetching annotations and updating the icon.
  bootstrap();
}

function installUrlChangeWatchers(): void {
  window.addEventListener('popstate', handleUrlChange);
  window.addEventListener('hashchange', handleUrlChange);

  const origPushState = history.pushState;
  history.pushState = function (...args: Parameters<typeof history.pushState>) {
    const ret = origPushState.apply(this, args);
    handleUrlChange();
    return ret;
  };
  const origReplaceState = history.replaceState;
  history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
    const ret = origReplaceState.apply(this, args);
    handleUrlChange();
    return ret;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Boot
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initialize Scholic on page load.
 * Wait for the DOM to be ready, then fetch and restore annotations.
 */
if (!IS_IFRAME) {
  installUrlChangeWatchers();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => bootstrap());
  } else {
    bootstrap();
  }
  console.log('[Scholic] Content script loaded.');
}
