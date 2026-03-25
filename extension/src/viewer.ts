/**
 * viewer.ts — Custom PDF viewer for Scholic annotations.
 * 
 * Uses pdf.js to render PDF documents and provides a text layer
 * for standard text selection and highlighting.
 */

import * as pdfjsLib from 'pdfjs-dist';
import { EventBus, PDFViewer, PDFLinkService } from 'pdfjs-dist/web/pdf_viewer.mjs';
import { Sidebar } from './sidebar';
import { anchor, describe } from './anchoring/index';
import { highlightRange, removeHighlights } from './highlighter';
import { SelectionPopover } from './popover';
import { HighlightPopup } from './highlight-popup';

// Load the worker from the local extension package
(pdfjsLib as any).GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.min.mjs');

class ScholicPdfViewer {
  private sidebar: Sidebar;
  private pdfUrl: string = '';
  private pdfHash: string = '';
  private annotations: any[] = [];
  
  private eventBus: EventBus;
  private pdfViewer: PDFViewer;
  private pdfLinkService: PDFLinkService;
  
  private popover: SelectionPopover;
  private highlightPopup: HighlightPopup;
  private pendingSelectors: any[] | null = null;
  private pendingHighlightElements: any[] = [];

  constructor() {
    this.sidebar = new Sidebar({
      onSave: (a) => this.handleSave(a),
      onDelete: (id) => this.handleDelete(id),
      onFocusAnnotation: (id) => this.handleFocus(id),
      onComment: (id, text) => this.handleComment(id, text),
      onRefresh: () => this.loadAnnotations(),
      onTabChange: () => {},
    });

    this.popover = new SelectionPopover({
      onAnnotate: (range, quoteText) => {
        this.popover.hide();
        this.pendingSelectors = describe(document.getElementById('viewer')!, range);
        
        // Optimistic visual selection
        if (this.pendingHighlightElements.length > 0) {
          removeHighlights(this.pendingHighlightElements);
        }
        const tempId = `temp-${Date.now()}`;
        this.pendingHighlightElements = highlightRange(range, 'scholic-highlight', tempId);
        window.getSelection()?.removeAllRanges();

        this.sidebar.openWithQuote(quoteText, this.pendingSelectors);
      },
      onHighlight: async (range, quoteText) => {
        this.popover.hide();
        this.pendingSelectors = describe(document.getElementById('viewer')!, range);
        
        // Optimistic visual selection
        const tempId = `temp-${Date.now()}`;
        highlightRange(range, 'scholic-highlight', tempId);
        
        // Save direct private highlight
        const response = await chrome.runtime.sendMessage({
          type: 'CREATE_ANNOTATION',
          data: {
            url: this.pdfUrl,
            pdfHash: this.pdfHash,
            type: 'pdf',
            quoteText,
            text: '', // Empty text implies pure highlight
            selectors: this.pendingSelectors,
            isPrivate: true,
          }
        });
        
        if (response?.annotation) {
          this.loadAnnotations(); // Re-render correct IDs and colors
        }
      },
    });

    this.highlightPopup = new HighlightPopup(
      (id: string) => this.annotations.find(a => a.id === id),
      (id: string, text: string) => this.handleComment(id, text)
    );

    // Initialize official PDF.js viewer components
    const container = document.getElementById('viewer-container') as HTMLDivElement;
    this.eventBus = new EventBus();
    this.pdfLinkService = new PDFLinkService({ eventBus: this.eventBus });
    
    this.pdfViewer = new PDFViewer({
      container,
      eventBus: this.eventBus,
      linkService: this.pdfLinkService,
      removePageBorders: true,
    });
    this.pdfLinkService.setViewer(this.pdfViewer);

    this.init();
    this.setupListeners();
  }

  async init() {
    const params = new URLSearchParams(window.location.search);
    const url = params.get('url');
    if (!url) {
      document.getElementById('viewer-container')!.innerHTML = '<div style="padding: 20px; color: red;">No PDF URL provided.</div>';
      return;
    }
    this.pdfUrl = url;
    document.title = `Scholic - ${url.substring(url.lastIndexOf('/') + 1)}`;

    try {
      const pdfDoc = await pdfjsLib.getDocument(url).promise;
      this.pdfHash = btoa(url).substring(0, 16); // Placeholder fingerprint
      
      this.pdfViewer.setDocument(pdfDoc);
      this.pdfLinkService.setDocument(pdfDoc, null);
      
      this.loadAnnotations();
      this.sidebar.showPeek();
      
      // Update toolbar page count
      const pageCountEl = document.getElementById('page-count');
      if (pageCountEl) pageCountEl.textContent = `Pages: ${pdfDoc.numPages}`;
      
    } catch (err) {
      console.error('[Scholic] Failed to load PDF:', err);
      document.getElementById('viewer-container')!.innerHTML = `<div style="padding: 20px; color: red;">Failed to load PDF: ${err}</div>`;
    }
  }

