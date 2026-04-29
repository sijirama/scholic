import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Navbar from '../components/Navbar';
import api from '../lib/api';
import AnnotationCard from '../components/AnnotationCard';
import type { Annotation, User as AnnotationUser, Comment } from '../components/AnnotationCard';
import Avatar from '../components/Avatar';
import UserCard from '../components/discover/UserCard';
import type { DiscoverAuthor } from '../components/discover/UserCard';
import { toast } from 'sonner';

const FeedSkeleton: React.FC = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
    {[1, 2, 3].map(i => (
      <div key={i} style={{ padding: '20px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(255,255,255,0.04)', flexShrink: 0 }} className="pulse" />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <div style={{ width: '80px', height: '14px', borderRadius: '4px', background: 'rgba(255,255,255,0.04)' }} className="pulse" />
              <div style={{ width: '40px', height: '14px', borderRadius: '4px', background: 'rgba(255,255,255,0.02)' }} className="pulse" />
            </div>
            <div style={{ width: '100%', height: '16px', borderRadius: '4px', background: 'rgba(255,255,255,0.03)', marginBottom: '8px' }} className="pulse" />
            <div style={{ width: '60%', height: '16px', borderRadius: '4px', background: 'rgba(255,255,255,0.03)', marginBottom: '16px' }} className="pulse" />
            <div style={{ width: '100%', height: '140px', borderRadius: '8px', background: 'rgba(255,255,255,0.02)' }} className="pulse" />
          </div>
        </div>
      </div>
    ))}
  </div>
);

