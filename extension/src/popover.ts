/**
 * popover.ts — Floating tooltip that appears when text is selected.
 *
 * When the user selects text on a page and the Scholic extension is active,
 * a small popover appears near the selection with two buttons:
 *   - "Annotate" → opens the sidebar with the quoted text and a note input
 *   - "Highlight" → instantly highlights the text (private, no public annotation)
 *
 * The popover is injected as a Shadow DOM element to prevent CSS conflicts
 * with the host page.
 */

/** Callbacks triggered by the popover buttons */
export interface PopoverCallbacks {
  /** Called when user clicks "Annotate" — should open sidebar with quote */
  onAnnotate: (range: Range, quoteText: string) => void;
  /** Called when user clicks "Highlight" — should create a private highlight */
  onHighlight: (range: Range, quoteText: string) => void;
}

/**
 * The popover manager. Creates, positions, and destroys the floating tooltip.
 */
export class SelectionPopover {
  /** The shadow host element injected into the page */
  private host: HTMLElement | null = null;
  /** The shadow root for style isolation */
  private shadow: ShadowRoot | null = null;
  /** The popover container element */
  private container: HTMLElement | null = null;
  /** Callbacks for button actions */
  private callbacks: PopoverCallbacks;

  constructor(callbacks: PopoverCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Show the popover near the user's text selection.
   *
   * Positions it just above the selection's bounding rect.
   * If the selection is near the top of the viewport, positions below instead.
   *
   * @param range - The user's selection Range
   */
  show(range: Range): void {
    // Remove any existing popover first
    this.hide();

    const quoteText = range.toString().trim();
    if (!quoteText) return;

    // Create shadow host (prevents page CSS from affecting our popover)
    this.host = document.createElement('scholic-popover-host');
    this.host.style.cssText = 'position: absolute; z-index: 2147483647;';
    this.shadow = this.host.attachShadow({ mode: 'closed' });

    // Inject styles into shadow DOM
    const style = document.createElement('style');
    style.textContent = `
      /* Popover container */
      .scholic-popover {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 6px 8px;
        background: #1a1a1a;
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.4);
        font-family: 'Inter', -apple-system, sans-serif;
        animation: scholic-fade-in 0.15s ease;
      }

      @keyframes scholic-fade-in {
        from { opacity: 0; transform: translateY(4px); }
        to   { opacity: 1; transform: translateY(0); }
      }

      /* Popover button base */
      .scholic-popover-btn {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 5px 12px;
        border: none;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
        font-family: inherit;
      }

      /* "Annotate" button — primary green */
      .scholic-popover-btn.annotate {
        background: #6EB781;
        color: #fff;
      }
      .scholic-popover-btn.annotate:hover {
        background: #5da870;
      }

      /* "Highlight" button — subtle outline */
      .scholic-popover-btn.highlight {
        background: transparent;
        color: #ccc;
        border: 1px solid rgba(255,255,255,0.15);
      }
      .scholic-popover-btn.highlight:hover {
        background: rgba(255,255,255,0.06);
      }

      /* Icon size */
      .scholic-popover-btn svg {
        width: 14px;
        height: 14px;
      }
    `;
    this.shadow.appendChild(style);

    // Create button elements
    this.container = document.createElement('div');
    this.container.className = 'scholic-popover';

    // Annotate button
    const annotateBtn = document.createElement('button');
    annotateBtn.className = 'scholic-popover-btn annotate';
    annotateBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
      Annotate
    `;
    annotateBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.callbacks.onAnnotate(range, quoteText);
      this.hide();
    });

    // Highlight button
    const highlightBtn = document.createElement('button');
    highlightBtn.className = 'scholic-popover-btn highlight';
    highlightBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z"/>
      </svg>
      Highlight
    `;
    highlightBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.callbacks.onHighlight(range, quoteText);
      this.hide();
    });

    this.container.appendChild(annotateBtn);
    this.container.appendChild(highlightBtn);
    this.shadow.appendChild(this.container);

    // Position the popover above the selection
    const rect = range.getBoundingClientRect();
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    this.host.style.left = `${rect.left + scrollX + rect.width / 2 - 80}px`;

    // If near the top of viewport, show below the selection instead
    if (rect.top < 60) {
      this.host.style.top = `${rect.bottom + scrollY + 8}px`;
    } else {
      this.host.style.top = `${rect.top + scrollY - 46}px`;
    }

    document.body.appendChild(this.host);
  }

  /**
   * Hide and remove the popover from the DOM.
   */
  hide(): void {
    if (this.host && this.host.parentNode) {
      this.host.parentNode.removeChild(this.host);
    }
    this.host = null;
    this.shadow = null;
    this.container = null;
  }
}