  private setupListeners() {
    // Re-anchor highlights whenever pages are rendered (virtualization)
    this.eventBus.on('textlayerrendered', (e: any) => {
      this.restoreHighlightsForPage(e.pageNumber);
    });

    // Handle mousedown to hide popovers
    document.addEventListener('mousedown', (e) => {
      const target = e.target as HTMLElement;
      if (!target.closest('scholic-popover-host') && !target.closest('scholic-sidebar-host')) {
        this.popover.hide();
      }
    });

    // Handle text selection
    document.addEventListener('mouseup', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('scholic-popover-host') || target.closest('scholic-sidebar-host')) {
        return;
      }

      setTimeout(() => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || !selection.toString().trim()) {
          this.popover.hide();
          return;
        }

        const range = selection.getRangeAt(0);
        // Ensure selection is inside the viewer
        if (!document.getElementById('viewer')?.contains(range.startContainer)) {
          this.popover.hide();
          return;
        }

        try {
          this.popover.show(range);
        } catch {
          this.popover.hide();
        }
      }, 10);
    });

    // Toolbar buttons
    document.getElementById('zoom-in')?.addEventListener('click', () => {
      this.pdfViewer.currentScaleValue = (this.pdfViewer.currentScale * 1.2).toString();
      this.updateZoomLabel();
    });
    
    document.getElementById('zoom-out')?.addEventListener('click', () => {
      this.pdfViewer.currentScaleValue = (this.pdfViewer.currentScale / 1.2).toString();
      this.updateZoomLabel();
    });
  }

  private updateZoomLabel() {
    const el = document.getElementById('zoom-level');
    if (el) el.textContent = `${Math.round(this.pdfViewer.currentScale * 100)}%`;
  }

  async loadAnnotations() {
    const response = await chrome.runtime.sendMessage({
      type: 'FETCH_ANNOTATIONS',
      data: { url: this.pdfUrl }
    });

    if (response?.annotations) {
      this.annotations = response.annotations;
      this.sidebar.renderAnnotationList(this.annotations);
      // Re-render currently visible pages
      this.pdfViewer.update();
    }
  }

  private bindPopupEvents(annotationId: string) {
    const hlElements = document.querySelectorAll(`.scholic-highlight[data-annotation-id="${annotationId}"]`);
    hlElements.forEach((el) => {
      el.addEventListener('mouseenter', () => {
        this.highlightPopup.show(annotationId, el as HTMLElement);
      });
      el.addEventListener('mouseleave', () => {
        this.highlightPopup.scheduleHide();
      });
    });
  }

  private async restoreHighlightsForPage(pageNum: number) {
    const pageView = this.pdfViewer.getPageView(pageNum - 1);
    if (!pageView || !pageView.div) return;

    // PREVENT OPACITY STACKING: 
    // pdf.js caches and re-uses text layer elements when zooming. 
    // If we don't unwrap existing highlights first, we'll wrap them again,
    // multiplying the background opacity until the text is blacked out.
    const existingHighlights = Array.from(pageView.div.querySelectorAll('scholic-highlight')) as any[];
    if (existingHighlights.length > 0) {
      removeHighlights(existingHighlights);
    }

    for (const ann of this.annotations) {
      try {
        const range = await anchor(document.getElementById('viewer')!, ann.selectors);
        highlightRange(range, 'scholic-highlight', ann.id);
        this.bindPopupEvents(ann.id);
      } catch (e) {
        // Normal during scrolling due to virtualization
      }
    }
  }

  async handleSave(annotation: any) {
    // Override the sidebar's default window.location.href with the actual PDF URL
    annotation.url = this.pdfUrl;
    annotation.type = 'pdf';
    annotation.pdfHash = this.pdfHash;
    
    const response = await chrome.runtime.sendMessage({
      type: 'CREATE_ANNOTATION',
      data: annotation
    });
    
    if (response?.annotation) {
      // Clear optimistic highlights 
      if (this.pendingHighlightElements.length > 0) {
        removeHighlights(this.pendingHighlightElements);
        this.pendingHighlightElements = [];
      }

      this.annotations.push(response.annotation);
      this.sidebar.renderAnnotationList(this.annotations);
      
      // Render definitive highlight immediately
      try {
        const range = await anchor(document.getElementById('viewer')!, response.annotation.selectors);
        highlightRange(range, 'scholic-highlight', response.annotation.id);
        this.bindPopupEvents(response.annotation.id);
      } catch (e) { }

      // Let PDF viewer update queue handle any remaining re-renders
      setTimeout(() => this.pdfViewer.update(), 100);
    }
  }

  async handleDelete(id: string) {
    await chrome.runtime.sendMessage({ type: 'DELETE_ANNOTATION', data: { id } });
    this.annotations = this.annotations.filter(a => a.id !== id);
    this.sidebar.renderAnnotationList(this.annotations);
    
    // Remove highlights from DOM
    document.querySelectorAll(`.scholic-highlight[data-annotation-id="${id}"]`).forEach(el => {
      const parent = el.parentNode;
      if (parent) {
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
      }
    });
  }

  handleFocus(id: string) {
    const el = document.querySelector(`[data-annotation-id="${id}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async handleComment(id: string, text: string) {
    const response = await chrome.runtime.sendMessage({
      type: 'CREATE_COMMENT', // Actually this goes through a comment endpoint normally, wait
      // but in the sidebar handleComment was empty earlier. 
      // I'll wire it up using the background.ts handleMessage.
      data: { annotationId: id, text }
    });
    if (response?.comment) {
      this.loadAnnotations(); // Refresh to get the new comment
    }
  }
}

new ScholicPdfViewer();