const Feed: React.FC = () => {
  const { user } = useAuth();
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedError, setFeedError] = useState(false);
  const [suggestions, setSuggestions] = useState<DiscoverAuthor[]>([]);
  const [tab, setTab] = useState<'following' | 'mine'>('following');

  // Pagination state
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [fetchingMore, setFetchingMore] = useState(false);
  const observerTarget = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [openComments, setOpenComments] = useState<Record<number, boolean>>({});
  const [commentOffsets, setCommentOffsets] = useState<Record<number, number>>({});
  const [fetchingComments, setFetchingComments] = useState<Record<number, boolean>>({});

  const inputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const toggleComments = (annotationId: number) => {
    setOpenComments(prev => {
      const next = { ...prev, [annotationId]: !prev[annotationId] };
      if (next[annotationId]) {
        setTimeout(() => inputRefs.current[annotationId]?.focus(), 260);
      }
      return next;
    });
  };

  const fetchMoreComments = async (annotationId: number) => {
    if (fetchingComments[annotationId]) return;

    setFetchingComments(prev => ({ ...prev, [annotationId]: true }));
    const currentOffset = commentOffsets[annotationId] !== undefined ? commentOffsets[annotationId] : (annotations.find(a => a.id === annotationId)?.comments?.length || 0);

    try {
      const response = await api.get(`/annotations/${annotationId}/comments?limit=10&offset=${currentOffset}`);
      const newComments = response.data.comments || [];

      setAnnotations(prev => prev.map(ann => {
        if (ann.id === annotationId) {
          const existingIds = new Set((ann.comments || []).map(c => c.id));
          const filteredNew = newComments.filter((c: Comment) => !existingIds.has(c.id));
          return { ...ann, comments: [...(ann.comments || []), ...filteredNew] };
        }
        return ann;
      }));

      setCommentOffsets(prev => ({ ...prev, [annotationId]: currentOffset + newComments.length }));
    } catch {
      toast.error('Failed to load comments');
    } finally {
      setFetchingComments(prev => ({ ...prev, [annotationId]: false }));
    }
  };

  const submitComment = async (annotationId: number, text: string) => {
    if (!text?.trim()) return;
    try {
      const response = await api.post(`/annotations/${annotationId}/comments`, { text });
      setAnnotations(prev => prev.map(ann => {
        if (ann.id === annotationId) {
          return {
            ...ann,
            comments: [...(ann.comments || []), response.data],
            commentCount: (ann.commentCount || 0) + 1
          };
        }
        return ann;
      }));
      setCommentOffsets(prev => ({ ...prev, [annotationId]: (prev[annotationId] || (annotations.find(a => a.id === annotationId)?.comments?.length || 0)) + 1 }));
    } catch {
      toast.error('Failed to post comment');
    }
  };

  const deleteAnnotation = async (id: number) => {
    try {
      await api.delete(`/annotations/${id}`);
      setAnnotations(prev => prev.filter(a => a.id !== id));
      toast.success('Annotation deleted');
    } catch {
      toast.error('Failed to delete annotation');
    }
  };

  const editAnnotation = async (id: number, text: string) => {
    try {
      await api.put(`/annotations/${id}`, { text });
      setAnnotations(prev => prev.map(a => a.id === id ? { ...a, text } : a));
      toast.success('Annotation updated');
    } catch {
      toast.error('Failed to update annotation');
    }
  };

  const deleteComment = async (annotationId: number, commentId: number) => {
    try {
      await api.delete(`/annotations/${annotationId}/comments/${commentId}`);
      setAnnotations(prev => prev.map(a => {
        if (a.id === annotationId) {
          return {
            ...a,
            comments: (a.comments || []).filter(c => c.id !== commentId),
            commentCount: Math.max(0, (a.commentCount || 0) - 1),
          };
        }
        return a;
      }));
    } catch {
      toast.error('Failed to delete comment');
    }
  };

  const editComment = async (annotationId: number, commentId: number, text: string) => {
    try {
      await api.put(`/annotations/${annotationId}/comments/${commentId}`, { text });
      setAnnotations(prev => prev.map(a => {
        if (a.id === annotationId) {
          return {
            ...a,
            comments: (a.comments || []).map(c => c.id === commentId ? { ...c, text } : c),
          };
        }
        return a;
      }));
    } catch {
      toast.error('Failed to update comment');
    }
  };

  const bodyFont = { fontFamily: '"Inter", sans-serif' };
  const brandFont = { fontFamily: '"Outfit", sans-serif' };

  const fetchFeed = useCallback(async (pageNum: number, isInitial = false, signal?: AbortSignal) => {
    if (isInitial) setLoading(true);
    else setFetchingMore(true);

    try {
      const limit = 20;
      const offset = pageNum * limit;
      const response = await api.get(`/feed?limit=${limit}&offset=${offset}&tab=${tab}`, { signal });

      setFeedError(false);
      const total = response.data.total || 0;
      setAnnotations(prev => {
        const next = isInitial ? (response.data.annotations || []) : [...prev, ...(response.data.annotations || [])];
        setHasMore(next.length < total);
        return next;
      });
    } catch (err: unknown) {
      if ((err as Error).name !== 'CanceledError') {
        if (isInitial) setFeedError(true);
        else toast.error('Failed to load more');
      }
    } finally {
      setLoading(false);
      setFetchingMore(false);
    }
  }, [tab]);

  // Reset on tab change. Cancel any in-flight request to avoid stale results.
  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setAnnotations([]);
    setPage(0);
    setHasMore(true);
    fetchFeed(0, true, controller.signal);

    return () => controller.abort();
  }, [tab, fetchFeed]);

  // Lazy-load people-to-follow suggestions only when the Following feed
  // turns out empty (Mine should never need them).
  useEffect(() => {
    if (loading || feedError || annotations.length > 0 || suggestions.length > 0) return;
    if (tab !== 'following') return;
    api.get('/discover')
      .then(r => setSuggestions((r.data?.peopleToFollow || []).slice(0, 6)))
      .catch(() => { /* non-blocking */ });
  }, [loading, feedError, annotations.length, suggestions.length, tab]);

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !fetchingMore && !loading) {
          const nextPage = page + 1;
          setPage(nextPage);
          fetchFeed(nextPage);
        }
      },
      { threshold: 0.1 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  }, [hasMore, fetchingMore, loading, page, fetchFeed]);


  const renderAnnotationAction = useCallback((annotation: Annotation) => {
    let domainName = annotation.linkDomain;
    if (!domainName) {
      try { domainName = new URL(annotation.url).hostname.replace('www.', ''); } catch { domainName = annotation.url; }
    }

    if (annotation.text?.trim()) {
      return <span>shared a thought on <a href={annotation.url} target="_blank" rel="noreferrer" style={{ color: '#6EB781', textDecoration: 'none' }} className="hover:underline">{domainName}</a></span>;
    }
    return <span>annotated <a href={annotation.url} target="_blank" rel="noreferrer" style={{ color: '#6EB781', textDecoration: 'none' }} className="hover:underline">{domainName}</a></span>;
  }, []);

  const renderAvatar = useCallback((annotationUser: AnnotationUser, size = 36) => {
    return <Avatar user={annotationUser} size={size} />;
  }, []);

  return (
    <div style={{ ...bodyFont, minHeight: '100vh', background: '#121212', color: '#fff' }}>
      <Navbar />

      <div style={{ maxWidth: '700px', padding: '32px 20px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div>
            <h1 style={{ ...brandFont, fontSize: '20px', fontWeight: 600, color: '#fff', marginBottom: '4px' }}>
              The Feed
            </h1>
            <p style={{ fontSize: '13px', color: '#555', margin: 0 }}>
              Discover what the community is reading and analyzing
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', gap: 20, marginBottom: 24,
          borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 12,
        }}>
          {(['following', 'mine'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: 'none', border: 'none',
                color: tab === t ? '#fff' : '#666',
                fontSize: 15, fontWeight: tab === t ? 600 : 500,
                cursor: 'pointer', position: 'relative', padding: '0 4px',
                fontFamily: 'inherit', textTransform: 'capitalize',
              }}
            >
              {t}
              {tab === t && <div style={{ position: 'absolute', bottom: -13, left: 0, right: 0, height: 2, background: '#6EB781', borderRadius: 2 }} />}
            </button>
          ))}
        </div>

        {/* States */}
        {loading ? (
          <FeedSkeleton />
        ) : feedError ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#555' }}>
            <p style={{ fontSize: '14px', marginBottom: '16px' }}>Failed to load feed</p>
            <button
              onClick={() => { setFeedError(false); setAnnotations([]); setPage(0); setHasMore(true); fetchFeed(0, true); }}
              style={{ padding: '8px 20px', fontSize: '13px', fontWeight: 600, background: 'rgba(110,183,129,0.12)', color: '#6EB781', border: '1px solid rgba(110,183,129,0.25)', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Try again
            </button>
          </div>
        ) : annotations.length === 0 ? (
          tab === 'mine' ? (
            <div style={{ padding: '40px 0', color: '#888' }}>
              <p style={{ fontSize: 14, marginBottom: 6, color: '#aaa' }}>You haven't annotated anything yet</p>
              <p style={{ fontSize: 12, color: '#555' }}>
                Install the Scholic extension and start highlighting on the web.
              </p>
            </div>
          ) : (
            <div style={{ padding: '40px 0', color: '#888' }}>
              <p style={{ fontSize: 14, marginBottom: 6, color: '#aaa' }}>Your feed is empty</p>
              <p style={{ fontSize: 12, color: '#555', marginBottom: 24 }}>
                Follow other scholars to see their annotations here, or
                {' '}<a href="/discover" style={{ color: '#6EB781', textDecoration: 'none' }}>browse Discover →</a>
              </p>
              {suggestions.length > 0 && (
                <>
                  <p style={{ fontSize: 12, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
                    Suggested scholars
                  </p>
                  <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, margin: '0 -20px', padding: '0 20px 8px' }}>
                    {suggestions.map(s => (
                      <UserCard key={s.id} user={s} currentUserId={user?.id} isAuthed={!!user} />
                    ))}
                  </div>
                </>
              )}
            </div>
          )
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {annotations.map((annotation) => (
              <AnnotationCard
                key={annotation.id}
                annotation={annotation}
                openComments={openComments}
                toggleComments={toggleComments}
                renderAvatar={renderAvatar as (u: AnnotationUser, s: number) => React.ReactNode}
                renderAnnotationAction={renderAnnotationAction as (a: Annotation) => React.ReactNode}
                handleComment={(id, text) => {
                  submitComment(id, text);
                }}
                fetchMoreComments={fetchMoreComments}
                fetchingComments={fetchingComments}
                currentUser={user as AnnotationUser | null}
                onDeleteAnnotation={deleteAnnotation}
                onEditAnnotation={editAnnotation}
                onDeleteComment={deleteComment}
                onEditComment={editComment}
              />
            ))}

            {/* Pagination Footer */}
            <div ref={observerTarget} style={{ padding: '40px 0', display: 'flex', flexDirection: 'column' }}>
              {fetchingMore && <FeedSkeleton />}
              {!hasMore && annotations.length > 0 && (
                <p style={{ fontSize: '12px', color: '#444', textAlign: 'center' }}>You've reached the end of the feed</p>
              )}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse {
          0% { opacity: 0.4; }
          50% { opacity: 0.7; }
          100% { opacity: 0.4; }
        }
        .pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }

        input::placeholder { color: #444; }
      `}</style>
    </div>
  );
};

export default Feed;
