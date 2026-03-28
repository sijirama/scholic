/**
 * highlight-popup.ts — Hover popup for annotated highlights.
 *
 * When the user hovers over a highlighted region on the page, a small popup
 * appears showing:
 *   - The author who created the annotation
 *   - The annotation text/note
 *   - A reply input with comment threading
 *
 * Uses Shadow DOM for style isolation.
 */

import type { AnnotationData } from './sidebar';
import { CONFIG } from './config';

export class HighlightPopup {
  private host: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;
  private currentAnnotationId: string | null = null;
  private currentHighlightEl: HTMLElement | null = null;
  private commentsOpen: boolean = false;
  private getAnnotation: (id: string) => AnnotationData | undefined;
  private hideTimer: number | null = null;
  private onComment: (id: string, text: string) => Promise<void>;

  constructor(
    getAnnotation: (id: string) => AnnotationData | undefined,
    onComment: (id: string, text: string) => Promise<void>
  ) {
    this.getAnnotation = getAnnotation;
    this.onComment = onComment;
  }

  show(annotationId: string, highlightEl: HTMLElement, force: boolean = false): void {
    // Already showing this annotation — just cancel any pending hide
    if (!force && this.currentAnnotationId === annotationId && this.host) {
      this.cancelHide();
      return;
    }

    // New annotation — reset and build from scratch
    this.commentsOpen = false;
    const annotation = this.getAnnotation(annotationId);
    if (!annotation) return;

    this.hideImmediately();
    this.currentAnnotationId = annotationId;
    this.currentHighlightEl = highlightEl;

    // ── Shadow DOM ────────────────────────────────────────────────
    this.host = document.createElement('scholic-popup-host');
    this.host.style.cssText = 'position: absolute; z-index: 2147483646;';
    this.shadow = this.host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = this.getStyles();
    this.shadow.appendChild(style);

    // ── Helpers ───────────────────────────────────────────────────
    const authorName = annotation.user?.username || annotation.user?.email || 'You';
    const initial = authorName[0].toUpperCase();
    const avatarHtml = annotation.user?.profilePicture
      ? `<img src="${annotation.user.profilePicture}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />`
      : this.escapeHtml(initial);

    const noteText = annotation.text || '';
    const commentCount = annotation.comments?.length || 0;

    const extLinkSvg = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
    const msgSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
    const sendSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;

    const commentsItemsHtml = (annotation.comments || []).map((c: any) => {
      const cname = c.user?.username || c.user?.email?.split('@')[0] || 'User';
      const cavatar = c.user?.profilePicture
        ? `<img src="${c.user.profilePicture}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />`
        : this.escapeHtml(cname[0].toUpperCase());
      return `
        <div class="popup-comment-item">
          <div class="popup-comment-avatar">${cavatar}</div>
          <div class="popup-comment-content">
            <span class="popup-comment-author">@${this.escapeHtml(cname)}</span>
            <span class="popup-comment-text">${this.escapeHtml(c.text)}</span>
          </div>
        </div>`;
    }).join('');

    // ── Popup HTML — drawer is always in the DOM, toggled via CSS ─
    const popup = document.createElement('div');
    popup.className = 'scholic-popup';
    popup.innerHTML = `
      <div class="popup-header">
        <a href="${CONFIG.WEB_URL}/u/${this.escapeAttr(authorName)}" target="_blank" class="popup-author-link">
          <div class="popup-avatar">${avatarHtml}</div>
          <span class="popup-author">@${this.escapeHtml(authorName)}</span>
        </a>
        <div class="popup-header-right">
          <span class="popup-badge ${annotation.isPrivate ? 'badge-private' : 'badge-public'}">
            ${annotation.isPrivate ? 'Private' : 'Public'}
          </span>
          ${annotation.id ? `<a href="${CONFIG.WEB_URL}/annotation/${annotation.id}" target="_blank" class="popup-view-link" title="View annotation">${extLinkSvg}</a>` : ''}
        </div>
      </div>

      ${noteText ? `
        <div class="popup-note">
          ${(() => {
            const words = noteText.split(/\s+/);
            if (words.length <= 60) return this.escapeHtml(noteText);
            return `
              <span class="note-text">${this.escapeHtml(words.slice(0, 60).join(' '))}...</span>
              <button class="read-more-btn" style="background:none; border:none; color:#6EB781; font-size:11px; font-weight:600; cursor:pointer; padding:0; margin-left:4px; font-family:inherit;">Read more</button>
            `;
          })()}
        </div>
      ` : ''}

      <div class="popup-actions">
        <button class="popup-toggle-comments">
          ${msgSvg}
          <span class="comment-count">${commentCount}</span>
        </button>
      </div>

      <div class="popup-comments-drawer">
        ${commentsItemsHtml ? `<div class="popup-comments-list">${commentsItemsHtml}</div>` : ''}
        <div class="popup-reply-section">
          <div class="popup-reply-wrap">
            <input type="text" class="popup-reply-input" placeholder="Add a reply…" />
            <button class="popup-send-btn">${sendSvg}</button>
          </div>
        </div>
      </div>
    `;

    // ── Grab references ───────────────────────────────────────────
    const toggleBtn = popup.querySelector('.popup-toggle-comments') as HTMLButtonElement;
    const drawer = popup.querySelector('.popup-comments-drawer') as HTMLElement;
    const replyInput = popup.querySelector('.popup-reply-input') as HTMLInputElement;
    const sendBtn = popup.querySelector('.popup-send-btn') as HTMLButtonElement;

    // ── Read More logic ───────────────────────────────────────────
    const readMoreBtn = popup.querySelector('.read-more-btn');
    if (readMoreBtn) {
      let currentLimit = 60;
      readMoreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const noteTextEl = popup.querySelector('.note-text');
        if (!noteTextEl) return;
        
        const words = noteText.split(/\s+/);
        currentLimit += 120;
        
        if (currentLimit >= words.length) {
          noteTextEl.textContent = noteText;
          readMoreBtn.remove();
        } else {
          noteTextEl.textContent = words.slice(0, currentLimit).join(' ') + '...';
        }
        
        // Reposition after expansion
        if (this.host) {
          this.host.style.top = '-10000px';
          setTimeout(() => {
            if (!this.host || !this.host.parentNode) return;
            const rect = highlightEl.getBoundingClientRect();
            const pHeight = popup.offsetHeight;
            this.host.style.top = rect.top < pHeight + 16
              ? `${rect.bottom + window.scrollY + 8}px`
              : `${rect.top + window.scrollY - pHeight - 8}px`;
          }, 0);
        }
      });
    }

    // ── Mouse events ──────────────────────────────────────────────
    this.host.addEventListener('mouseenter', () => this.cancelHide());
    this.host.addEventListener('mouseleave', () => this.scheduleHide());

    // ── Toggle: add .open to drawer — CSS does the animation ──────
    toggleBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.commentsOpen = !this.commentsOpen;
      toggleBtn.classList.toggle('active', this.commentsOpen);
      drawer.classList.toggle('open', this.commentsOpen);
      if (this.commentsOpen) {
        setTimeout(() => replyInput?.focus(), 220);
      }
    });

    // ── Submit reply ──────────────────────────────────────────────
    const submitReply = () => {
      const text = replyInput?.value.trim();
      if (!text || !annotationId) return;
      replyInput.disabled = true;
      sendBtn.classList.add('sending');
      sendBtn.classList.remove('has-text');

      this.onComment(annotationId, text).then(() => {
        // Append new comment directly to the live DOM — no flicker
        const updated = this.getAnnotation(annotationId);
        const newComment = updated?.comments?.[updated.comments.length - 1];
        if (newComment) {
          let list = drawer.querySelector('.popup-comments-list');
          if (!list) {
            list = document.createElement('div');
            list.className = 'popup-comments-list';
            drawer.insertBefore(list, drawer.querySelector('.popup-reply-section'));
          }
          const cname = newComment.user?.username || newComment.user?.email?.split('@')[0] || 'User';
          const cavatar = newComment.user?.profilePicture
            ? `<img src="${newComment.user.profilePicture}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />`
            : this.escapeHtml(cname[0].toUpperCase());
          const item = document.createElement('div');
          item.className = 'popup-comment-item popup-comment-item--new';
          item.innerHTML = `
            <div class="popup-comment-avatar">${cavatar}</div>
            <div class="popup-comment-content">
              <span class="popup-comment-author">@${this.escapeHtml(cname)}</span>
              <span class="popup-comment-text">${this.escapeHtml(newComment.text)}</span>
            </div>`;
          list.appendChild(item);
          const countEl = popup.querySelector('.comment-count');
          if (countEl) countEl.textContent = String(updated?.comments?.length ?? 1);
        }
      }).finally(() => {
        replyInput.disabled = false;
        replyInput.value = '';
        sendBtn.classList.remove('sending');
      });
    };

    replyInput?.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); submitReply(); }
    });
    replyInput?.addEventListener('input', () => {
      sendBtn?.classList.toggle('has-text', !!replyInput.value.trim());
    });
    sendBtn?.addEventListener('click', submitReply);

    this.shadow.appendChild(popup);

    // ── Position ──────────────────────────────────────────────────
    const rect = highlightEl.getBoundingClientRect();
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const popupWidth = 288;

    let left = rect.left + scrollX + rect.width / 2 - popupWidth / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - popupWidth - 8 + scrollX));

    this.host.style.left = `${left}px`;
    this.host.style.top = '-10000px';
    document.body.appendChild(this.host);

    const popupHeight = popup.offsetHeight;
    this.host.style.top = rect.top < popupHeight + 16
      ? `${rect.bottom + scrollY + 8}px`
      : `${rect.top + scrollY - popupHeight - 8}px`;
  }

  /** Kept for external callers; no longer causes a full re-render. */
  refresh(): void {
    if (this.currentAnnotationId && this.currentHighlightEl) {
      this.show(this.currentAnnotationId, this.currentHighlightEl);
    }
  }

  scheduleHide(): void {
    this.cancelHide();
    this.hideTimer = window.setTimeout(() => this.hideImmediately(), 300);
  }

  cancelHide(): void {
    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  hideImmediately(): void {
    this.cancelHide();
    if (this.host?.parentNode) this.host.parentNode.removeChild(this.host);
    this.host = null;
    this.shadow = null;
    this.currentAnnotationId = null;
    this.commentsOpen = false;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private escapeAttr(value: string): string {
    return (value || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private getStyles(): string {
    return `
      * { box-sizing: border-box; margin: 0; padding: 0; }

      .scholic-popup {
        width: 288px;
        background: #111;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 14px;
        box-shadow:
          0 2px 4px rgba(0,0,0,0.3),
          0 12px 40px rgba(0,0,0,0.6),
          inset 0 1px 0 rgba(255,255,255,0.04);
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        color: #e0e0e0;
        overflow: hidden;
        animation: popup-in 0.18s cubic-bezier(0.22, 1, 0.36, 1) both;
      }

      @keyframes popup-in {
        from { opacity: 0; transform: translateY(6px) scale(0.96); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }

      .popup-header {
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 13px 14px 10px;
      }

      .popup-author-link {
        display: flex;
        align-items: center;
        gap: 8px;
        text-decoration: none;
        min-width: 0;
        flex: 1;
      }
      .popup-author-link:hover .popup-author { color: #6EB781; }

      .popup-header-right {
        display: flex;
        align-items: center;
        gap: 7px;
        flex-shrink: 0;
      }

      .popup-view-link {
        display: flex;
        align-items: center;
        color: #555;
        text-decoration: none;
        transition: color 0.15s;
      }
      .popup-view-link:hover { color: #6EB781; }

      .popup-avatar {
        width: 26px;
        height: 26px;
        border-radius: 50%;
        background: linear-gradient(135deg, rgba(110,183,129,0.45), rgba(71,163,232,0.45));
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: 700;
        color: #fff;
        flex-shrink: 0;
        overflow: hidden;
      }

      .popup-author {
        font-size: 12px;
        font-weight: 600;
        color: #ddd;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        transition: color 0.15s;
      }

      .popup-badge {
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        padding: 2px 6px;
        border-radius: 4px;
        flex-shrink: 0;
      }
      .badge-public  { background: rgba(110,183,129,0.12); color: #6EB781; border: 1px solid rgba(110,183,129,0.2); }
      .badge-private { background: rgba(232,71,122,0.1);   color: #E8477A; border: 1px solid rgba(232,71,122,0.18); }

      .popup-note {
        padding: 0 14px 12px;
        font-size: 12px;
        color: #999;
        line-height: 1.6;
        border-bottom: 1px solid rgba(255,255,255,0.05);
      }

      .popup-actions {
        padding: 8px 14px;
        display: flex;
        align-items: center;
      }

      .popup-toggle-comments {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        background: none;
        border: none;
        cursor: pointer;
        color: #555;
        font-size: 12px;
        font-family: inherit;
        padding: 3px 0;
        transition: color 0.15s;
        line-height: 1;
      }
      .popup-toggle-comments:hover { color: #999; }
      .popup-toggle-comments.active { color: #6EB781; }

      /* Drawer: animates open/closed with max-height */
      .popup-comments-drawer {
        max-height: 0;
        overflow: hidden;
        opacity: 0;
        border-top: 1px solid transparent;
        transition: max-height 0.25s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.16s ease, border-top-color 0.16s ease;
        display: flex;
        flex-direction: column;
      }
      .popup-comments-drawer.open {
        max-height: 400px;
        opacity: 1;
        border-top-color: rgba(255,255,255,0.05);
      }

      .popup-comments-list {
        max-height: 200px;
        overflow-y: auto;
        padding: 8px 10px 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .popup-comments-list::-webkit-scrollbar { width: 3px; }
      .popup-comments-list::-webkit-scrollbar-track { background: transparent; }
      .popup-comments-list::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.12);
        border-radius: 3px;
      }

      .popup-comment-item {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 7px 8px;
        border-radius: 8px;
        background: rgba(255,255,255,0.03);
        transition: background 0.12s;
      }
      .popup-comment-item:hover { background: rgba(255,255,255,0.05); }

      /* New comment slides in after posting */
      .popup-comment-item--new {
        animation: comment-in 0.2s cubic-bezier(0.22, 1, 0.36, 1) both;
      }
      @keyframes comment-in {
        from { opacity: 0; transform: translateY(4px); }
        to   { opacity: 1; transform: translateY(0); }
      }

      .popup-comment-avatar {
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: linear-gradient(135deg, rgba(110,183,129,0.35), rgba(71,163,232,0.35));
        font-size: 7px;
        font-weight: 700;
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        overflow: hidden;
        margin-top: 1px;
      }

      .popup-comment-content {
        flex: 1;
        min-width: 0;
        font-size: 11px;
        line-height: 1.5;
      }

      .popup-comment-author {
        font-weight: 600;
        color: #bbb;
        margin-right: 5px;
      }

      .popup-comment-text { color: #777; }

      .popup-reply-section {
        padding: 8px 10px 10px;
        border-top: 1px solid rgba(255,255,255,0.05);
      }

      .popup-reply-wrap {
        display: flex;
        align-items: center;
        gap: 6px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 8px;
        padding: 0 6px 0 10px;
        transition: border-color 0.15s, background 0.15s;
      }
      .popup-reply-wrap:focus-within {
        border-color: rgba(110,183,129,0.35);
        background: rgba(255,255,255,0.06);
      }

      .popup-reply-input {
        flex: 1;
        background: none;
        border: none;
        outline: none;
        font-size: 11px;
        color: #ccc;
        font-family: inherit;
        padding: 8px 0;
      }
      .popup-reply-input::placeholder { color: #444; }
      .popup-reply-input:disabled { opacity: 0.5; }

      .popup-send-btn {
        width: 24px;
        height: 24px;
        border-radius: 6px;
        border: none;
        background: transparent;
        color: #444;
        cursor: default;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        transition: background 0.15s, color 0.15s;
        font-family: inherit;
      }
      .popup-send-btn.has-text {
        background: #6EB781;
        color: #0a0a0a;
        cursor: pointer;
      }
      .popup-send-btn.has-text:hover { filter: brightness(1.1); }
      .popup-send-btn.sending { opacity: 0.5; cursor: default; }
    `;
  }
}