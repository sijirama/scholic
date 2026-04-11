/**
 * sidebar.ts — Right-side panel for viewing and creating annotations.
 *
 * The sidebar is injected into every page as a Shadow DOM element (style isolation).
 * It provides:
 *   - An annotation creation form (quoted text + note input + public/private toggle)
 *   - A list of all annotations on the current page
 *   - Click-to-focus: clicking a sidebar item scrolls to its highlight
 *
 * The sidebar is toggleable via the extension icon or when "Annotate" is clicked.
 */

import type { Selector } from './anchoring/types';
import { CONFIG } from './config';

export interface AnnotationData {
  id?: string | number;
  url: string;
  quoteText: string;
  text: string;
  selectors: Selector[];
  isPrivate: boolean;
  userId?: number | string;
  createdAt?: string;
  user?: {
    username?: string;
    email?: string;
    profilePicture?: string;
  };
  comments?: any[];
  type?: 'text' | 'image' | 'html' | 'pdf';
  imageUrl?: string;
  image?: string; // base64 data for creation
  highlightColor?: string; // user-chosen pastel hex color
  _isPending?: boolean; // optimistic: not yet saved to backend
}

const HIGHLIGHT_COLORS = [
  // Pastels (light backgrounds)
  { name: 'Sage',     hex: '#A8D5B5' },
  { name: 'Butter',  hex: '#F5E4A0' },
  { name: 'Sky',     hex: '#A3C4F3' },
  { name: 'Lilac',   hex: '#C5A8D5' },
  { name: 'Peach',   hex: '#F5C4A3' },
  { name: 'Rose',    hex: '#F5A8C0' },
  // Deeper tones (light mode papers / dark backgrounds)
  { name: 'Forest',  hex: '#4A9B6F' },
  { name: 'Amber',   hex: '#D4A017' },
  { name: 'Ocean',   hex: '#2E7BC4' },
  { name: 'Plum',    hex: '#8B4BAF' },
  { name: 'Coral',   hex: '#E8603C' },
  { name: 'Crimson', hex: '#C0392B' },
];

/** Callbacks the sidebar uses to communicate with the content script */
export interface SidebarCallbacks {
  /** Save a new annotation to the backend */
  onSave: (annotation: AnnotationData) => void;
  /** Delete an annotation */
  onDelete: (annotationId: string) => void;
  /** Focus a highlight in the page (scroll to it) */
  onFocusAnnotation: (annotationId: string) => void;
  /** Post a comment on an annotation */
  onComment: (annotationId: string, text: string) => Promise<void>;
  /** Trigger a full refresh of annotations for the page */
  onRefresh: () => void;
  /** Active tab changed */
  onTabChange: (tab: 'mine' | 'community' | 'all') => void;
  /** Load next page of annotations */
  onLoadMore?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Human-readable relative time strings.
 */
function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** SVG icons used in the sidebar */
const ICONS = {
  lock: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  globe: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  pen: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
  trash: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  camera: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
};

/**
 * The sidebar UI manager.
 * Injects a right-side panel into the page using Shadow DOM.
 */
export class Sidebar {
  /** Shadow host element */
  private host: HTMLElement;
  /** Shadow root for style isolation */
  private shadow: ShadowRoot;
  /** The sidebar container */
  private panel: HTMLElement;
  /** Current annotation form state */
  private pendingQuoteText: string = '';
  private pendingSelectors: Selector[] = [];
  /** Callbacks */
  private callbacks: SidebarCallbacks;
  /** Whether the sidebar is currently visible */
  private isOpen: boolean = false;
  /** Current user data */
  private userData: any = null;
  private isRendering: boolean = false;
  /** Queued render — flushed after the current render finishes */
  private pendingRender: { annotations: AnnotationData[]; hasMore: boolean } | null = null;
  /** Active tab: 'mine' | 'community' | 'all' */
  private activeTab: 'mine' | 'community' | 'all' = 'community';
  private isAuthenticated: boolean = false;
  /** Stored document click handler for cleanup */
  private menuCloseHandler: (() => void) | null = null;

