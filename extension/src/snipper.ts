/**
 * snipper.ts — A simple area selection tool for capturing screenshots.
 */

export interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class Snipper {
  private overlay: HTMLDivElement | null = null;
  private selection: HTMLDivElement | null = null;
  private startX = 0;
  private startY = 0;
  private onSelect: (area: Area) => void;
  private onCancel: () => void;

  constructor(onSelect: (area: Area) => void, onCancel: () => void) {
    this.onSelect = onSelect;
    this.onCancel = onCancel;
  }

  public start(): void {
    if (this.overlay) return;

    // Create dimmed overlay
    this.overlay = document.createElement('div');
    Object.assign(this.overlay.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0, 0, 0, 0.4)',
      zIndex: '2147483647',
      cursor: 'crosshair',
    });

    // Create selection box
    this.selection = document.createElement('div');
    Object.assign(this.selection.style, {
      position: 'absolute',
      border: '2px solid #3b82f6',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      display: 'none',
      pointerEvents: 'none',
    });
    this.overlay.appendChild(this.selection);

    document.body.appendChild(this.overlay);

    this.overlay.addEventListener('mousedown', this.handleMouseDown);
    this.overlay.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mouseup', this.handleMouseUp);

    // Focus for escape key
    this.overlay.tabIndex = -1;
    this.overlay.focus();
  }

  private handleMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0) return;
    this.startX = e.clientX;
    this.startY = e.clientY;
    
    if (this.selection) {
      this.selection.style.left = `${this.startX}px`;
      this.selection.style.top = `${this.startY}px`;
      this.selection.style.width = '0px';
      this.selection.style.height = '0px';
      this.selection.style.display = 'block';
    }
  };

  private handleMouseMove = (e: MouseEvent): void => {
    if (!this.selection || this.selection.style.display === 'none') return;

    const currentX = e.clientX;
    const currentY = e.clientY;

    const width = Math.abs(currentX - this.startX);
    const height = Math.abs(currentY - this.startY);
    const left = Math.min(currentX, this.startX);
    const top = Math.min(currentY, this.startY);

    this.selection.style.width = `${width}px`;
    this.selection.style.height = `${height}px`;
    this.selection.style.left = `${left}px`;
    this.selection.style.top = `${top}px`;
  };

  private handleMouseUp = (e: MouseEvent): void => {
    if (!this.selection || this.selection.style.display === 'none') return;

    const width = parseInt(this.selection.style.width);
    const height = parseInt(this.selection.style.height);
    const x = parseInt(this.selection.style.left);
    const y = parseInt(this.selection.style.top);

    this.cleanup();

    if (width > 5 && height > 5) {
      // Use devicePixelRatio to ensure correct dimensions for high-DPI screens
      const dpr = window.devicePixelRatio || 1;
      this.onSelect({
        x: x * dpr,
        y: y * dpr,
        width: width * dpr,
        height: height * dpr,
      });
    } else {
      this.onCancel();
    }
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      this.cleanup();
      this.onCancel();
    }
  };

  private cleanup(): void {
    if (this.overlay) {
      this.overlay.removeEventListener('mousedown', this.handleMouseDown);
      this.overlay.removeEventListener('keydown', this.handleKeyDown);
      this.overlay.remove();
      this.overlay = null;
    }
    this.selection = null;
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mouseup', this.handleMouseUp);
  }
}
