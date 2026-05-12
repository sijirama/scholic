import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Navbar from '../components/Navbar';
import api from '../lib/api';
import AnnotationCard from '../components/AnnotationCard';
import type { Annotation, User as AnnotationUser, Comment } from '../components/AnnotationCard';
import Avatar from '../components/Avatar';
import UserCard from '../components/discover/UserCard';
import type { DiscoverAuthor } from '../components/discover/UserCard';
import { Clock, FileText, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useUploadedDoc } from '../lib/uploadedDocs';

interface RecentSite {
  url: string;
  title: string;
  favicon: string;
  domain: string;
  description: string;
  image: string;
  lastRead: string;
}

interface FriendSite extends RecentSite {
  username: string;
  firstName: string;
  lastName: string;
  profilePicture: string;
}

function sidebarTimeAgo(dateStr: string): string {
  if (!dateStr) return '';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const FriendsReadingItem: React.FC<{ site: FriendSite }> = ({ site }) => {
  const uploadedDoc = useUploadedDoc(site.url);
  let displayDomain = site.domain;
  if (!displayDomain) {
    try { displayDomain = new URL(site.url).hostname.replace('www.', ''); } catch { displayDomain = site.url; }
  }
  const title = uploadedDoc?.title || site.title || displayDomain;
  const initial = site.username?.[0]?.toUpperCase() || '?';

  return (
    <a
      href={site.url}
      target="_blank"
      rel="noreferrer"
      style={{ display: 'block', padding: '11px 12px', borderRadius: 10, textDecoration: 'none', color: 'inherit', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', transition: 'background 0.15s, border-color 0.15s' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.045)';
        e.currentTarget.style.borderColor = 'rgba(71,163,232,0.20)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6, minWidth: 0 }}>
        {site.profilePicture ? (
          <img src={site.profilePicture} alt="" style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }} />
        ) : (
          <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'linear-gradient(135deg, rgba(71,163,232,0.3), rgba(110,183,129,0.3))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
            {initial}
          </div>
        )}
        <span style={{ fontSize: 11, color: '#aaa', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>
          @{site.username}
        </span>
        {site.lastRead && (
          <span style={{ fontSize: 10, color: '#444', flexShrink: 0 }}>{sidebarTimeAgo(site.lastRead)}</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4, minWidth: 0 }}>
        {uploadedDoc ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '0px 5px', borderRadius: 3, background: 'rgba(110,183,129,0.10)', border: '1px solid rgba(110,183,129,0.22)', fontSize: 9.5, color: '#6EB781', fontWeight: 600, flexShrink: 0 }}>
            <FileText style={{ width: 8, height: 8 }} />
            PDF
          </span>
        ) : site.favicon ? (
          <img src={site.favicon} alt="" style={{ width: 11, height: 11, borderRadius: 2, objectFit: 'contain', flexShrink: 0 }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
        ) : null}
        <span style={{ fontSize: 10.5, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>
          {displayDomain}
        </span>
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 500, color: '#d4d4d4', lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {title}
      </div>
    </a>
  );
};

const SidebarRecentItem: React.FC<{ site: RecentSite }> = ({ site }) => {
  const uploadedDoc = useUploadedDoc(site.url);
  let displayDomain = site.domain;
  if (!displayDomain) {
    try { displayDomain = new URL(site.url).hostname.replace('www.', ''); } catch { displayDomain = site.url; }
  }
  const title = uploadedDoc?.title || site.title || displayDomain;
  const description = uploadedDoc
    ? (uploadedDoc.authors.length > 0 ? uploadedDoc.authors.join(', ') : '')
    : site.description;

  return (
    <a
      href={site.url}
      target="_blank"
      rel="noreferrer"
      style={{ display: 'block', padding: '11px 12px', borderRadius: 10, textDecoration: 'none', color: 'inherit', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', transition: 'background 0.15s, border-color 0.15s, transform 0.15s' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.045)';
        e.currentTarget.style.borderColor = 'rgba(110,183,129,0.20)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, minWidth: 0 }}>
        {uploadedDoc ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 6px', borderRadius: 4, background: 'rgba(110,183,129,0.10)', border: '1px solid rgba(110,183,129,0.22)', fontSize: 9.5, color: '#6EB781', fontWeight: 600, flexShrink: 0 }}>
            <FileText style={{ width: 9, height: 9 }} />
            PDF
          </span>
        ) : site.favicon ? (
          <img src={site.favicon} alt="" style={{ width: 12, height: 12, borderRadius: 2, objectFit: 'contain', flexShrink: 0 }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
        ) : (
          <div style={{ width: 12, height: 12, borderRadius: 2, background: 'rgba(110,183,129,0.18)', flexShrink: 0 }} />
        )}
        <span style={{ fontSize: 10.5, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>
          {uploadedDoc ? `by @${uploadedDoc.user.username}` : displayDomain}
        </span>
        {site.lastRead && (
          <span style={{ fontSize: 10, color: '#444', flexShrink: 0 }}>{sidebarTimeAgo(site.lastRead)}</span>
        )}
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 500, color: '#d4d4d4', lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginBottom: description ? 4 : 0 }}>
        {title}
      </div>
      {description && (
        <div style={{ fontSize: 11, color: '#666', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {description}
        </div>
      )}
    </a>
  );
};

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

  const [recentSidebar, setRecentSidebar] = useState<RecentSite[]>([]);
  const [recentSidebarLoading, setRecentSidebarLoading] = useState(false);
  const [friendsSidebar, setFriendsSidebar] = useState<FriendSite[]>([]);
  const [friendsSidebarLoading, setFriendsSidebarLoading] = useState(false);

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

  // Pull the user's own "continue reading" list for the left sidebar.
  // Fetched independently from friends-reading so each sidebar has its own
  // loading state and one slow endpoint can't stall the other.
  useEffect(() => {
    if (!user?.username) {
      setRecentSidebar([]);
      setRecentSidebarLoading(false);
      return;
    }
    let cancelled = false;
    setRecentSidebarLoading(true);
    api.get(`/users/${user.username}/recently-read?limit=5&offset=0`)
      .then((res) => { if (!cancelled) setRecentSidebar(res.data.sites || []); })
      .catch(() => { /* non-blocking */ })
      .finally(() => { if (!cancelled) setRecentSidebarLoading(false); });
    return () => { cancelled = true; };
  }, [user?.username]);

  // Pull pages people the user follows have recently annotated for the right
  // sidebar. Fully independent fetch + loading state.
  useEffect(() => {
    if (!user?.username) {
      setFriendsSidebar([]);
      setFriendsSidebarLoading(false);
      return;
    }
    let cancelled = false;
    setFriendsSidebarLoading(true);
    api.get(`/users/${user.username}/friends-reading?limit=5&offset=0`)
      .then((res) => { if (!cancelled) setFriendsSidebar(res.data.sites || []); })
      .catch(() => { /* non-blocking */ })
      .finally(() => { if (!cancelled) setFriendsSidebarLoading(false); });
    return () => { cancelled = true; };
  }, [user?.username]);

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

      {user && (recentSidebar.length > 0 || recentSidebarLoading) && (
        <aside
          className="feed-recent-sidebar"
          style={{
            position: 'fixed',
            // Anchor to the feed: feed left edge is `50% - 350px` (700px centered).
            // 16px gutter so the sidebar reads as adjacent to the feed column.
            top: 170,
            left: 'calc(50% - 350px - 16px - 260px)',
            width: 260,
            maxHeight: 'calc(100vh - 190px)',
            overflowY: 'auto',
            zIndex: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12, padding: '0 4px' }}>
            <Clock style={{ width: 12, height: 12, color: '#6EB781' }} />
            <span style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>Continue reading</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentSidebarLoading && recentSidebar.length === 0
              ? [0, 1, 2].map((i) => (
                  <div key={i} style={{ height: 64, borderRadius: 10, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }} className="pulse" />
                ))
              : recentSidebar.map((site, idx) => (
                  <SidebarRecentItem key={idx} site={site} />
                ))}
          </div>
        </aside>
      )}

      {user && (friendsSidebar.length > 0 || friendsSidebarLoading) && (
        <aside
          className="feed-friends-sidebar"
          style={{
            position: 'fixed',
            top: 170,
            left: 'calc(50% + 350px + 16px)',
            width: 260,
            maxHeight: 'calc(100vh - 190px)',
            overflowY: 'auto',
            zIndex: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12, padding: '0 4px' }}>
            <Users style={{ width: 12, height: 12, color: '#47A3E8' }} />
            <span style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>Friends reading</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {friendsSidebarLoading && friendsSidebar.length === 0
              ? [0, 1, 2].map((i) => (
                  <div key={i} style={{ height: 88, borderRadius: 10, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }} className="pulse" />
                ))
              : friendsSidebar.map((site, idx) => (
                  <FriendsReadingItem key={`${site.url}-${idx}`} site={site} />
                ))}
          </div>
        </aside>
      )}

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

        /* Hide both sidebars when the viewport can't fit them either side of
           the centered 700px feed: 260 + 16 + 700 + 16 + 260 = 1252px, plus
           breathing room. The right (Friends) sidebar drops out first since
           the left (own continue-reading) is the higher-value rail. */
        @media (max-width: 1340px) {
          .feed-friends-sidebar { display: none; }
        }
        @media (max-width: 1080px) {
          .feed-recent-sidebar { display: none; }
        }
      `}</style>
    </div>
  );
};

export default Feed;