  constructor(callbacks: SidebarCallbacks) {
    this.callbacks = callbacks;
    this.fetchUserData();
    this.loadPersistedTab();

    // Create shadow host — lives at the edge of <body>
    this.host = document.createElement('scholic-sidebar-host');
    this.host.style.cssText = `
      position: fixed;
      top: 0;
      right: 0;
      width: 0;
      height: 100vh;
      z-index: 2147483646;
      pointer-events: none;
    `;
    this.shadow = this.host.attachShadow({ mode: 'closed' });

    // Inject styles
    const style = document.createElement('style');
    style.textContent = this.getStyles();
    this.shadow.appendChild(style);

    // Create panel
    this.panel = document.createElement('div');
    this.panel.className = 'scholic-sidebar';
    this.shadow.appendChild(this.panel);

    // Initial structure: Two-column layout
    this.panel.innerHTML = `
      <div class="peek-indicator">${ICONS.globe}</div>
      <div class="sidebar-main-content" style="flex: 1; display: flex; flex-direction: column; min-width: 0;">
        <div class="sidebar-header-container" style="flex-shrink: 0;"></div>
        <div class="sidebar-tabs-container" style="flex-shrink: 0;"></div>
        <div class="sidebar-form-container" style="flex-shrink: 0;"></div>
        <div class="sidebar-image-preview-container" style="flex-shrink: 0; display: none; padding: 0 20px 16px;"></div>
        <div class="sidebar-list-container"></div>
      </div>
    `;

    // Ensure flex layout on the panel itself (Row)
    this.panel.style.display = 'flex';
    this.panel.style.flexDirection = 'row';
    this.panel.style.position = 'fixed';
    this.panel.style.alignItems = 'stretch';

    document.body.appendChild(this.host);

    // Listen for storage changes (e.g., login sync) to re-render the sidebar
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.scholicToken) {
        console.log('[Scholic] Token changed, refreshing sidebar data...');
        this.isAuthenticated = !!changes.scholicToken.newValue;
        if (!this.isAuthenticated) {
          this.activeTab = 'all';
        }
        this.fetchUserData();
      }
    });
  }

  /**
   * Load the last-used tab from chrome.storage.local.
   * Falls back to 'community' for logged-in users, 'all' for guests.
   * This runs async at construction — first render uses the field default
   * then re-renders if the stored value differs.
   */
  private async loadPersistedTab(): Promise<void> {
    const result = await chrome.storage.local.get(['scholicActiveTab', 'scholicToken']);
    const stored = result.scholicActiveTab as 'mine' | 'community' | 'all' | undefined;
    const isAuth = !!result.scholicToken;

    if (!isAuth) {
      this.activeTab = 'all';
      return;
    }

    // Use stored value if present, otherwise default to 'community' (Following)
    this.activeTab = stored ?? 'community';
  }

  /** Persist the active tab to chrome.storage.local. */
  private saveActiveTab(tab: 'mine' | 'community' | 'all'): void {
    chrome.storage.local.set({ scholicActiveTab: tab });
  }

  /** Fetch current user data from the backend.
   * Also sets isAuthenticated so that the first renderAnnotationList call
   * has the correct auth state (avoids the race where the sidebar banner
   * shows "Sign in" while private annotations are already displayed). */
  private async fetchUserData(): Promise<void> {
    const result = await chrome.storage.local.get('scholicToken');
    const token = result.scholicToken;
    // Set auth state synchronously relative to this storage read
    this.isAuthenticated = !!token;
    if (!token) {
      this.userData = null;
      if (this.activeTab !== 'all') {
        this.activeTab = 'all';
      }
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'FETCH_ME'
      });
      if (response && !response.error) {
        this.userData = response;
        // Only re-render if we have cached annotations (avoid double render on initial load)
        if (this.lastAnnotations.length > 0) {
          this.renderAnnotationList(this.lastAnnotations);
        }
      }
    } catch (err) {
      console.error('[Scholic] Failed to fetch user data:', err);
    }
  }

  /** Render the sidebar header with title and user menu */
  private renderHeader(): void {
    const container = this.panel.querySelector('.sidebar-header-container');
    if (!container) return;
    container.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'sidebar-header';

    let userHtml = '';
    if (this.userData) {
      const initial = (this.userData.username || this.userData.email || '?')[0].toUpperCase();
      const avatarHtml = this.userData.profilePicture
        ? `<img src="${this.userData.profilePicture}" alt="Avatar" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" />`
        : initial;

      userHtml = `
        <div class="user-profile">
          <div class="user-avatar" id="user-avatar-trigger">${avatarHtml}</div>
          <div class="user-menu" id="user-side-menu">
            <div class="user-email">${this.userData.email}</div>
            <button class="menu-item" id="logout-trigger">Log out</button>
          </div>
        </div>
      `;
    }

    const logoSvg = `
      <svg width="24" height="24" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="28" cy="10" r="5" fill="#E8C547" />
        <circle cx="42" cy="18" r="5" fill="#E87347" />
        <circle cx="44" cy="34" r="5" fill="#6EB781" />
        <circle cx="34" cy="46" r="5" fill="#47A3E8" />
        <circle cx="18" cy="44" r="5" fill="#9B6EB7" />
        <circle cx="12" cy="28" r="5" fill="#E8477A" />
        <circle cx="18" cy="16" r="5" fill="#47E8C5" />
        <circle cx="30" cy="28" r="3.5" fill="#6EB781" />
      </svg>
    `;

    header.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        ${logoSvg}
        <span class="sidebar-title" style="text-transform: lowercase; font-weight: 700; font-size: 15px; color: #6EB781;">scholic</span>
      </div>
      <div style="display: flex; align-items: center; gap: 12px;">
        <button class="screenshot-btn" title="Take a screenshot annotation" style="background:none; border:none; color:#888; cursor:pointer; padding:4px; display:flex; align-items:center;">
          ${ICONS.camera}
        </button>
        ${userHtml}
        <button class="sidebar-close">✕</button>
      </div>
    `;

    // Close button
    header.querySelector('.sidebar-close')?.addEventListener('click', () => {
      this.close();
    });

    // User menu toggle
    const avatar = header.querySelector('#user-avatar-trigger');
    const menu = header.querySelector('#user-side-menu');
    avatar?.addEventListener('click', (e) => {
      e.stopPropagation();
      menu?.classList.toggle('show');
    });

    // Logout
    header.querySelector('#logout-trigger')?.addEventListener('click', async () => {
      await chrome.storage.local.remove('scholicToken');
      this.userData = null;
      this.renderAnnotationList([]);
      window.postMessage({ type: 'SCHOLIC_LOGOUT_SUCCESS' }, '*');
    });

    // Close menu when clicking outside — remove old handler first to avoid leaks
    if (this.menuCloseHandler) {
      document.removeEventListener('click', this.menuCloseHandler);
    }
    this.menuCloseHandler = () => menu?.classList.remove('show');
    document.addEventListener('click', this.menuCloseHandler);

    container.appendChild(header);

    // ── Tabs Header ──
    const tabsContainer = this.panel.querySelector('.sidebar-tabs-container');
    if (!tabsContainer) return;
    tabsContainer.innerHTML = '';

    const tabs = document.createElement('div');
    tabs.className = 'sidebar-tabs';
    let tabsHtml = '';
    
    if (this.isAuthenticated) {
      tabsHtml = `
        <button class="tab-btn ${this.activeTab === 'mine' ? 'active' : ''}" data-tab="mine">Mine</button>
        <button class="tab-btn ${this.activeTab === 'community' ? 'active' : ''}" data-tab="community">Following</button>
      `;
    }
    
    tabsHtml += `<button class="tab-btn ${this.activeTab === 'all' ? 'active' : ''}" data-tab="all">All</button>`;
    
    tabs.innerHTML = `
      ${tabsHtml}
      <button class="refresh-btn" title="Refresh annotations">
        <svg fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>
    `;

    tabs.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const tab = target.dataset.tab as 'mine' | 'community' | 'all';
        if (this.activeTab !== tab) {
          this.activeTab = tab;
          this.saveActiveTab(tab);
          this.renderAnnotationList(this.lastAnnotations);
          this.callbacks.onTabChange(tab);
        }
      });
    });

    tabs.querySelector('.refresh-btn')?.addEventListener('click', (e) => {
      const btn = e.currentTarget as HTMLElement;
      btn.classList.add('spinning');
      setTimeout(() => btn.classList.remove('spinning'), 500);
      this.callbacks.onRefresh();
    });

    tabsContainer.appendChild(tabs);

    // Screenshot button listener
    header.querySelector('.screenshot-btn')?.addEventListener('click', () => {
      // Dispatch custom event to content.ts
      window.dispatchEvent(new CustomEvent('SCHOLIC_START_SCREENSHOT'));
    });
  }

  /** Cache of the most recent annotations for re-rendering on auth change */
  private lastAnnotations: AnnotationData[] = [];
  /** Open/close state of comment sections by annotation ID */
  private openComments: Record<string, boolean> = {};

  /** CSS for the sidebar — lives inside Shadow DOM, zero conflicts */
  private getStyles(): string {
    return `
      .scholic-sidebar {
        position: fixed;
        top: 0;
        right: 0;
        width: 480px;
        height: 100vh;
        background: #141414;
        border-left: 1px solid rgba(255,255,255,0.08);
        color: #e0e0e0;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        overflow: hidden;
        transform: translateX(100%);
        transition: transform 0.25s ease;
        pointer-events: auto;
        box-shadow: -4px 0 20px rgba(0,0,0,0.3);
      }

      /* Hide scrollbars for everything inside the sidebar's shadow DOM */
      * {
        scrollbar-width: none !important;
        -ms-overflow-style: none !important;
      }

      *::-webkit-scrollbar {
        display: none !important;
        width: 0 !important;
        height: 0 !important;
      }

      /* Explicitly target the list container to be sure */
      .sidebar-list-container {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        scrollbar-width: none !important;
        -ms-overflow-style: none !important;
      }
      .sidebar-list-container::-webkit-scrollbar {
        display: none !important;
        width: 0 !important;
        height: 0 !important;
      }

      .scholic-sidebar.open {
        transform: translateX(0);
      }

      .scholic-sidebar.peek {
        transform: translateX(calc(100% - 32px));
        cursor: pointer;
      }
      .scholic-sidebar.peek:hover {
        transform: translateX(calc(100% - 38px));
      }
      .scholic-sidebar.peek .sidebar-main-content {
        opacity: 0;
        pointer-events: none;
      }

      .peek-indicator {
        position: relative;
        width: 32px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #1a1a1a;
        border-right: 1px solid rgba(110,183,129,0.2);
        z-index: 10;
        cursor: pointer;
      }
      .scholic-sidebar.open .peek-indicator {
        display: flex;
        cursor: pointer;
        opacity: 0.2;
        transition: opacity 0.2s;
      }
      .scholic-sidebar.open .peek-indicator:hover {
        opacity: 1;
        background: rgba(110,183,129,0.1);
      }
      .scholic-sidebar.open .peek-indicator svg {
        transform: rotate(0deg);
      }
      .peek-indicator svg {
        transform: rotate(180deg);
        color: #6EB781;
        opacity: 0.6;
      }

      /* Header */
      .sidebar-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid rgba(255,255,255,0.06);
      }

      .sidebar-title {
        font-weight: 700;
        font-size: 15px;
        color: #6EB781;
        text-transform: lowercase;
      }

      .sidebar-close {
        background: none;
        border: none;
        color: #666;
        cursor: pointer;
        font-size: 18px;
        padding: 4px;
        line-height: 1;
      }
      .sidebar-close:hover { color: #fff; }

      /* Tabs */
      .sidebar-tabs {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 20px;
        border-bottom: 1px solid rgba(255,255,255,0.06);
        background: rgba(255,255,255,0.015);
      }
      .tab-btn {
        background: transparent;
        border: none;
        color: #888;
        font-size: 13px;
        font-family: inherit;
        font-weight: 500;
        cursor: pointer;
        padding: 5px 12px;
        border-radius: 6px;
        transition: all 0.2s;
      }
      .tab-btn:hover {
        background: rgba(255,255,255,0.05);
        color: #ddd;
      }
      .tab-btn.active {
        background: rgba(110,183,129,0.15);
        color: #6EB781;
        font-weight: 600;
        box-shadow: inset 0 0 0 1px rgba(110,183,129,0.3);
      }
      .refresh-btn {
        margin-left: auto;
        background: transparent;
        border: none;
        color: #888;
        cursor: pointer;
        padding: 5px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 0.2s, background 0.2s;
      }
      .refresh-btn svg {
        width: 15px;
        height: 15px;
        transition: transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
      }
      .refresh-btn:hover {
        color: #fff;
        background: rgba(255,255,255,0.05);
      }
      .refresh-btn.spinning svg {
        transform: rotate(360deg);
      }

      /* User Profile */
      .user-profile {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .user-avatar {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: linear-gradient(135deg, rgba(110,183,129,0.3), rgba(71,163,232,0.3));
        border: 1px solid rgba(255,255,255,0.1);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        color: #fff;
        font-weight: 700;
        cursor: pointer;
        transition: transform 0.2s;
        overflow: hidden;
      }
      .user-avatar:hover {
        transform: scale(1.05);
      }

      /* Custom Scrollbar */
      ::-webkit-scrollbar { width: 8px; height: 8px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: #444; border-radius: 4px; }
      ::-webkit-scrollbar-thumb:hover { background: #555; }

      .user-menu {
        position: absolute;
        top: 50px;
        right: 20px;
        background: #1a1a1a;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 8px;
        padding: 6px;
        display: none;
        flex-direction: column;
        z-index: 100;
        box-shadow: 0 8px 24px rgba(0,0,0,0.5);
        min-width: 120px;
      }
      .user-menu.show {
        display: flex;
      }

      .menu-item {
        padding: 8px 12px;
        font-size: 12px;
        color: #888;
        cursor: pointer;
        border-radius: 6px;
        transition: all 0.15s;
        text-align: left;
        background: none;
        border: none;
        width: 100%;
        font-family: inherit;
      }
      .menu-item:hover {
        background: rgba(255,95,87,0.1);
        color: #ff5f57;
      }

      .user-email {
        padding: 8px 12px;
        font-size: 11px;
        color: #555;
        border-bottom: 1px solid rgba(255,255,255,0.05);
        margin-bottom: 4px;
        word-break: break-all;
      }

      /* Annotation form */
      .annotation-form {
        padding: 16px 20px;
        border-bottom: 1px solid rgba(255,255,255,0.06);
      }

      .form-label {
        font-size: 11px;
        text-transform: uppercase;
        color: #666;
        margin-bottom: 8px;
        font-weight: 600;
        letter-spacing: 0.5px;
      }

      .quote-preview {
        background: rgba(110,183,129,0.08);
        border-left: 3px solid #6EB781;
        padding: 10px 14px;
        font-size: 13px;
        color: #ccc;
        line-height: 1.5;
        margin-bottom: 12px;
        border-radius: 0 6px 6px 0;
        max-height: 100px;
        overflow-y: auto;
      }

      .note-input {
        width: 100%;
        min-height: 80px;
        background: #1a1a1a;
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 8px;
        padding: 10px 14px;
        color: #e0e0e0;
        font-size: 13px;
        font-family: inherit;
        resize: vertical;
        margin-bottom: 12px;
        box-sizing: border-box;
      }
      .note-input:focus {
        outline: none;
        border-color: #6EB781;
      }
      .note-input::placeholder { color: #555; }

      /* Color swatches */
      .color-swatches {
        display: flex;
        gap: 8px;
        margin-bottom: 14px;
      }
      .color-swatch {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        border: 2px solid transparent;
        cursor: pointer;
        padding: 0;
        transition: transform 0.15s, border-color 0.15s;
        flex-shrink: 0;
      }
      .color-swatch:hover { transform: scale(1.18); }
      .color-swatch.active {
        border-color: rgba(255,255,255,0.8);
        transform: scale(1.12);
      }

      /* Privacy toggle */
      .privacy-toggle {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 14px;
        padding: 8px 12px;
        background: rgba(255,255,255,0.03);
        border-radius: 8px;
      }
      .privacy-toggle-label {
        font-size: 12px;
        color: #999;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .privacy-toggle-label svg {
        opacity: 0.7;
      }
      .toggle-switch {
        position: relative;
        width: 36px;
        height: 20px;
        background: rgba(110,183,129,0.3);
        border-radius: 10px;
        cursor: pointer;
        transition: background 0.2s;
        flex-shrink: 0;
      }
      .toggle-switch.private {
        background: rgba(232,197,71,0.3);
      }
      .toggle-knob {
        position: absolute;
        top: 2px;
        left: 2px;
        width: 16px;
        height: 16px;
        background: #6EB781;
        border-radius: 50%;
        transition: all 0.2s;
      }
      .toggle-switch.private .toggle-knob {
        left: 18px;
        background: #e8c547;
      }

      .form-actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      }

      .btn {
        padding: 6px 16px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        border: none;
        font-family: inherit;
        transition: all 0.15s;
      }
      .btn-primary {
        background: #6EB781;
        color: #fff;
      }
      .btn-primary:hover { background: #5da870; }
      .btn-secondary {
        background: transparent;
        color: #999;
        border: 1px solid rgba(255,255,255,0.1);
      }
      .btn-secondary:hover { background: rgba(255,255,255,0.04); }

      /* Annotation list */
      .annotation-list {
        padding: 12px 0;
      }

      .annotation-item {
        padding: 14px 20px;
        border-bottom: 1px solid rgba(255,255,255,0.04);
        cursor: pointer;
        transition: background 0.15s;
      }
      .annotation-item:hover {
        background: rgba(255,255,255,0.03);
      }
      .annotation-item.pending {
        opacity: 0.55;
        pointer-events: none;
      }
      .annotation-item.pending::after {
        content: 'Saving…';
        display: block;
        font-size: 10px;
        color: #6EB781;
        margin-top: 4px;
      }

      .load-more-btn {
        display: block;
        width: calc(100% - 40px);
        margin: 12px 20px 16px;
        padding: 9px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 8px;
        color: #888;
        font-size: 12px;
        font-family: inherit;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.15s, color 0.15s;
        text-align: center;
      }
      .load-more-btn:hover {
        background: rgba(255,255,255,0.07);
        color: #ccc;
      }

      .annotation-item-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
      }

      .annotation-author-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 6px;
      }

      .annotation-author-avatar {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: linear-gradient(135deg, rgba(110,183,129,0.3), rgba(71,163,232,0.3));
        font-size: 9px;
        font-weight: 700;
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }

      .annotation-author-name {
        font-size: 12px;
        font-weight: 600;
        color: #ccc;
        text-decoration: none;
      }
      .annotation-author-name:hover {
        color: #6EB781;
        text-decoration: underline;
      }

      .annotation-quote {
        font-size: 12px;
        color: #ccc;
        line-height: 1.6;
        margin-bottom: 6px;
        font-style: italic;
        display: -webkit-box;
        -webkit-line-clamp: 5;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .annotation-quote mark {
        background: inherit;
        color: inherit;
        border-radius: 2px;
        padding: 1px 0;
      }

      .annotation-note {
        font-size: 13px;
        color: #ccc;
        line-height: 1.5;
        margin-top: 6px;
        word-break: break-word;
      }

      .annotation-meta {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 11px;
        color: #555;
        margin-top: 8px;
      }

      .annotation-meta svg {
        opacity: 0.6;
      }

      .meta-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.3px;
      }
      .meta-badge.public {
        background: rgba(110,183,129,0.1);
        color: #6EB781;
      }
      .meta-badge.private {
        background: rgba(232,197,71,0.1);
        color: #e8c547;
      }

      .annotation-delete, .annotation-view {
        background: none;
        border: none;
        color: #444;
        cursor: pointer;
        padding: 4px 6px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        transition: all 0.15s;
      }
      .annotation-delete:hover {
        color: #ff5f57;
        background: rgba(255,95,87,0.1);
      }
      .annotation-view:hover {
        color: #6EB781;
        background: rgba(110,183,129,0.1);
      }
      .annotation-item-actions {
        display: flex;
        align-items: center;
        gap: 2px;
      }

      .annotation-comments {
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid rgba(255,255,255,0.04);
      }

      .annotation-comments-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 10px;
      }

      .comment-item {
        background: rgba(255,255,255,0.03);
        border-radius: 6px;
        padding: 6px 10px;
        font-size: 12px;
        line-height: 1.4;
      }
      .comment-item strong {
        color: #ccc;
        margin-right: 6px;
      }
      .comment-item span {
        color: #999;
      }

      .sidebar-reply-input {
        width: 100%;
        padding: 6px 10px;
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 6px;
        color: #ccc;
        font-size: 11px;
        font-family: inherit;
        box-sizing: border-box;
        outline: none;
        transition: border-color 0.15s;
      }
      .sidebar-reply-input:focus {
        border-color: rgba(110,183,129,0.4);
      }
      .sidebar-reply-input::placeholder {
        color: #555;
      }

      .empty-state {
        text-align: center;
        padding: 40px 20px;
        color: #555;
      }
      .empty-state svg {
        margin-bottom: 12px;
        opacity: 0.3;
      }
      .annotation-list-inner {
        padding-bottom: 40px;
      }
      .annotation-author-name {
        display: inline-block;
        max-width: 250px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        vertical-align: middle;
      }
    `;
  }

  /**
   * Open the sidebar with an annotation form pre-filled with the selected quote.
   */
  openWithQuote(quoteText: string, selectors: Selector[]): void {
    if (!this.isAuthenticated) {
      this.open();
      // Show login prompt instead of form
      const formContainer = this.panel.querySelector('.sidebar-form-container');
      if (formContainer) {
        formContainer.innerHTML = `
          <div style="padding: 20px; background: rgba(110,183,129,0.1); border-radius: 8px; margin: 16px 20px; border: 1px solid rgba(110,183,129,0.2);">
            <div style="font-weight: 700; color: #fff; margin-bottom: 8px;">Want to save this?</div>
            <div style="font-size: 12px; color: #888; margin-bottom: 12px;">Sign in to save your highlights and join the conversation.</div>
            <button class="btn btn-primary login-btn-inline" style="width: 100%;">Sign in to Scholic</button>
          </div>
        `;
        formContainer.querySelector('.login-btn-inline')?.addEventListener('click', () => {
          const extId = chrome.runtime.id;
          const loginUrl = `${CONFIG.WEB_URL}/auth/extension-login?extId=${extId}`;
          window.open(loginUrl, '_blank');
        });
      }
      return;
    }
    this.pendingQuoteText = quoteText;
    this.pendingSelectors = selectors;
    this.open();
    this.renderForm();
  }

  /**
   * Open the sidebar with an image annotation form.
   */
  openWithImage(imageData: string): void {
    this.open();
    this.renderForm('image', imageData);
  }

  /** Open the sidebar (without a pending annotation) */
  open(): void {
    this.isOpen = true;
    this.panel.classList.remove('peek');
    this.panel.classList.add('open');
    this.applyBodyShift('480px');
  }

  /** Show the sidebar in a collapsed "peek" state */
  showPeek(): void {
    this.isOpen = false;
    this.panel.classList.remove('open');
    this.panel.classList.add('peek');
    this.applyBodyShift('32px');

    // Clicking the peek tab opens the sidebar
    const peek = this.panel.querySelector('.peek-indicator');
    if (peek) {
      peek.onclick = () => this.isOpen ? this.showPeek() : this.open();
    }
  }

  /** Close the sidebar (goes back to peek if active) */
  close(): void {
    this.showPeek();
  }

  /** Completely hide the sidebar (inactive state) */
  hideCompletely(): void {
    this.isOpen = false;
    this.panel.classList.remove('open');
    this.panel.classList.remove('peek');
    this.applyBodyShift('0');
    this.pendingQuoteText = '';
    this.pendingSelectors = [];
  }

  /** Toggle sidebar open/close */
  toggle(): void {
    this.isOpen ? this.close() : this.open();
  }

  /**
   * Render the annotation creation form inside the sidebar.
   * Shows the quoted text (for text) or image preview (for image), textarea, and a public/private toggle.
   */
  private renderForm(type: 'text' | 'image' = 'text', imageData: string = ''): void {
    const container = this.panel.querySelector('.sidebar-form-container');
    if (!container) return;
    container.innerHTML = '';

    let isPrivate = false;
    let selectedColor = HIGHLIGHT_COLORS[0].hex;

    const form = document.createElement('div');
    form.className = 'annotation-form';
    
    let previewHtml = '';
    if (type === 'text') {
      previewHtml = `
        <div class="form-label">Selected Text</div>
        <div class="quote-preview">${this.escapeHtml(this.pendingQuoteText)}</div>
      `;
    } else {
      previewHtml = `
        <div class="form-label">Screenshot Preview</div>
        <div class="image-annotation-preview" style="margin-bottom: 12px; border-radius: 6px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1);">
          <img src="${imageData}" style="width: 100%; display: block;" />
        </div>
      `;
    }

    const swatchesHtml = `
      <div class="form-label">Highlight Color</div>
      <div class="color-swatches">
        ${HIGHLIGHT_COLORS.map((c, i) => `
          <button class="color-swatch${i === 0 ? ' active' : ''}" data-color="${c.hex}" style="background:${c.hex}" title="${c.name}"></button>
        `).join('')}
      </div>
    `;

    form.innerHTML = `
      ${previewHtml}
      <div class="form-label">Your Note</div>
      <textarea class="note-input" placeholder="Add your thoughts..." maxlength="5000"></textarea>
      ${type === 'text' ? swatchesHtml : ''}
      <div class="privacy-toggle">
        <div class="toggle-switch" id="privacy-switch">
          <div class="toggle-knob"></div>
        </div>
        <div class="privacy-toggle-label" id="privacy-label">
          ${ICONS.globe}
          <span>Public</span>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary cancel-btn">Cancel</button>
        <button class="btn btn-primary save-btn">Save</button>
      </div>
    `;

    // Insert form into container
    container.appendChild(form);

    // Focus the textarea
    const textarea = form.querySelector('.note-input') as HTMLTextAreaElement;
    setTimeout(() => textarea?.focus(), 100);

    // Auto-grow: expand vertically as the user types
    if (textarea) {
      textarea.style.resize = 'none';
      textarea.style.overflow = 'hidden';
      const autoGrow = () => {
        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight}px`;
      };
      textarea.addEventListener('input', autoGrow);
    }

    // Privacy toggle
    const toggle = form.querySelector('#privacy-switch') as HTMLElement;
    const label = form.querySelector('#privacy-label') as HTMLElement;
    toggle?.addEventListener('click', () => {
      isPrivate = !isPrivate;
      toggle.classList.toggle('private', isPrivate);
      label.innerHTML = isPrivate
        ? `${ICONS.lock}<span>Private</span>`
        : `${ICONS.globe}<span>Public</span>`;
    });

    // Color swatch selection
    form.querySelectorAll('.color-swatch').forEach(btn => {
      btn.addEventListener('click', () => {
        form.querySelectorAll('.color-swatch').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedColor = (btn as HTMLElement).dataset.color || HIGHLIGHT_COLORS[0].hex;
      });
    });

    // Cancel button
    form.querySelector('.cancel-btn')?.addEventListener('click', () => {
      form.remove();
      this.pendingQuoteText = '';
      this.pendingSelectors = [];
    });

    // Save button
    form.querySelector('.save-btn')?.addEventListener('click', () => {
      const note = textarea?.value || '';
      this.callbacks.onSave({
        url: window.location.href,
        quoteText: type === 'text' ? this.pendingQuoteText : 'Screenshot',
        text: note,
        selectors: type === 'text' ? this.pendingSelectors : [],
        isPrivate,
        type: type,
        image: type === 'image' ? imageData : undefined,
        highlightColor: selectedColor,
      } as any);
      form.remove();
      this.pendingQuoteText = '';
      this.pendingSelectors = [];
    });
  }

  /**
   * Render the list of existing annotations in the sidebar.
   *
   * Uses a queue so that optimistic updates fired mid-render are never dropped:
   * if a render is already running, the latest call is stored and flushed the
   * moment the current render finishes. This means the sidebar always ends up
   * showing the most recent data without blocking the caller.
   */
  async renderAnnotationList(annotations: AnnotationData[], hasMore = false): Promise<void> {
    // Guard against non-array input (e.g. API returning an object on tab switch)
    if (!Array.isArray(annotations)) annotations = [];

    if (this.isRendering) {
      // Queue the latest request — older queued ones are overwritten (only latest matters)
      this.pendingRender = { annotations, hasMore };
      return;
    }
    this.isRendering = true;

    try {
      this.lastAnnotations = annotations;

      // Ensure header/tabs are rendered
      this.renderHeader();

      const listContainer = this.panel.querySelector('.sidebar-list-container');
      if (!listContainer) return;
      listContainer.innerHTML = '';

      // If guest, show a sticky login banner at the top of the list
      if (!this.isAuthenticated) {
        const banner = document.createElement('div');
        banner.style.cssText = `
          padding: 12px 20px;
          background: #6EB781;
          color: #0a0a0a;
          font-size: 12px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: space-between;
          position: sticky;
          top: 0;
          z-index: 10;
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        `;
        banner.innerHTML = `
          <span>Sign in to save highlights and comment</span>
          <button class="banner-login-btn" style="background:rgba(0,0,0,0.1); border:1px solid rgba(0,0,0,0.2); border-radius:4px; padding:4px 10px; font-size:11px; font-weight:700; cursor:pointer;">Sign In</button>
        `;
        banner.querySelector('.banner-login-btn')?.addEventListener('click', () => {
          const extId = chrome.runtime.id;
          const loginUrl = `${CONFIG.WEB_URL}/auth/extension-login?extId=${extId}`;
          window.open(loginUrl, '_blank');
        });
        listContainer.appendChild(banner);
      }

      // Annotation list container
      const list = document.createElement('div');
      list.className = 'annotation-list-inner';
      listContainer.appendChild(list);

      // Ensure header/tabs don't get overwritten
      // The header already appended to this.panel, we just append list to this.panel later

      // Filter based on tabs
      const myUserId = this.userData?.id;

      // Defensive: never show private annotations to unauthenticated users,
      // even if they somehow ended up in the list (e.g. from cached state).
      let displayAnnotations = this.isAuthenticated
        ? annotations
        : annotations.filter((a) => !a.isPrivate);

      if (this.activeTab === 'mine') {
        displayAnnotations = displayAnnotations.filter((a) => a._isPending || String(a.userId) === String(myUserId));
      } else if (this.activeTab === 'community') {
        displayAnnotations = displayAnnotations.filter((a) => a._isPending || String(a.userId) !== String(myUserId));
      }
      // 'all' tab uses all annotations (no filter)

      if (displayAnnotations.length === 0) {
        let msg = this.activeTab === 'mine'
          ? "You haven't made any highlights here yet."
          : this.activeTab === 'community'
            ? "No one else has annotated this page yet."
            : "No annotations on this page yet.";
        list.innerHTML = `
          <div class="empty-state">
            ${ICONS.pen}
            <div style="font-weight:600; margin-bottom:8px; color:#ddd;">Nothing to see</div>
            <div style="font-size:12px; line-height:1.5;">${msg}<br/>Select some text to get started.</div>
          </div>
        `;
      } else {
        displayAnnotations.forEach((annotation) => {
          const item = document.createElement('div');
          item.className = annotation._isPending ? 'annotation-item pending' : 'annotation-item';

          const privacyBadge = annotation.isPrivate
            ? `<span class="meta-badge private">${ICONS.lock} Only you</span>`
            : `<span class="meta-badge public">${ICONS.globe} Public</span>`;

          const timeStr = annotation.createdAt ? timeAgo(annotation.createdAt) : '';

          const authorName = annotation.user?.username || annotation.user?.email?.split('@')[0] || 'Unknown';
          const authorInitial = authorName[0].toUpperCase();
          const avatarHtml = annotation.user?.profilePicture
            ? `<img src="${this.escapeAttr(annotation.user.profilePicture)}" style="width:100%; height:100%; object-fit:cover;" />`
            : authorInitial;

          item.innerHTML = `
            <div class="annotation-item-header">
              ${privacyBadge}
              <div class="annotation-item-actions">
                ${annotation.id ? `<a href="${CONFIG.WEB_URL}/annotation/${annotation.id}" target="_blank" class="annotation-view" title="View annotation"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>` : ''}
                ${annotation.id && String(annotation.userId) === String(myUserId) ? `<button class="annotation-delete" data-id="${annotation.id}" title="Delete annotation">${ICONS.trash}</button>` : ''}
              </div>
            </div>
            <div class="annotation-author-row">
              <div class="annotation-author-avatar">${avatarHtml}</div>
              <a href="${CONFIG.WEB_URL}/u/${this.escapeHtml(authorName)}" target="_blank" class="annotation-author-name">
                @${this.escapeHtml(authorName)}
              </a>
            </div>
            ${annotation.type === 'image' && annotation.imageUrl ? `
              <div class="annotation-image" style="margin-bottom: 8px; border-radius: 6px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1);">
                <img src="${this.escapeAttr(annotation.imageUrl || '')}" style="width: 100%; display: block;" />
              </div>
            ` : `<div class="annotation-quote"><mark style="background:${this.hexToRgba(annotation.highlightColor || '#A8D5B5', 0.12)}">${this.escapeHtml(annotation.quoteText)}</mark></div>`}
            ${annotation.id ? `
              <div class="annotation-note" data-id="${annotation.id}">
                ${(() => {
            const text = annotation.text || '';
            const words = text.split(/\s+/);
            if (words.length <= 60) return this.escapeHtml(text);
            return `
                    <span class="note-text">${this.escapeHtml(words.slice(0, 60).join(' '))}...</span>
                    <button class="read-more-btn" style="background:none; border:none; color:#6EB781; font-size:11px; font-weight:600; cursor:pointer; padding:0; margin-left:4px; font-family:inherit;">Read more</button>
                  `;
          })()}
              </div>
            ` : ''}
            <div class="annotation-meta">
              ${timeStr ? `<span>${timeStr}</span>` : ''}
              ${annotation.id ? `
                <button class="toggle-comments-btn" data-id="${annotation.id}" style="background:none; border:none; color:#555; cursor:pointer; font-size:12px; margin-left:12px; display:flex; align-items:center; gap:4px; padding:0;">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                  </svg>
                  <span>${annotation.comments?.length || 0}</span>
                </button>
              ` : ''}
            </div>
            ${annotation.id && this.openComments[annotation.id] ? `
              <div class="annotation-comments">
                ${this.isAuthenticated ? `
                  <input type="text" class="sidebar-reply-input" data-id="${annotation.id}" placeholder="Add a comment..." style="margin-bottom: 12px;" />
                ` : `
                  <div style="background: rgba(255,255,255,0.03); border: 1px dashed rgba(255,255,255,0.1); border-radius: 6px; padding: 10px; font-size: 11px; color: #666; text-align: center; margin-bottom: 12px;">
                    Sign in to join the conversation
                  </div>
                `}
                ${Array.isArray(annotation.comments) && annotation.comments.length > 0 ? `
                  <div class="annotation-comments-list">
                    ${(annotation.comments as any[]).map((c: any) => {
            const cname = c.user?.username || c.user?.emailSlice || 'User';
            const cinit = cname[0].toUpperCase();
            const cavatar = c.user?.profilePicture
              ? `<img src="${this.escapeAttr(c.user.profilePicture)}" style="width:100%; height:100%; object-fit:cover;" />`
              : cinit;
            return `
                        <div class="comment-item" style="display:flex; gap:8px; align-items:flex-start; margin-bottom:6px; background:rgba(255,255,255,0.02); padding:8px 10px; border-radius:6px;">
                          <div style="width:20px; height:20px; border-radius:50%; background:linear-gradient(135deg, rgba(110,183,129,0.3), rgba(71,163,232,0.3)); font-size:9px; font-weight:700; color:#fff; display:flex; align-items:center; justify-content:center; overflow:hidden; flex-shrink:0;">
                            ${cavatar}
                          </div>
                          <div style="flex:1; font-size:12px; line-height:1.4; padding-top:2px;">
                            <a href="${CONFIG.WEB_URL}/u/${this.escapeHtml(cname)}" target="_blank" style="text-decoration:none; color:inherit;">
                              <strong style="color:#d0d0d0; display:block; margin-bottom:2px;">@${this.escapeHtml(cname)}</strong>
                            </a>
                            <span style="color:#aaa;">${this.escapeHtml(c.text)}</span>
                          </div>
                        </div>
                      `;
          }).join('')}
                  </div>
                ` : ''}
              </div>
              ` : ''
            }
          `;

          // Read More logic
          const readMoreBtn = item.querySelector('.read-more-btn');
          if (readMoreBtn) {
            let currentLimit = 60;
            readMoreBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              const noteTextEl = item.querySelector('.note-text');
              if (!noteTextEl) return;
              
              const fullText = annotation.text || '';
              const words = fullText.split(/\s+/);
              currentLimit += 120;
              
              if (currentLimit >= words.length) {
                noteTextEl.textContent = fullText;
                readMoreBtn.remove();
              } else {
                noteTextEl.textContent = words.slice(0, currentLimit).join(' ') + '...';
              }
            });
          }

          // Click to focus the highlight in the page
          item.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).closest('.annotation-delete') || (e.target as HTMLElement).closest('.annotation-view')) {
              return;
            }
            if (annotation.id) {
              this.callbacks.onFocusAnnotation(annotation.id);
            }
          });

          // Toggle comments button
          const toggleBtn = item.querySelector('.toggle-comments-btn');
          toggleBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (annotation.id) {
              this.openComments[annotation.id] = !this.openComments[annotation.id];
              // Ensure we are not setting isRendering guard prematurely. Or just wrap in setTimeout 0.
              setTimeout(() => {
                this.isRendering = false;
                this.renderAnnotationList(this.lastAnnotations);
              }, 0);
            }
          });

          // Delete button
          const deleteBtn = item.querySelector('.annotation-delete');
          deleteBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = (e.currentTarget as HTMLElement).dataset.id;
            if (id && confirm('Delete this annotation? This cannot be undone.')) {
              this.callbacks.onDelete(id);
            }
          });

          // Reply input enter handling
          const replyInput = item.querySelector('.sidebar-reply-input') as HTMLInputElement;
          replyInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              const text = replyInput.value.trim();
              if (text && annotation.id) {
                replyInput.disabled = true;
                this.callbacks.onComment(annotation.id, text).finally(() => {
                  replyInput.disabled = false;
                  replyInput.value = '';
                });
              }
            }
          });
          // Prevent click-to-focus when clicking the input
          replyInput?.addEventListener('click', (e) => e.stopPropagation());

          list.appendChild(item);
        });
      }

      // Load more button
      if (hasMore && this.callbacks.onLoadMore) {
        const loadMoreBtn = document.createElement('button');
        loadMoreBtn.className = 'load-more-btn';
        loadMoreBtn.textContent = 'Load more';
        loadMoreBtn.addEventListener('click', () => {
          this.callbacks.onLoadMore?.();
        });
        listContainer.appendChild(loadMoreBtn);
      }

      // Automatically scroll to the top to see new/optimistic updates
      const contentLayer = this.panel.querySelector('.sidebar-content');
      if (contentLayer) contentLayer.scrollTop = 0;

    } finally {
      this.isRendering = false;
      // Flush any render that was queued while we were busy
      if (this.pendingRender) {
        const { annotations: a, hasMore: h } = this.pendingRender;
        this.pendingRender = null;
        await this.renderAnnotationList(a, h);
      }
    }
  }

  /** Escape a value for safe use inside an HTML attribute (e.g. src="...") */
  private escapeAttr(value: string): string {
    return (value || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private hexToRgba(hex: string, alpha: number): string {
    const h = hex && hex.startsWith('#') && hex.length === 7 ? hex : '#A8D5B5';
    const r = parseInt(h.slice(1, 3), 16);
    const g = parseInt(h.slice(3, 5), 16);
    const b = parseInt(h.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /** Simple HTML escaping to prevent XSS in displayed text */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Shift the page body to make room for the sidebar.
   */
  private applyBodyShift(width: string): void {
    document.body.style.transition = 'margin-right 0.25s ease';
    document.body.style.marginRight = width;
  }

  /** Clean up: remove the sidebar from the DOM */
  destroy(): void {
    this.hideCompletely();
    if (this.host.parentNode) {
      this.host.parentNode.removeChild(this.host);
    }
  }
}
