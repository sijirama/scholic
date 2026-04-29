import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Navbar from '../components/Navbar';
import api from '../lib/api';
import { ArrowLeft, ExternalLink, Lock, MessageCircle, Send, Share2, Link2, Check, ChevronDown, ChevronUp, Pencil, Trash2 } from 'lucide-react';
import Avatar from '../components/Avatar';
import { toast } from 'sonner';
import type { Annotation, Comment, User as AnnotationUser } from '../components/AnnotationCard';
import ImageLightbox from '../components/ImageLightbox';
import ReactionStrip from '../components/ReactionStrip';
import MentionTextarea from '../components/MentionTextarea';
import MentionText from '../components/MentionText';

const HIGHLIGHT_COLORS = [
  { name: 'Sage',    hex: '#A8D5B5' },
  { name: 'Butter', hex: '#F5E4A0' },
  { name: 'Sky',    hex: '#A3C4F3' },
  { name: 'Lilac',  hex: '#C5A8D5' },
  { name: 'Peach',  hex: '#F5C4A3' },
  { name: 'Rose',   hex: '#F5A8C0' },
  { name: 'Forest', hex: '#4A9B6F' },
  { name: 'Amber',  hex: '#D4A017' },
  { name: 'Ocean',  hex: '#2E7BC4' },
  { name: 'Plum',   hex: '#8B4BAF' },
  { name: 'Coral',  hex: '#E8603C' },
  { name: 'Crimson',hex: '#C0392B' },
];

