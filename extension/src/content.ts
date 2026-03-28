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
import { Sidebar } from './sidebar';
import type { AnnotationData } from './sidebar';
import { HighlightPopup } from './highlight-popup';
import { Snipper, Area } from './snipper';

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
});

/**
 * The highlight popup — appears when hovering over a highlight element.
 */
const highlightPopup = new HighlightPopup(
  (id: string) => {
    return pageAnnotations.find((a) => String(a.id) === id);
  },
  (id: string, text: string) => handleComment(id, text)
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
    !target.closest('scholic-sidebar-host')
  ) {
    popover.hide();
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
 * Creates a private (personal) highlight — no note, no public annotation.
 * Saved to the backend so it persists across page reloads.
 */
function handleHighlight(range: Range, quoteText: string): void {
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

  // Save to backend as a private highlight
  handleSaveAnnotation({
    url: window.location.href,
    quoteText,
    text: '',
    selectors,
    isPrivate: true,
  });
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
  highlightMap.clear();
  pageAnnotations = [];
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
      data: { url: window.location.href, limit: ANNOTATIONS_PAGE_SIZE, offset: 0 },
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

      updateBadgeCount();
    } else {
      // Still render empty list if no annotations found (to show 'No annotations' vs 'Sign in')
      await sidebar.renderAnnotationList([]);
      updateBadgeCount();
    }
  } catch (err) {
    console.error('[Scholic] Failed to load annotations:', err);
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
      data: { url: window.location.href, limit: ANNOTATIONS_PAGE_SIZE, offset: annotationsOffset },
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

// ─────────────────────────────────────────────────────────────────────────────
// Boot
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initialize Scholic on page load.
 * Wait for the DOM to be ready, then fetch and restore annotations.
 */
if (!IS_IFRAME) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => bootstrap());
  } else {
    bootstrap();
  }
  console.log('[Scholic] Content script loaded.');
}
