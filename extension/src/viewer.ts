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
import { Snipper, Area } from './snipper';

// Load the worker from the local extension package
(pdfjsLib as any).GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.min.mjs');

class ScholicPdfViewer {
  private sidebar: Sidebar;
  private pdfUrl: string = '';
  private pdfHash: string = '';
  private annotations: any[] = [];
  private myUserId: number | string | null = null;
  private currentTab: 'mine' | 'community' | 'all' = 'mine';
  
  private eventBus: EventBus;
  private pdfViewer: PDFViewer;
  private pdfLinkService: PDFLinkService;
  
  private popover: SelectionPopover;
  private highlightPopup: HighlightPopup;
  private snipper: Snipper;
  private pendingSelectors: any[] | null = null;
  private pendingHighlightElements: any[] = [];

  constructor() {
    this.sidebar = new Sidebar({
      onSave: (a) => this.handleSave(a),
      onDelete: (id) => this.handleDelete(id),
      onFocusAnnotation: (id) => this.handleFocus(id),
      onComment: (id, text) => this.handleComment(id, text),
      onRefresh: () => this.loadAnnotations(),
      onTabChange: (tab) => {
        this.currentTab = tab;
        this.filterHighlights();
      },
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
        if (this.pendingHighlightElements.length > 0) {
          removeHighlights(this.pendingHighlightElements);
        }
        const tempId = `temp-${Date.now()}`;
        this.pendingHighlightElements = highlightRange(range, 'scholic-highlight scholic-private', tempId);
        window.getSelection()?.removeAllRanges();
        
        // Save direct private highlight
        await this.handleSave({
          url: this.pdfUrl,
          pdfHash: this.pdfHash,
          type: 'pdf',
          quoteText,
          text: '', // Empty text implies pure highlight
          selectors: this.pendingSelectors,
          isPrivate: true,
        });
      },
    });

    this.highlightPopup = new HighlightPopup(
      (id: string) => this.annotations.find(a => a.id === id),
      (id: string, text: string) => this.handleComment(id, text)
    );

    this.snipper = new Snipper(
      (area) => this.handleAreaSelected(area),
      () => this.sidebar.open()
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
      const meResponse = await chrome.runtime.sendMessage({ type: 'FETCH_ME' });
      this.myUserId = meResponse?.id;

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

    // Snipping tool listener (triggered from Sidebar camera button)
    window.addEventListener('SCHOLIC_START_SCREENSHOT', () => {
      this.sidebar.hideCompletely();
      setTimeout(() => this.snipper.start(), 100);
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
      if (ann.type === 'image') continue;
      try {
        const range = await anchor(document.getElementById('viewer')!, ann.selectors);
        const cssClass = ann.isPrivate ? 'scholic-private' : 'scholic-annotation';
        const highlights = highlightRange(range, `scholic-highlight ${cssClass}`, ann.id);
        
        // Apply filtering class
        const isMine = String(ann.userId) === String(this.myUserId);
        let shouldHide = false;
        if (this.currentTab === 'mine') {
          shouldHide = !isMine;
        } else if (this.currentTab === 'community') {
          shouldHide = isMine;
        }

        highlights.forEach(h => {
          if (shouldHide) {
             h.classList.add('scholic-hidden');
          } else {
             h.classList.remove('scholic-hidden');
          }
        });

        this.bindPopupEvents(ann.id);
      } catch (e) {
        // Normal during scrolling due to virtualization
      }
    }
  }

  async handleSave(annotation: any) {
    // Override the sidebar's default window.location.href with the actual PDF URL
    annotation.url = this.pdfUrl;
    annotation.pdfHash = this.pdfHash;
    annotation.pdfPage = this.pdfViewer.currentPageNumber;
    
    // Preserve 'image' type for screenshots so sidebar renders them correctly
    if (annotation.type !== 'image') {
      annotation.type = 'pdf';
    }
    
    const response = await chrome.runtime.sendMessage({
      type: 'CREATE_ANNOTATION',
      data: annotation
    });
    
    if (response?.annotation) {
      const savedAnnotation = response.annotation;
      this.annotations.push(savedAnnotation);
      this.sidebar.renderAnnotationList(this.annotations);
      
      const annotationId = String(savedAnnotation.id);
      const cssClass = savedAnnotation.isPrivate ? 'scholic-private' : 'scholic-annotation';
      
      if (this.pendingHighlightElements.length > 0) {
        // Upgrade existing highlight elements in-place with the real annotation ID
        // and correct CSS class. This avoids re-anchoring which fails or causes blinking.
        this.pendingHighlightElements.forEach((el) => {
          el.className = `scholic-highlight ${cssClass}`; // Add correct main class
          (el as any)._scholicAnnotationId = annotationId;
          el.dataset.annotationId = annotationId;
        });
        
        this.bindPopupEvents(annotationId);
        this.pendingHighlightElements = [];
      } else {
        // Fallback: no pending elements. E.g screenshot or created somehow else.
        if (savedAnnotation.type !== 'image') {
          try {
            const range = await anchor(document.getElementById('viewer')!, savedAnnotation.selectors);
            highlightRange(range, `scholic-highlight ${cssClass}`, annotationId);
            this.bindPopupEvents(annotationId);
          } catch (e) { }
        }
      }
      
      this.filterHighlights();
    }
  }

  private filterHighlights() {
    this.annotations.forEach(ann => {
      const isMine = String(ann.userId) === String(this.myUserId);
      let shouldShow = false;
      if (this.currentTab === 'all') shouldShow = true;
      else if (this.currentTab === 'mine') shouldShow = isMine;
      else if (this.currentTab === 'community') shouldShow = !isMine;
      
      const elements = document.querySelectorAll(`.scholic-highlight[data-annotation-id="${ann.id}"]`);
      elements.forEach(el => {
        if (shouldShow) {
          el.classList.remove('scholic-hidden');
        } else {
          el.classList.add('scholic-hidden');
        }
      });
    });
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
    const ann = this.annotations.find(a => String(a.id) === String(id));
    if (ann && ann.pdfPage) {
      if (this.pdfViewer.currentPageNumber !== ann.pdfPage) {
        // Jump to the correct page first
        this.pdfViewer.currentPageNumber = ann.pdfPage;
        // Provide enough buffer for pdf.js to render the text layer.
        setTimeout(() => {
          const el = document.querySelector(`[data-annotation-id="${id}"]`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 500);
        return;
      }
    }
    
    // Page already loaded or no page metadata
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

  private async handleAreaSelected(area: Area): Promise<void> {
    try {
      // 1. Capture the entire visible tab
      const response = await chrome.runtime.sendMessage({ type: 'CAPTURE_TAB' });
      if (!response?.dataUrl) throw new Error('Failed to capture tab');

      // 2. Crop the image using a canvas
      const croppedDataUrl = await this.cropImage(response.dataUrl, area);
      
      // 3. Open sidebar with the image preview and form
      this.sidebar.openWithImage(croppedDataUrl);
    } catch (err) {
      console.error('[Scholic] Screenshot failed:', err);
      this.sidebar.open();
    }
  }

  private cropImage(dataUrl: string, area: Area): Promise<string> {
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
        ctx.drawImage(
          img,
          area.x, area.y, area.width, area.height,
          0, 0, area.width, area.height
        );
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('Failed to load image for cropping'));
      img.src = dataUrl;
    });
  }
}

new ScholicPdfViewer();