function hexToRgba(hex: string, alpha: number): string {
  const h = hex && hex.startsWith('#') && hex.length === 7 ? hex : '#A8D5B5';
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
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

const SHARE_PLATFORMS = [
  {
    name: 'Copy Link',
    icon: Link2,
    action: (url: string) => { navigator.clipboard.writeText(url); },
  },
  {
    name: 'X (Twitter)',
    icon: () => (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
    action: (url: string, text: string) => {
      window.open(`https://x.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank');
    },
  },
  {
    name: 'Reddit',
    icon: () => (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
      </svg>
    ),
    action: (url: string, text: string) => {
      window.open(`https://reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}`, '_blank');
    },
  },
  {
    name: 'LinkedIn',
    icon: () => (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
    action: (url: string) => {
      window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, '_blank');
    },
  },
];

const AnnotationPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();

  const [annotation, setAnnotation] = useState<Annotation | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [commentText, setCommentText] = useState('');
  const [showComments, setShowComments] = useState(false);
  const commentsFetched = useRef(false);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [editColor, setEditColor] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Paginated comments
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentTotal, setCommentTotal] = useState(0);
  const [commentOffset, setCommentOffset] = useState(0);
  const [loadingComments, setLoadingComments] = useState(false);
  const [hasMoreComments, setHasMoreComments] = useState(false);

  // Share menu
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);

  const COMMENTS_PER_PAGE = 10;

  const fetchAnnotation = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get(`/annotations/${id}`);
      setAnnotation(response.data);
      setCommentTotal(response.data.commentCount || response.data.comments?.length || 0);
    } catch {
      setError('Annotation not found');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchComments = useCallback(async (offset: number, reset: boolean) => {
    if (!id) return;
    setLoadingComments(true);
    try {
      const response = await api.get(`/annotations/${id}/comments?limit=${COMMENTS_PER_PAGE}&offset=${offset}`);
      const fetched: Comment[] = response.data.comments || [];
      const total: number = response.data.total || 0;
      setCommentTotal(total);
      setComments(prev => {
        const next = reset ? fetched : [...prev, ...fetched];
        setHasMoreComments(next.length < total);
        return next;
      });
      setCommentOffset(offset + fetched.length);
    } catch {
      toast.error('Failed to load comments');
    } finally {
      setLoadingComments(false);
    }
  }, [id]);

  useEffect(() => {
    fetchAnnotation();
  }, [fetchAnnotation]);

  // Lazy-load comments only when the user first opens the section
  useEffect(() => {
    if (showComments && !commentsFetched.current && annotation) {
      commentsFetched.current = true;
      fetchComments(0, true);
    }
  }, [showComments, annotation, fetchComments]);

  // Close share menu on outside click
  useEffect(() => {
    if (!shareOpen) return;
    const handler = (e: MouseEvent) => {
      if (shareRef.current && !shareRef.current.contains(e.target as Node)) {
        setShareOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [shareOpen]);

  const submitComment = async () => {
    if (!commentText.trim() || !annotation) return;
    try {
      if (hasMoreComments) {
        const remaining = commentTotal - comments.length;
        const res = await api.get(`/annotations/${id}/comments?limit=${remaining}&offset=${commentOffset}`);
        const fetched: Comment[] = res.data.comments || [];
        setComments(prev => [...prev, ...fetched]);
        setCommentOffset(prev => prev + fetched.length);
        setHasMoreComments(false);
      }
      const response = await api.post(`/annotations/${annotation.id}/comments`, { text: commentText });
      setComments(prev => [...prev, response.data]);
      setCommentTotal(prev => prev + 1);
      setCommentOffset(prev => prev + 1);
      setCommentText('');
    } catch {
      toast.error('Failed to post comment');
    }
  };

  const isOwner = !!(currentUser && annotation && String(currentUser.id) === String(annotation.user?.id));

  const startEditing = () => {
    if (!annotation) return;
    setEditText(annotation.text || '');
    setEditColor(annotation.highlightColor || '#A8D5B5');
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
  };

  const saveEdit = async () => {
    if (!annotation) return;
    setSaving(true);
    try {
      const response = await api.put(`/annotations/${annotation.id}`, {
        text: editText,
        highlightColor: editColor,
      });
      setAnnotation(response.data);
      setEditing(false);
      toast.success('Annotation updated');
    } catch {
      toast.error('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!annotation) return;
    setDeleting(true);
    try {
      await api.delete(`/annotations/${annotation.id}`);
      toast.success('Annotation deleted');
      navigate(-1);
    } catch {
      toast.error('Failed to delete annotation');
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
  const shareText = annotation
    ? `"${(annotation.quoteText || annotation.text || '').slice(0, 100)}${(annotation.quoteText || annotation.text || '').length > 100 ? '...' : ''}" — via Scholic`
    : '';

  if (loading) {
    return (
      <div style={{ fontFamily: '"Inter", sans-serif', minHeight: '100vh', background: '#121212', color: '#fff' }}>
        <Navbar />
        <div style={{ maxWidth: '640px', padding: '32px 20px', margin: '0 auto' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 24 }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', flexShrink: 0 }} className="pulse" />
            <div style={{ flex: 1 }}>
              <div style={{ width: 120, height: 14, borderRadius: 4, background: 'rgba(255,255,255,0.04)', marginBottom: 8 }} className="pulse" />
              <div style={{ width: 60, height: 11, borderRadius: 4, background: 'rgba(255,255,255,0.02)' }} className="pulse" />
            </div>
          </div>
          <div style={{ height: 200, borderRadius: 6, background: 'rgba(255,255,255,0.03)', marginBottom: 16 }} className="pulse" />
          <div style={{ height: 120, borderRadius: 8, background: 'rgba(255,255,255,0.02)' }} className="pulse" />
        </div>
        <style>{`
          @keyframes pulse { 0% { opacity: 0.4; } 50% { opacity: 0.7; } 100% { opacity: 0.4; } }
          .pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        `}</style>
      </div>
    );
  }

  if (error || !annotation) {
    return (
      <div style={{ fontFamily: '"Inter", sans-serif', minHeight: '100vh', background: '#121212', color: '#fff' }}>
        <Navbar />
        <div style={{ maxWidth: '640px', padding: '60px 20px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>404</div>
          <p style={{ fontSize: 14, color: '#555', marginBottom: 24 }}>{error || 'Annotation not found'}</p>
          <button
            onClick={() => navigate('/feed')}
            style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8, padding: '8px 20px', color: '#ccc', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Back to Feed
          </button>
        </div>
      </div>
    );
  }

  let domainName = annotation.linkDomain;
  if (!domainName) {
    try { domainName = new URL(annotation.url).hostname.replace('www.', ''); } catch { domainName = annotation.url; }
  }

  const hasPaper = !!(annotation.quoteText || annotation.text);

  return (
    <div style={{ fontFamily: '"Inter", sans-serif', minHeight: '100vh', background: '#121212', color: '#fff' }}>
      <Navbar />

      <div style={{ maxWidth: '640px', padding: '32px 20px', margin: '0 auto' }}>
        {/* Back */}
        <button
          onClick={() => navigate(-1)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#555', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 28, fontFamily: 'inherit', transition: 'color 0.15s' }}
          className="hover:text-white"
        >
          <ArrowLeft style={{ width: 15, height: 15 }} />
          Back
        </button>

        {/* Source header — favicon + title + site page link + visit button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          {annotation.linkFavicon && (
            <img src={annotation.linkFavicon} style={{ width: 28, height: 28, borderRadius: 6, flexShrink: 0 }} alt="" />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#e0e0e0', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {annotation.linkTitle || domainName}
            </p>
            <a
              href={`/page?url=${encodeURIComponent(annotation.url)}`}
              style={{ fontSize: 11, color: '#6EB781', textDecoration: 'none', fontWeight: 500 }}
              className="hover:underline"
            >
              View all annotations on {domainName} →
            </a>
          </div>
          <a
            href={annotation.url}
            target="_blank"
            rel="noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#555', textDecoration: 'none', flexShrink: 0, padding: '5px 10px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.06)', transition: 'all 0.15s' }}
            className="hover:text-white hover:border-white/20"
          >
            <ExternalLink style={{ width: 12, height: 12 }} />
            Visit
          </a>
        </div>

        {/* Image annotation */}
        {annotation.type === 'image' && annotation.imageUrl && (
          <div
            onClick={() => setLightboxSrc(annotation.imageUrl!)}
            style={{ borderRadius: 8, overflow: 'hidden', marginBottom: 20, border: '1px solid rgba(255,255,255,0.08)', cursor: 'zoom-in' }}
          >
            <img src={annotation.imageUrl} alt="Annotation Screenshot" style={{ width: '100%', display: 'block' }} />
          </div>
        )}

        {/* Paper card */}
        {hasPaper && (
          <div style={{
            display: 'flex',
            borderRadius: '3px 8px 8px 3px',
            overflow: 'hidden',
            boxShadow: '0 2px 8px rgba(0,0,0,0.25), 0 12px 48px rgba(0,0,0,0.5)',
            marginBottom: 20,
          }}>
            {/* Margin line — uses current color (edit or saved) */}
            <div style={{ width: 4, background: hexToRgba(editing ? editColor : (annotation.highlightColor || '#A8D5B5'), 0.7), flexShrink: 0, transition: 'background 0.2s' }} />

            {/* Paper body */}
            <div style={{ flex: 1, background: '#f9f6f0', padding: '28px 32px 28px 22px' }}>
              {annotation.quoteText && (
                <p style={{
                  fontSize: 17,
                  lineHeight: 1.9,
                  color: '#1a1a1a',
                  fontFamily: '"Georgia", "Times New Roman", serif',
                  margin: 0,
                  display: '-webkit-box',
                  WebkitLineClamp: 10,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  overflowWrap: 'break-word',
                  wordBreak: 'break-word',
                }}>
                  <mark style={{
                    background: hexToRgba(editing ? editColor : (annotation.highlightColor || '#A8D5B5'), 0.35),
                    color: 'inherit',
                    borderRadius: 2,
                    padding: '2px 1px',
                    transition: 'background 0.2s',
                  }}>
                    {annotation.quoteText}
                  </mark>
                </p>
              )}

              {editing ? (
                <>
                  {annotation.quoteText && (
                    <hr style={{ border: 'none', borderTop: '1px dashed rgba(0,0,0,0.14)', margin: '18px 0 16px' }} />
                  )}
                  {/* Color picker */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                    {HIGHLIGHT_COLORS.map(c => (
                      <button
                        key={c.hex}
                        title={c.name}
                        onClick={() => setEditColor(c.hex)}
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          background: c.hex,
                          border: editColor === c.hex ? '2px solid #333' : '2px solid transparent',
                          cursor: 'pointer',
                          padding: 0,
                          boxShadow: editColor === c.hex ? '0 0 0 1px #fff' : 'none',
                          transition: 'transform 0.1s',
                        }}
                      />
                    ))}
                  </div>
                  {/* Text edit */}
                  <MentionTextarea
                    value={editText}
                    onChange={setEditText}
                    placeholder="Add a note..."
                    rows={4}
                    textareaStyle={{
                      width: '100%',
                      fontFamily: '"Caveat", cursive',
                      fontSize: 20,
                      color: '#3a5c45',
                      lineHeight: 1.5,
                      background: 'rgba(0,0,0,0.04)',
                      border: '1px dashed rgba(0,0,0,0.15)',
                      borderRadius: 6,
                      padding: '8px 10px',
                      resize: 'vertical',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                    <button
                      onClick={cancelEditing}
                      style={{ background: 'rgba(0,0,0,0.06)', border: 'none', borderRadius: 7, padding: '6px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#555', fontFamily: 'inherit' }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveEdit}
                      disabled={saving}
                      style={{ background: '#3a5c45', border: 'none', borderRadius: 7, padding: '6px 16px', fontSize: 13, fontWeight: 600, cursor: saving ? 'default' : 'pointer', color: '#fff', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </>
              ) : (
                annotation.text && (
                  <>
                    {annotation.quoteText && (
                      <hr style={{ border: 'none', borderTop: '1px dashed rgba(0,0,0,0.14)', margin: '18px 0 16px' }} />
                    )}
                    <p style={{
                      fontFamily: '"Caveat", cursive',
                      fontSize: 22,
                      color: '#3a5c45',
                      lineHeight: 1.5,
                      margin: 0,
                      letterSpacing: 0.2,
                      display: '-webkit-box',
                      WebkitLineClamp: 6,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      overflowWrap: 'break-word',
                      wordBreak: 'break-word',
                    }}>
                      <MentionText text={annotation.text} />
                    </p>
                  </>
                )
              )}
            </div>
          </div>
        )}

        {/* Author row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20, marginBottom: 24 }}>
          <a href={`/u/${annotation.user?.username}`}>
            <Avatar user={annotation.user as AnnotationUser} size={36} />
          </a>
          <div style={{ flex: 1 }}>
            <a href={`/u/${annotation.user?.username}`} style={{ textDecoration: 'none' }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#e0e0e0' }} className="hover:underline">
                @{annotation.user?.username || 'unknown'}
              </span>
            </a>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
              <span style={{ fontSize: 12, color: '#555' }}>{timeAgo(annotation.createdAt)}</span>
              {annotation.isPrivate && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <Lock style={{ width: 10, height: 10, color: '#666' }} />
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Private</span>
                </div>
              )}
            </div>
          </div>

          {/* Owner actions */}
          {isOwner && !editing && (
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={startEditing}
                title="Edit annotation"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px 8px', borderRadius: 8, color: '#555', display: 'flex', alignItems: 'center', transition: 'all 0.15s' }}
                className="hover:bg-white/5 hover:text-white"
              >
                <Pencil style={{ width: 15, height: 15 }} />
              </button>
              <button
                onClick={() => setShowDeleteModal(true)}
                title="Delete annotation"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px 8px', borderRadius: 8, color: '#555', display: 'flex', alignItems: 'center', transition: 'all 0.15s' }}
                className="hover:bg-red-500/10 hover:text-red-400"
              >
                <Trash2 style={{ width: 15, height: 15 }} />
              </button>
            </div>
          )}

          {/* Share button */}
          <div ref={shareRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShareOpen(prev => !prev)}
              style={{ background: shareOpen ? 'rgba(255,255,255,0.06)' : 'none', border: 'none', cursor: 'pointer', padding: '6px 10px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 5, color: '#666', fontSize: 12, fontWeight: 500, fontFamily: 'inherit', transition: 'all 0.15s' }}
              className="hover:bg-white/5"
            >
              <Share2 style={{ width: 14, height: 14 }} />
              Share
            </button>

            {shareOpen && (
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 4, zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', minWidth: 160 }}>
                {SHARE_PLATFORMS.map((platform) => {
                  const Icon = platform.icon;
                  const isCopy = platform.name === 'Copy Link';
                  return (
                    <button
                      key={platform.name}
                      onClick={() => {
                        platform.action(shareUrl, shareText);
                        if (isCopy) {
                          setCopied(true);
                          toast.success('Link copied to clipboard');
                          setTimeout(() => setCopied(false), 2000);
                        }
                        if (!isCopy) setShareOpen(false);
                      }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', background: 'none', border: 'none', borderRadius: 6, color: '#ccc', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
                      className="hover:bg-white/5"
                    >
                      {isCopy && copied ? <Check style={{ width: 14, height: 14, color: '#6EB781' }} /> : <Icon style={{ width: 14, height: 14 }} />}
                      {isCopy && copied ? 'Copied!' : platform.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Comments toggle + reactions row */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            <button
              onClick={() => setShowComments(p => !p)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: showComments ? '#6EB781' : '#666', fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: 0, fontFamily: 'inherit', transition: 'color 0.15s' }}
            >
              <MessageCircle style={{ width: 16, height: 16 }} />
              {commentTotal} {commentTotal === 1 ? 'comment' : 'comments'}
              {showComments
                ? <ChevronUp style={{ width: 13, height: 13 }} />
                : <ChevronDown style={{ width: 13, height: 13 }} />}
            </button>
            {annotation && (
              <div style={{ marginLeft: 'auto' }}>
                <ReactionStrip
                  annotationId={annotation.id}
                  reactionCounts={annotation.reactionCounts}
                  myReaction={annotation.myReaction}
                  canReact={!!currentUser && !annotation.isPrivate}
                />
              </div>
            )}
          </div>

          {showComments && (
            <div style={{ marginTop: 20 }}>
              {/* Comment input */}
              {currentUser && (
                <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center' }}>
                  <Avatar user={currentUser as AnnotationUser} size={28} />
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '4px 4px 4px 14px', gap: 6 }}>
                    <MentionTextarea
                      placeholder="Add a comment..."
                      value={commentText}
                      onChange={setCommentText}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && commentText.trim()) {
                          e.preventDefault();
                          submitComment();
                        }
                      }}
                      rows={1}
                      wrapperStyle={{ flex: 1 }}
                      textareaStyle={{ width: '100%', flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 13, color: '#fff', resize: 'none', fontFamily: 'inherit', lineHeight: 1.5, padding: '6px 0' }}
                    />
                    <button
                      onClick={submitComment}
                      style={{ background: commentText.trim() ? '#6EB781' : 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: commentText.trim() ? 'pointer' : 'default', transition: 'background 0.15s', padding: 0, flexShrink: 0 }}
                    >
                      <Send style={{ width: 14, height: 14, color: commentText.trim() ? '#fff' : '#555' }} />
                    </button>
                  </div>
                </div>
              )}

              {/* Comment list */}
              {loadingComments && comments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#555', fontSize: 13 }}>Loading comments...</div>
              ) : comments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: '#444', fontSize: 13 }}>
                  No comments yet. Be the first to share your thoughts.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {comments.map((comment: Comment) => (
                    <div key={comment.id} style={{ display: 'flex', gap: 10 }}>
                      <Avatar user={comment.user as AnnotationUser} size={28} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <a href={`/u/${comment.user.username}`} style={{ textDecoration: 'none' }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#eee' }} className="hover:underline">@{comment.user.username}</span>
                          </a>
                          <span style={{ fontSize: 11, color: '#444' }}>{timeAgo(comment.createdAt)}</span>
                        </div>
                        <p style={{ fontSize: 13, color: '#bbb', margin: 0, lineHeight: 1.6 }}>
                          <MentionText text={comment.text} />
                        </p>
                      </div>
                    </div>
                  ))}

                  {hasMoreComments && (
                    <button
                      onClick={() => fetchComments(commentOffset, false)}
                      disabled={loadingComments}
                      style={{ background: 'none', border: 'none', color: '#6EB781', fontSize: 12, fontWeight: 500, cursor: 'pointer', padding: '8px 0', textAlign: 'left', fontFamily: 'inherit', opacity: loadingComments ? 0.5 : 1 }}
                    >
                      {loadingComments ? 'Loading...' : `View ${commentTotal - comments.length} more comments`}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0% { opacity: 0.4; } 50% { opacity: 0.7; } 100% { opacity: 0.4; } }
        .pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        mark { -webkit-print-color-adjust: exact; }
      `}</style>
      {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div
          onClick={() => { if (!deleting) setShowDeleteModal(false); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: '28px 28px 24px', maxWidth: 380, width: '100%', boxShadow: '0 16px 48px rgba(0,0,0,0.6)' }}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 700, color: '#fff' }}>Delete annotation?</h3>
            <p style={{ margin: '0 0 24px', fontSize: 13, color: '#777', lineHeight: 1.6 }}>
              This will permanently remove the annotation and all its comments. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#ccc', fontFamily: 'inherit' }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                style={{ background: deleting ? 'rgba(239,68,68,0.5)' : '#ef4444', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: deleting ? 'default' : 'pointer', color: '#fff', fontFamily: 'inherit' }}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnnotationPage;
