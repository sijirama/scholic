import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Bookmark as BookmarkIcon, Lock, Settings, X } from 'lucide-react';
import Navbar from '../components/Navbar';
import AnnotationCard from '../components/AnnotationCard';
import type { Annotation, Comment, User as BaseUser } from '../components/AnnotationCard';
import Avatar from '../components/Avatar';
import CollectionModal from '../components/CollectionModal';
import api from '../lib/api';
import type { BookmarkRecord, CollectionDetail } from '../lib/collections';
import { useAuth } from '../contexts/AuthContext';
import { getYouTubePreview } from '../lib/youtube';
import { toast } from 'sonner';

function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const BookmarkEntryCard: React.FC<{ bookmark: BookmarkRecord; createdAt: string }> = ({ bookmark, createdAt }) => {
  let displayDomain = bookmark.domain;
  if (!displayDomain) {
    try { displayDomain = new URL(bookmark.url).hostname.replace('www.', ''); } catch { displayDomain = bookmark.url; }
  }
  const title = bookmark.title || displayDomain || bookmark.url;
  const youtubePreview = getYouTubePreview(bookmark.url);

  return (
    <div style={{ padding: '20px 0', display: 'flex', gap: 12 }}>
      {bookmark.user && <Avatar user={bookmark.user} size={36} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 13, color: 'var(--text-muted)' }}>
          {bookmark.user && <a href={`/u/${bookmark.user.username}`} style={{ color: 'var(--text)', textDecoration: 'none', fontWeight: 600 }}>@{bookmark.user.username}</a>}
          <span>bookmarked</span>
          {bookmark.isPrivate && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--text-faint)' }}><Lock style={{ width: 10, height: 10 }} />private</span>}
          <span style={{ color: 'var(--text-faint)' }}>· {timeAgo(createdAt)}</span>
        </div>
        <a
          href={bookmark.url}
          target="_blank"
          rel="noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: youtubePreview ? 8 : '13px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-inset)', textDecoration: 'none', color: 'inherit' }}
        >
          {youtubePreview ? (
            <img src={youtubePreview.thumbnailUrl} alt="" style={{ width: 108, aspectRatio: '16 / 9', borderRadius: 6, objectFit: 'cover', background: 'var(--surface-2)', flexShrink: 0 }} />
          ) : bookmark.favicon ? (
            <img src={bookmark.favicon} alt="" style={{ width: 18, height: 18, borderRadius: 4, objectFit: 'contain', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 18, height: 18, borderRadius: 4, background: 'var(--color-yellow-soft)', color: 'var(--color-yellow-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <BookmarkIcon style={{ width: 11, height: 11 }} />
            </div>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayDomain}</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
          </div>
        </a>
      </div>
    </div>
  );
};

const CollectionPage: React.FC = () => {
  const ENTRIES_PER_PAGE = 20;
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [collection, setCollection] = useState<CollectionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchingMore, setFetchingMore] = useState(false);
  const [entryOffset, setEntryOffset] = useState(0);
  const [error, setError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [openComments, setOpenComments] = useState<Record<number, boolean>>({});
  const [commentOffsets, setCommentOffsets] = useState<Record<number, number>>({});
  const [fetchingComments, setFetchingComments] = useState<Record<number, boolean>>({});
  const [entryToRemove, setEntryToRemove] = useState<number | null>(null);

  const loadCollection = useCallback((offset = 0, append = false) => {
    if (append) {
      setFetchingMore(true);
    } else {
      setLoading(true);
      setError('');
    }
    api.get(`/collections/${id}?limit=${ENTRIES_PER_PAGE}&offset=${offset}`)
      .then((res) => {
        const next = res.data as CollectionDetail;
        setCollection(prev => {
          if (!append || !prev) return next;
          const existingIds = new Set(prev.entries.map(entry => entry.id));
          return {
            ...prev,
            ...next,
            entries: [
              ...prev.entries,
              ...next.entries.filter(entry => !existingIds.has(entry.id)),
            ],
          };
        });
        setEntryOffset(offset + next.entries.length);
      })
      .catch((err) => {
        if (append) toast.error('Failed to load more items');
        else setError(err.response?.data?.error || 'Collection not found');
      })
      .finally(() => {
        if (append) setFetchingMore(false);
        else setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    loadCollection(0, false);
  }, [loadCollection]);

  const updateAnnotation = (annotationId: number, updater: (annotation: Annotation) => Annotation) => {
    setCollection(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        entries: prev.entries.map(entry => entry.annotation?.id === annotationId
          ? { ...entry, annotation: updater(entry.annotation) }
          : entry),
      };
    });
  };

  const submitComment = async (annotationId: number, text: string) => {
    if (!text.trim()) return;
    try {
      const response = await api.post(`/annotations/${annotationId}/comments`, { text });
      updateAnnotation(annotationId, ann => ({
        ...ann,
        comments: [...(ann.comments || []), response.data],
        commentCount: (ann.commentCount || 0) + 1,
      }));
    } catch {
      toast.error('Failed to post comment');
    }
  };

  const fetchMoreComments = async (annotationId: number) => {
    if (fetchingComments[annotationId]) return;
    const annotation = collection?.entries.find(entry => entry.annotation?.id === annotationId)?.annotation;
    const currentOffset = commentOffsets[annotationId] ?? (annotation?.comments?.length || 0);
    setFetchingComments(prev => ({ ...prev, [annotationId]: true }));
    try {
      const response = await api.get(`/annotations/${annotationId}/comments?limit=10&offset=${currentOffset}`);
      const newComments = response.data.comments || [];
      updateAnnotation(annotationId, ann => {
        const existing = new Set((ann.comments || []).map(c => c.id));
        return { ...ann, comments: [...(ann.comments || []), ...newComments.filter((c: Comment) => !existing.has(c.id))] };
      });
      setCommentOffsets(prev => ({ ...prev, [annotationId]: currentOffset + newComments.length }));
    } catch {
      toast.error('Failed to load comments');
    } finally {
      setFetchingComments(prev => ({ ...prev, [annotationId]: false }));
    }
  };

  const deleteAnnotation = async (annotationId: number) => {
    try {
      await api.delete(`/annotations/${annotationId}`);
      setCollection(prev => prev ? {
        ...prev,
        entries: prev.entries.filter(entry => entry.annotation?.id !== annotationId),
        entryCount: Math.max(0, prev.entryCount - 1),
      } : prev);
      setEntryOffset(prev => Math.max(0, prev - 1));
    } catch {
      toast.error('Failed to delete annotation');
    }
  };

  const removeEntry = async (entryId: number) => {
    try {
      await api.delete(`/collections/${collection?.id}/entries/${entryId}`);
      setCollection(prev => prev ? { ...prev, entries: prev.entries.filter(entry => entry.id !== entryId), entryCount: Math.max(0, prev.entryCount - 1) } : prev);
      setEntryOffset(prev => Math.max(0, prev - 1));
      setEntryToRemove(null);
    } catch {
      toast.error('Failed to remove item');
    }
  };

  const renderAnnotationAction = useCallback((annotation: Annotation) => {
    let domainName = annotation.linkDomain;
    if (!domainName) {
      try { domainName = new URL(annotation.url).hostname.replace('www.', ''); } catch { domainName = annotation.url; }
    }
    return <span>saved from <a href={annotation.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>{domainName}</a></span>;
  }, []);

  if (loading) {
    return <div className="theme-page"><Navbar /><div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 20px', color: 'var(--text-dim)' }}>Loading collection...</div></div>;
  }
  if (error || !collection) {
    return <div className="theme-page"><Navbar /><div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 20px', color: 'var(--text-dim)' }}>{error || 'Collection not found'}</div></div>;
  }

  const isOwner = currentUser?.id === collection.ownerId;
  const hasMoreEntries = collection.entries.length < collection.entryCount;

  return (
    <div className="theme-page">
      <Navbar />
      <header style={{ background: 'var(--bg)' }}>
        {collection.coverImageUrl && (
          <div
            style={{
              width: '100%',
              height: 260,
              background: `url(${collection.coverImageUrl}) center ${collection.coverPositionY ?? 50}%/cover no-repeat`,
              borderBottom: '1px solid var(--border)',
            }}
          />
        )}
        <div style={{ maxWidth: 780, margin: '0 auto', padding: collection.coverImageUrl ? '20px 20px 0' : '36px 20px 0' }}>
          <div style={{ borderBottom: '1px solid color-mix(in srgb, var(--border) 55%, transparent)', paddingBottom: 26 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: collection.description ? 12 : 14 }}>
                  <h1 style={{ margin: 0, fontFamily: '"Outfit", sans-serif', fontSize: 30, fontWeight: 650, color: 'var(--text)', lineHeight: 1.14, overflowWrap: 'anywhere' }}>{collection.title}</h1>
                  {collection.isPrivate && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 7px', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-dim)', fontSize: 11, flexShrink: 0 }}>
                      <Lock style={{ width: 11, height: 11 }} />
                      private
                    </span>
                  )}
                </div>
                {collection.description && <p style={{ margin: '0 0 16px', color: 'var(--text-dim)', opacity: 0.96, fontSize: 14, lineHeight: 1.6, maxWidth: 680 }}>{collection.description}</p>}
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: 'var(--text-dim)', fontSize: 12 }}>
                  <Avatar user={collection.owner} size={22} />
                  <a href={`/u/${collection.owner.username}`} style={{ color: 'var(--text-muted)', textDecoration: 'none', fontWeight: 600 }}>@{collection.owner.username}</a>
                  <span>·</span>
                  <span>{collection.entryCount} {collection.entryCount === 1 ? 'item' : 'items'}</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, minWidth: 34, justifyContent: 'flex-end' }}>
                {isOwner && (
                  <button onClick={() => setSettingsOpen(true)} className="theme-icon-button" style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 6 }}>
                    <Settings style={{ width: 20, height: 20 }} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 780, margin: '0 auto', padding: '24px 20px 56px' }}>
        {collection.entries.length === 0 ? (
          <div style={{ padding: '50px 0', color: 'var(--text-dim)', textAlign: 'center', fontSize: 14 }}>No visible items in this collection yet.</div>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <h2 style={{ margin: 0, fontSize: 13, fontWeight: 650, color: 'var(--text-dim)' }}>Items</h2>
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Sorted by added time</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {collection.entries.map((entry) => (
              <div key={entry.id} style={{ position: 'relative' }}>
                {isOwner && (
                  <button
                    onClick={() => setEntryToRemove(entry.id)}
                    title="Remove from collection"
                    className="theme-icon-button"
                    style={{ position: 'absolute', top: 14, right: 0, zIndex: 2, border: 'none', background: 'transparent', padding: 4, cursor: 'pointer' }}
                  >
                    <X style={{ width: 15, height: 15 }} />
                  </button>
                )}
                {entry.annotation ? (
                  <AnnotationCard
                    annotation={entry.annotation}
                    openComments={openComments}
                    toggleComments={(annotationId) => setOpenComments(prev => ({ ...prev, [annotationId]: !prev[annotationId] }))}
                    renderAvatar={(user: BaseUser, size: number) => <Avatar user={user} size={size} />}
                    renderAnnotationAction={renderAnnotationAction}
                    handleComment={currentUser ? submitComment : undefined}
                    fetchMoreComments={fetchMoreComments}
                    fetchingComments={fetchingComments}
                    currentUser={currentUser as BaseUser | null}
                    onDeleteAnnotation={deleteAnnotation}
                  />
                ) : entry.bookmark ? (
                  <BookmarkEntryCard bookmark={entry.bookmark} createdAt={entry.createdAt} />
                ) : null}
              </div>
            ))}
            </div>
            {hasMoreEntries && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '26px 0 8px' }}>
                <button
                  onClick={() => loadCollection(entryOffset, true)}
                  disabled={fetchingMore}
                  className="theme-pill"
                  style={{ padding: '8px 18px', borderRadius: 8, fontSize: 12.5, fontWeight: 650, cursor: fetchingMore ? 'default' : 'pointer', opacity: fetchingMore ? 0.65 : 1, fontFamily: 'inherit' }}
                >
                  {fetchingMore ? 'Loading...' : 'Load more'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      <CollectionModal
        open={settingsOpen}
        collection={collection}
        onClose={() => setSettingsOpen(false)}
        onSaved={(updated) => setCollection(prev => prev ? { ...prev, ...updated } : prev)}
        onDeleted={() => navigate(`/u/${collection.owner.username}`)}
      />
      {entryToRemove !== null && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 110, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setEntryToRemove(null)}>
          <div style={{ width: '100%', maxWidth: 380, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow-lg)', padding: 18 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--danger-soft)', color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <AlertTriangle style={{ width: 17, height: 17 }} />
              </div>
              <div>
                <h2 style={{ margin: '0 0 5px', fontSize: 15, fontWeight: 650, color: 'var(--text)' }}>Remove from collection?</h2>
                <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-dim)' }}>This only removes the item from this collection. The original annotation or bookmark will stay where it is.</p>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setEntryToRemove(null)} className="theme-pill" style={{ padding: '7px 13px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={() => removeEntry(entryToRemove)} style={{ padding: '7px 13px', borderRadius: 8, border: 'none', background: 'var(--danger)', color: 'white', fontSize: 12, fontWeight: 650, cursor: 'pointer', fontFamily: 'inherit' }}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CollectionPage;
