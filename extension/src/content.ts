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
import type { Selector } from './anchoring/types';
import { highlightRange, removeHighlights, getHighlightsForAnnotation } from './highlighter';
import { SelectionPopover } from './popover';
import { Sidebar } from './sidebar';
import type { AnnotationData } from './sidebar';
import { HighlightPopup } from './highlight-popup';
import { Snipper, Area } from './snipper';

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

// ─────────────────────────────────────────────────────────────────────────────
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
});

/**
 * The highlight popup — appears when hovering over a highlight element.
 */
const highlightPopup = new HighlightPopup(
  (id: string) => {
    return pageAnnotations.find((a) => a.id === id);
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
  } else {
    sidebar.hideCompletely();
    clearStateAndHighlights();
    removeListeners();
  }
}

/**
 * Global event listeners (selection) that should only run when enabled.
 */
function setupListeners(): void {
  document.addEventListener('mouseup', handleMouseUp);
  document.addEventListener('mousedown', handleMouseDown);
}

function removeListeners(): void {
  document.removeEventListener('mouseup', handleMouseUp);
  document.removeEventListener('mousedown', handleMouseDown);
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
    } else {
      sidebar.hideCompletely();
      clearStateAndHighlights();
      removeListeners();
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
  try {
    // Send to background script, which forwards to the backend API
    const response = await chrome.runtime.sendMessage({
      type: 'CREATE_ANNOTATION',
      data: annotation,
    });
    console.log('[Scholic] Save response:', response);

    if (response?.annotation) {
      // Add to local state at the beginning (optimistic update to top)
      pageAnnotations.unshift(response.annotation);
      await sidebar.renderAnnotationList(pageAnnotations);

      const savedAnnotation = response.annotation;
      const annotationId = String(savedAnnotation.id);
      const cssClass = savedAnnotation.isPrivate ? 'scholic-private' : 'scholic-annotation';

      if (pendingHighlightElements.length > 0) {
        // Upgrade existing highlight elements in-place with the real annotation ID
        // and correct CSS class. This avoids re-anchoring which can fail when
        // the DOM was already modified by the initial highlight.
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
        await anchorAndHighlight(savedAnnotation);
      }
    }
  } catch (err) {
    console.error('[Scholic] Failed to save annotation:', err);
  }
}

/**
 * Delete an annotation.
 */
async function handleDeleteAnnotation(annotationId: string): Promise<void> {
  try {
    await chrome.runtime.sendMessage({
      type: 'DELETE_ANNOTATION',
      data: { id: annotationId },
    });

    // Remove from local state
    pageAnnotations = pageAnnotations.filter((a) => a.id !== annotationId);
    await sidebar.renderAnnotationList(pageAnnotations);

    // Remove highlights from the DOM
    const highlights = highlightMap.get(annotationId);
    if (highlights) {
      removeHighlights(highlights as any);
      highlightMap.delete(annotationId);
    }
  } catch (err) {
    console.error('[Scholic] Failed to delete annotation:', err);
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
      await sidebar.renderAnnotationList(pageAnnotations);
      
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
 */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.scholicToken) {
    if (changes.scholicToken.newValue) {
      console.log('[Scholic] Token detected, refreshing page state...');
      loadAnnotations();
    } else {
      console.log('[Scholic] Token removed, clearing state...');
      clearStateAndHighlights();
      sidebar.renderAnnotationList([]);
    }
  }
});

/**
 * Clear all current highlights and local state.
 */
function clearStateAndHighlights(): void {
  for (const highlights of highlightMap.values()) {
    removeHighlights(highlights as any);
  }
  highlightMap.clear();
  pageAnnotations = [];
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

    const response = await chrome.runtime.sendMessage({
      type: 'FETCH_ANNOTATIONS',
      data: { url: window.location.href },
    });

    if (response?.annotations && Array.isArray(response.annotations)) {
      pageAnnotations = response.annotations;
      await sidebar.renderAnnotationList(pageAnnotations);

      // Re-anchor each annotation
      for (const annotation of pageAnnotations) {
        await anchorAndHighlight(annotation);
      }
      
      // Ensure initial highlights match the default tab
      await filterHighlights();
    } else {
      // Still render empty list if no annotations found (to show 'No annotations' vs 'Sign in')
      await sidebar.renderAnnotationList([]);
    }
  } catch (err) {
    console.error('[Scholic] Failed to load annotations:', err);
  }
}

/**
 * Re-anchor a single annotation and render its highlight.
 *
 * Uses the fallback chain: Range → Position → Quote.
 * If all selectors fail, the annotation is silently skipped (not deleted).
 */
async function anchorAndHighlight(annotation: AnnotationData): Promise<void> {
  if (!annotation.selectors || !annotation.id) return;
  // Skip image-based annotations (no on-page highighting for them)
  if (annotation.type === 'image') return;

  try {
    // Try to resolve the stored selectors back to a DOM Range
    const range = await anchor(document.body, annotation.selectors);

    // Determine CSS class based on annotation type
    const cssClass = annotation.isPrivate
      ? 'scholic-private'
      : 'scholic-annotation';

    // Render the highlight
    const highlights = highlightRange(range, cssClass, String(annotation.id));
    highlightMap.set(String(annotation.id), highlights);

    // Attach hover listeners directly to each highlight element.
    // Using mouseenter/mouseleave (not mouseover/mouseout) because they
    // don't fire for child text nodes — much more reliable for custom elements.
    const annotationId = annotation.id;
    highlights.forEach((el) => {
      el.addEventListener('mouseenter', () => {
        highlightPopup.show(annotationId, el);
      });
      el.addEventListener('mouseleave', () => {
        highlightPopup.scheduleHide();
      });
    });
  } catch {
    // Anchoring failed — the page content has changed too much.
    // Don't delete the annotation; it might re-anchor on a future visit.
    console.warn(`[Scholic] Could not anchor annotation ${annotation.id}`);
  }
}

/**
 * Remove any "pending" highlights (created during the annotation flow
 * before the annotation is saved).
 */
function removePendingHighlights(): void {
  const pending = document.querySelectorAll(
    'scholic-highlight.scholic-annotation-pending',
  );
  pending.forEach((el) => {
    const parent = el.parentNode;
    if (parent) {
      const children = Array.from(el.childNodes);
      children.forEach((child) => parent.insertBefore(child, el));
      parent.removeChild(el);
      parent.normalize();
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Boot
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initialize Scholic on page load.
 * Wait for the DOM to be ready, then fetch and restore annotations.
 */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => bootstrap());
} else {
  // DOM is already ready (script was loaded after DOMContentLoaded)
  bootstrap();
}

console.log('[Scholic] Content script loaded.');
