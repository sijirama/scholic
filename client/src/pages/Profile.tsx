import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Navbar from '../components/Navbar';
import api from '../lib/api';
import { ArrowLeft, Settings } from 'lucide-react';
import AnnotationCard from '../components/AnnotationCard';
import type { Annotation, User as BaseUser, Comment } from '../components/AnnotationCard';
import FollowersModal from '../components/FollowersModal';
import Avatar from '../components/Avatar';
import DocumentUploadModal from '../components/DocumentUploadModal';
import { toast } from 'sonner';

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
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

interface ProfileUser extends BaseUser {
  bio: string;
  memberNumber: number;
  showMemberNumber: boolean;
  createdAt: string;
  followersCount?: number;
  followingCount?: number;
  isFollowing?: boolean;
}

interface UploadedDocument {
  id: number;
  createdAt: string;
  title: string;
  description: string;
  authors: string[];
  tags: string[];
  publishedYear?: number;
  publisher?: string;
  pageCount?: number;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  metadataSource: string;
  user: {
    id: number;
    username: string;
    firstName?: string;
    lastName?: string;
    profilePicture?: string;
  };
}

const ProfileSkeleton: React.FC = () => (
  <div style={{ maxWidth: '700px', padding: '32px 20px', margin: '0 auto' }}>
    <div style={{ display: 'flex', alignItems: 'start', gap: '16px', marginBottom: '32px' }}>
      <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} className="pulse" />
      <div style={{ flex: 1, marginTop: '8px' }}>
        <div style={{ width: '120px', height: '20px', borderRadius: '4px', background: 'rgba(255,255,255,0.04)', marginBottom: '8px' }} className="pulse" />
        <div style={{ width: '60px', height: '14px', borderRadius: '4px', background: 'rgba(255,255,255,0.02)', marginBottom: '12px' }} className="pulse" />
        <div style={{ width: '100%', height: '14px', borderRadius: '4px', background: 'rgba(255,255,255,0.02)' }} className="pulse" />
      </div>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {[1, 2].map(i => (
        <div key={i} style={{ padding: '20px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ width: '140px', height: '14px', borderRadius: '4px', background: 'rgba(255,255,255,0.04)', marginBottom: '12px' }} className="pulse" />
          <div style={{ width: '100%', height: '16px', borderRadius: '4px', background: 'rgba(255,255,255,0.03)', marginBottom: '8px' }} className="pulse" />
          <div style={{ width: '40%', height: '16px', borderRadius: '4px', background: 'rgba(255,255,255,0.03)' }} className="pulse" />
        </div>
      ))}
    </div>
  </div>
);


const Profile: React.FC = () => {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();

  const [profileUser, setProfileUser] = useState<ProfileUser | null>(null);
  const [activity, setActivity] = useState<Annotation[]>([]);
  const [totalActivity, setTotalActivity] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [activeTab, setActiveTab] = useState('Annotations');

  // Recently Read state
  interface RecentSite {
    url: string;
    title: string;
    favicon: string;
    domain: string;
    description: string;
    image: string;
    lastRead: string;
  }
  const [recentlyRead, setRecentlyRead] = useState<RecentSite[]>([]);
  const [recentlyReadLoading, setRecentlyReadLoading] = useState(false);
  const [recentlyReadFetchingMore, setRecentlyReadFetchingMore] = useState(false);
  const [recentlyReadHasMore, setRecentlyReadHasMore] = useState(false);
  const [recentlyReadOffset, setRecentlyReadOffset] = useState(0);
  const RECENTLY_READ_LIMIT = 20;

  // Pagination state
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [fetchingMore, setFetchingMore] = useState(false);
  const observerTarget = useRef<HTMLDivElement>(null);

  // Followers modal state
  const [followersModalOpen, setFollowersModalOpen] = useState(false);
  const [followersModalTab, setFollowersModalTab] = useState<'followers' | 'following'>('followers');

  // Comments state
  const [openComments, setOpenComments] = useState<Record<number, boolean>>({});
  const [commentOffsets, setCommentOffsets] = useState<Record<number, number>>({});
  const [fetchingComments, setFetchingComments] = useState<Record<number, boolean>>({});
  const [followLoading, setFollowLoading] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsFetchingMore, setDocumentsFetchingMore] = useState(false);
  const [documentsHasMore, setDocumentsHasMore] = useState(false);
  const [documentsOffset, setDocumentsOffset] = useState(0);
  const DOCUMENTS_LIMIT = 12;

  const toggleFollow = async () => {
    if (!profileUser || followLoading) return;
    setFollowLoading(true);
    try {
      const response = await api.post(`/users/${profileUser.username}/follow`);
      setProfileUser(prev => {
        if (!prev) return prev;
        const isFollowingNow = response.data.following;
        const diff = isFollowingNow ? 1 : -1;
        return {
          ...prev,
          isFollowing: isFollowingNow,
          followersCount: (prev.followersCount || 0) + diff
        };
      });
    } catch {
      toast.error('Failed to toggle follow');
    } finally {
      setFollowLoading(false);
    }
  };

  const deleteAnnotation = async (id: number) => {
    try {
      await api.delete(`/annotations/${id}`);
      setActivity(prev => prev.filter(a => a.id !== id));
      toast.success('Annotation deleted');
    } catch {
      toast.error('Failed to delete annotation');
    }
  };

  const editAnnotation = async (id: number, text: string) => {
    try {
      await api.put(`/annotations/${id}`, { text });
      setActivity(prev => prev.map(a => a.id === id ? { ...a, text } : a));
      toast.success('Annotation updated');
    } catch {
      toast.error('Failed to update annotation');
    }
  };

  const deleteComment = async (annotationId: number, commentId: number) => {
    try {
      await api.delete(`/annotations/${annotationId}/comments/${commentId}`);
      setActivity(prev => prev.map(a => {
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
      setActivity(prev => prev.map(a => {
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

  const fetchProfile = useCallback(async (pageNum: number, isInitial = false) => {
    if (isInitial) setLoading(true);
    else setFetchingMore(true);
    setError('');
    try {
      const limit = 20;
      const offset = pageNum * limit;
      const response = await api.get(`/users/${username}?limit=${limit}&offset=${offset}`);

      const total = response.data.totalActivity || 0;
      if (isInitial) {
        setProfileUser(response.data.user);
        setTotalActivity(total);
      }
      setActivity(prev => {
        const next = isInitial ? (response.data.activity || []) : [...prev, ...(response.data.activity || [])];
        setHasMore(next.length < total);
        return next;
      });
    } catch (err: unknown) {
      if (isInitial) {
        const axiosError = err as { response?: { data?: { error?: string } } };
        setError(axiosError.response?.data?.error || 'User not found');
      } else {
        toast.error('Failed to load more activity');
      }
    } finally {
      setLoading(false);
      setFetchingMore(false);
    }
  }, [username]);

  useEffect(() => {
    setActivity([]);
    setPage(0);
    setHasMore(true);
    // Reset recently-read when navigating to a different profile
    setRecentlyRead([]);
    setRecentlyReadOffset(0);
    setRecentlyReadHasMore(false);
    setDocuments([]);
    setDocumentsOffset(0);
    setDocumentsHasMore(false);
    setActiveTab('Annotations');
    fetchProfile(0, true);
  }, [username, fetchProfile]);

  // Infinite scroll for activity
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !fetchingMore && !loading && activeTab === 'Annotations') {
          const nextPage = page + 1;
          setPage(nextPage);
          fetchProfile(nextPage);
        }
      },
      { threshold: 0.1 }
    );
    if (observerTarget.current) observer.observe(observerTarget.current);
    return () => observer.disconnect();
  }, [hasMore, fetchingMore, loading, page, username, activeTab, fetchProfile]);

  const isOwnProfile = currentUser?.username === username;
  const tabs = ['Annotations', 'Recently Read', 'Uploaded'];

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    // Lazy-fetch recently read on first switch to that tab
    if (tab === 'Recently Read' && recentlyRead.length === 0 && !recentlyReadLoading) {
      setRecentlyReadLoading(true);
      api.get(`/users/${username}/recently-read?limit=${RECENTLY_READ_LIMIT}&offset=0`)
        .then(res => {
          setRecentlyRead(res.data.sites || []);
          setRecentlyReadHasMore(res.data.hasMore ?? false);
          setRecentlyReadOffset(res.data.sites?.length ?? 0);
        })
        .catch(() => toast.error('Failed to load recently read'))
        .finally(() => setRecentlyReadLoading(false));
    }
    if (tab === 'Uploaded' && documents.length === 0 && !documentsLoading) {
      setDocumentsLoading(true);
      api.get(`/users/${username}/documents?limit=${DOCUMENTS_LIMIT}&offset=0`)
        .then(res => {
          const rows = res.data.documents || [];
          setDocuments(rows);
          setDocumentsHasMore(res.data.hasMore ?? false);
          setDocumentsOffset(rows.length);
        })
        .catch(() => toast.error('Failed to load documents'))
        .finally(() => setDocumentsLoading(false));
    }
  };

  const loadMoreRecentlyRead = () => {
    if (recentlyReadFetchingMore || !recentlyReadHasMore) return;
    setRecentlyReadFetchingMore(true);
    api.get(`/users/${username}/recently-read?limit=${RECENTLY_READ_LIMIT}&offset=${recentlyReadOffset}`)
      .then(res => {
        const newSites = res.data.sites || [];
        setRecentlyRead(prev => [...prev, ...newSites]);
        setRecentlyReadHasMore(res.data.hasMore ?? false);
        setRecentlyReadOffset(prev => prev + newSites.length);
      })
      .catch(() => toast.error('Failed to load more'))
      .finally(() => setRecentlyReadFetchingMore(false));
  };

  const loadMoreDocuments = () => {
    if (documentsFetchingMore || !documentsHasMore) return;
    setDocumentsFetchingMore(true);
    api.get(`/users/${username}/documents?limit=${DOCUMENTS_LIMIT}&offset=${documentsOffset}`)
      .then(res => {
        const rows = res.data.documents || [];
        setDocuments(prev => [...prev, ...rows]);
        setDocumentsHasMore(res.data.hasMore ?? false);
        setDocumentsOffset(prev => prev + rows.length);
      })
      .catch(() => toast.error('Failed to load more documents'))
      .finally(() => setDocumentsFetchingMore(false));
  };


  const renderAnnotationAction = useCallback((annotation: Annotation) => {
    let domainName = annotation.linkDomain;
    if (!domainName) {
      try { domainName = new URL(annotation.url).hostname.replace('www.', ''); } catch { domainName = annotation.url; }
    }

    if (annotation.text && annotation.text.trim()) {
      return <span>shared a thought on <a href={annotation.url} target="_blank" rel="noreferrer" style={{color: '#6EB781', textDecoration: 'none'}} className="hover:underline">{domainName}</a></span>;
    }
    return <span>annotated <a href={annotation.url} target="_blank" rel="noreferrer" style={{color: '#6EB781', textDecoration: 'none'}} className="hover:underline">{domainName}</a></span>;
  }, []);

  const renderAvatar = useCallback((annotationUser: BaseUser, size = 36) => {
    return <Avatar user={annotationUser} size={size} />;
  }, []);

  const submitComment = async (annotationId: number, text: string) => {
    if (!text?.trim()) return;
    try {
      const response = await api.post(`/annotations/${annotationId}/comments`, { text });
      setActivity(prev => prev.map(ann => {
        if (ann.id === annotationId) {
          return {
            ...ann,
            comments: [...(ann.comments || []), response.data],
            commentCount: (ann.commentCount || 0) + 1
          };
        }
        return ann;
      }));
      setCommentOffsets(prev => ({ ...prev, [annotationId]: (prev[annotationId] || (activity.find(a => a.id === annotationId)?.comments?.length || 0)) + 1 }));
    } catch {
      toast.error('Failed to post comment');
    }
  };

  const fetchMoreComments = async (annotationId: number) => {
    if (fetchingComments[annotationId]) return;
    setFetchingComments(prev => ({ ...prev, [annotationId]: true }));
    const currentOffset = commentOffsets[annotationId] !== undefined ? commentOffsets[annotationId] : (activity.find(a => a.id === annotationId)?.comments?.length || 0);
    try {
      const response = await api.get(`/annotations/${annotationId}/comments?limit=10&offset=${currentOffset}`);
      const newComments = response.data.comments || [];
      setActivity(prev => prev.map(ann => {
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

  if (loading) {
    return (
      <div className="min-h-screen w-full" style={{ ...bodyFont, background: '#121212', color: '#fff' }}>
        <Navbar />
        <ProfileSkeleton />
        <style>{`
          @keyframes pulse {
            0% { opacity: 0.4; }
            50% { opacity: 0.7; }
            100% { opacity: 0.4; }
          }
          .pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        `}</style>
      </div>
    );
  }

  if (error || !profileUser) {
    return (
      <div className="min-h-screen w-full" style={{ ...bodyFont, background: '#121212', color: '#fff' }}>
        <Navbar />
        <div className="text-center" style={{ padding: '60px 0', color: '#555', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <p style={{ fontSize: '14px' }}>{error || 'User not found'}</p>
          {error && (
            <button
              onClick={() => { setError(''); fetchProfile(0, true); }}
              style={{ padding: '8px 20px', fontSize: '13px', fontWeight: 600, background: 'rgba(110,183,129,0.12)', color: '#6EB781', border: '1px solid rgba(110,183,129,0.25)', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  const initial = profileUser.username?.[0]?.toUpperCase() || profileUser.firstName?.[0]?.toUpperCase() || '?';

  return (
    <div className="min-h-screen w-full" style={{ ...bodyFont, background: '#121212', color: '#fff' }}>
      <Navbar />

      <div className="mx-auto" style={{ maxWidth: '700px', padding: '32px 20px', margin: '0 auto' }}>
        {/* Back and Settings */}
        <div className="flex justify-between items-center" style={{ marginBottom: '24px' }}>
          <button
            onClick={() => navigate(-1)}
            className="p-1 -ml-1 rounded-md hover:bg-white/5 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" style={{ color: '#999' }} />
          </button>
          {isOwnProfile && (
            <button
              onClick={() => navigate('/settings')}
              className="p-1 rounded-md hover:bg-white/5 transition-colors cursor-pointer"
            >
              <Settings className="w-5 h-5" style={{ color: '#999' }} />
            </button>
          )}
          {!isOwnProfile && currentUser && profileUser && (
            <button
              onClick={toggleFollow}
              disabled={followLoading}
              style={{
                padding: '6px 16px',
                fontSize: '13px',
                fontWeight: 600,
                borderRadius: '20px',
                border: profileUser.isFollowing ? '1px solid #555' : 'none',
                background: profileUser.isFollowing ? 'transparent' : '#fff',
                color: profileUser.isFollowing ? '#ccc' : '#000',
                cursor: followLoading ? 'wait' : 'pointer',
                opacity: followLoading ? 0.6 : 1,
                transition: 'all 0.2s',
              }}
              className="hover:opacity-90 ml-auto"
            >
              {profileUser.isFollowing ? 'Following' : 'Follow'}
            </button>
          )}
        </div>

        {/* Profile Info Header */}
        <div className="flex items-start gap-4" style={{ marginBottom: '32px' }}>
          <div
            className="flex items-center justify-center overflow-hidden flex-shrink-0"
            style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: profileUser.profilePicture ? 'transparent' : 'linear-gradient(135deg, rgba(110,183,129,0.3), rgba(71,163,232,0.3))',
              border: profileUser.profilePicture ? 'none' : '2px solid rgba(110,183,129,0.2)',
              fontSize: '28px',
              fontWeight: 700,
              color: '#fff',
            }}
          >
            {profileUser.profilePicture ? (
              <img src={profileUser.profilePicture} alt={profileUser.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              initial
            )}
          </div>
          <div className="flex-1 mt-1">
            <div className="flex items-center gap-2 mb-1">
              <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#fff' }}>
                {profileUser.firstName ? `${profileUser.firstName} ${profileUser.lastName || ''}` : profileUser.username}
              </h1>
              {profileUser.showMemberNumber && profileUser.memberNumber > 0 && (
                <span
                  style={{
                    backgroundColor: 'rgba(232,197,71,0.15)',
                    color: '#e8c547',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 700,
                  }}
                >
                  #{profileUser.memberNumber}
                </span>
              )}
            </div>
            <div style={{ fontSize: '13px', color: '#999', marginBottom: '8px' }}>
              @{profileUser.username}
            </div>
            {profileUser.bio && (
              <div style={{ fontSize: '13px', color: '#ccc', marginBottom: '12px', lineHeight: 1.5 }}>
                {profileUser.bio}
              </div>
            )}
            <div className="flex items-center gap-4" style={{ fontSize: '12px', color: '#888' }}>
              <span><strong style={{ color: '#fff' }}>{totalActivity}</strong> notes</span>
              <span
                onClick={() => { setFollowersModalTab('followers'); setFollowersModalOpen(true); }}
                style={{ cursor: 'pointer', transition: 'color 0.15s' }}
                className="hover:text-white"
              >
                <strong style={{ color: '#fff' }}>{profileUser.followersCount || 0}</strong> followers
              </span>
              <span
                onClick={() => { setFollowersModalTab('following'); setFollowersModalOpen(true); }}
                style={{ cursor: 'pointer', transition: 'color 0.15s' }}
                className="hover:text-white"
              >
                <strong style={{ color: '#fff' }}>{profileUser.followingCount || 0}</strong> following
              </span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center justify-between gap-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: '24px' }}>
          <div className="flex items-center gap-4">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => handleTabChange(tab)}
                className="transition-colors cursor-pointer"
                style={{
                  padding: '10px 0',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: activeTab === tab ? '#6EB781' : '#666',
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTab === tab ? '2px solid #6EB781' : '2px solid transparent',
                  marginBottom: '-1px',
                }}
              >
                {tab}
              </button>
            ))}
          </div>
          {isOwnProfile && activeTab === 'Uploaded' && (
            <button
              onClick={() => setUploadModalOpen(true)}
              style={{ marginBottom: 10, padding: '9px 14px', borderRadius: 999, background: 'rgba(110,183,129,0.12)', border: '1px solid rgba(110,183,129,0.22)', color: '#6EB781', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Add document
            </button>
          )}
        </div>

        {/* Tab Content */}
        {activeTab === 'Annotations' && (
          <div>
            {activity.length === 0 ? (
              <div className="text-center" style={{ padding: '60px 0', color: '#555' }}>
                {isOwnProfile ? (
                  <>
                    <p style={{ fontSize: '14px', marginBottom: '6px' }}>You haven't made any annotations yet</p>
                    <p style={{ fontSize: '12px', color: '#444' }}>Install the Scholic extension to start annotating the web</p>
                  </>
                ) : (
                  <p style={{ fontSize: '14px', marginBottom: '6px' }}>This user hasn't made any annotations yet</p>
                )}
              </div>
            ) : (
              <div className="flex flex-col" style={{ gap: '8px' }}>
                {activity.map((annotation) => (
                  <AnnotationCard
                    key={annotation.id}
                    annotation={annotation}
                    openComments={openComments}
                    toggleComments={(id) => setOpenComments(prev => ({ ...prev, [id]: !prev[id] }))}
                    renderAvatar={renderAvatar as (u: BaseUser, s: number) => React.ReactNode}
                    renderAnnotationAction={renderAnnotationAction as (a: Annotation) => React.ReactNode}
                    handleComment={(id, text) => submitComment(id, text)}
                    fetchMoreComments={fetchMoreComments}
                    fetchingComments={fetchingComments}
                    currentUser={currentUser as BaseUser | null}
                    onDeleteAnnotation={deleteAnnotation}
                    onEditAnnotation={editAnnotation}
                    onDeleteComment={deleteComment}
                    onEditComment={editComment}
                  />
                ))}

                {/* Pagination Footer */}
                <div ref={observerTarget} style={{ padding: '40px 0', display: 'flex', flexDirection: 'column' }}>
                  {fetchingMore && <ProfileSkeleton />}
                  {!hasMore && activity.length > 0 && (
                    <p style={{ fontSize: '12px', color: '#444', textAlign: 'center' }}>You've reached the end of the activity</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Recently Read tab */}
        {activeTab === 'Recently Read' && (
          <div>
            {recentlyReadLoading ? (
              /* Skeleton */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[1, 2, 3, 4].map(i => (
                  <div key={i} style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', overflow: 'hidden', background: 'rgba(255,255,255,0.02)', padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <div style={{ width: '14px', height: '14px', borderRadius: '3px', background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} className="pulse" />
                      <div style={{ width: '80px', height: '11px', borderRadius: '3px', background: 'rgba(255,255,255,0.05)' }} className="pulse" />
                    </div>
                    <div style={{ width: '75%', height: '13px', borderRadius: '3px', background: 'rgba(255,255,255,0.06)', marginBottom: '6px' }} className="pulse" />
                    <div style={{ width: '55%', height: '11px', borderRadius: '3px', background: 'rgba(255,255,255,0.04)' }} className="pulse" />
                  </div>
                ))}
              </div>
            ) : recentlyRead.length === 0 ? (
              <div className="text-center" style={{ padding: '60px 0', color: '#555' }}>
                <p style={{ fontSize: '14px', marginBottom: '6px' }}>
                  {isOwnProfile ? "You haven't annotated any pages yet" : 'No public annotations yet'}
                </p>
                {isOwnProfile && (
                  <p style={{ fontSize: '12px', color: '#444' }}>Install the Scholic extension to start annotating the web</p>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '11px',
                    color: '#666',
                    padding: '0 2px 4px',
                    letterSpacing: '0.02em',
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  <span>Sorted by most recent visit</span>
                </div>
                {recentlyRead.map((site, idx) => {
                  let displayDomain = site.domain;
                  if (!displayDomain) {
                    try { displayDomain = new URL(site.url).hostname.replace('www.', ''); } catch { displayDomain = site.url; }
                  }
                  const displayTitle = site.title || displayDomain;
                  const sitePageUrl = `/page?url=${encodeURIComponent(site.url)}&author=${encodeURIComponent(username || '')}`;

                  return (
                    <div
                      key={idx}
                      style={{ border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px', overflow: 'hidden', background: 'rgba(255,255,255,0.02)' }}
                    >
                      {/* Mini preview card */}
                      <a
                        href={site.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ display: 'flex', alignItems: 'stretch', gap: '0', textDecoration: 'none', color: 'inherit' }}
                        className="hover:bg-white/[0.03] transition-colors"
                      >
                        {/* Text content */}
                        <div style={{ flex: 1, minWidth: 0, padding: '12px 14px' }}>
                          {/* Favicon + domain */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px' }}>
                            {site.favicon ? (
                              <img
                                src={site.favicon}
                                alt=""
                                style={{ width: '13px', height: '13px', borderRadius: '2px', objectFit: 'contain', flexShrink: 0 }}
                                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                              />
                            ) : (
                              <div style={{ width: '13px', height: '13px', borderRadius: '2px', background: 'rgba(110,183,129,0.2)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', color: '#6EB781', fontWeight: 700 }}>
                                {displayDomain[0]?.toUpperCase() || '?'}
                              </div>
                            )}
                            <span style={{ fontSize: '11px', color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {displayDomain}
                            </span>
                            {site.lastRead && (
                              <>
                                <span style={{ fontSize: '11px', color: '#444', flexShrink: 0 }}>·</span>
                                <span style={{ fontSize: '11px', color: '#555', flexShrink: 0 }} title={new Date(site.lastRead).toLocaleString()}>
                                  {timeAgo(site.lastRead)}
                                </span>
                              </>
                            )}
                          </div>
                          {/* Title */}
                          <div style={{ fontSize: '13px', fontWeight: 500, color: '#d0d0d0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '3px' }}>
                            {displayTitle}
                          </div>
                          {/* Description */}
                          {site.description && (
                            <div style={{ fontSize: '11px', color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {site.description}
                            </div>
                          )}
                        </div>

                        {/* Thumbnail — only rendered if we have a preview image */}
                        {site.image && (
                          <div style={{ width: '72px', flexShrink: 0, background: `url(${site.image}) center/cover no-repeat`, borderLeft: '1px solid rgba(255,255,255,0.05)' }} />
                        )}
                      </a>

                      {/* Footer: link to filtered site page */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '7px 14px', borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.15)' }}>
                        <a
                          href={sitePageUrl}
                          style={{ fontSize: '11px', color: '#6EB781', textDecoration: 'none', fontWeight: 500 }}
                          className="hover:underline"
                        >
                          see all notes →
                        </a>
                      </div>
                    </div>
                  );
                })}

                {/* Load more */}
                {recentlyReadHasMore && (
                  <div style={{ paddingTop: '16px', display: 'flex', justifyContent: 'center' }}>
                    <button
                      onClick={loadMoreRecentlyRead}
                      disabled={recentlyReadFetchingMore}
                      style={{ padding: '8px 24px', fontSize: '13px', fontWeight: 500, background: 'rgba(110,183,129,0.08)', color: '#6EB781', border: '1px solid rgba(110,183,129,0.2)', borderRadius: '20px', cursor: recentlyReadFetchingMore ? 'not-allowed' : 'pointer', opacity: recentlyReadFetchingMore ? 0.6 : 1, fontFamily: 'inherit' }}
                    >
                      {recentlyReadFetchingMore ? 'Loading...' : 'Load more'}
                    </button>
                  </div>
                )}
                {!recentlyReadHasMore && recentlyRead.length > 0 && (
                  <p style={{ fontSize: '12px', color: '#444', textAlign: 'center', paddingTop: '20px' }}>You've reached the end</p>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'Uploaded' && (
          <div>
            {documentsLoading ? (
              <div style={{ display: 'grid', gap: 12 }}>
                {[1, 2, 3].map((i) => (
                  <div key={i} style={{ borderRadius: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', padding: 18 }}>
                    <div style={{ width: '60%', height: 16, borderRadius: 4, background: 'rgba(255,255,255,0.05)', marginBottom: 10 }} className="pulse" />
                    <div style={{ width: '30%', height: 12, borderRadius: 4, background: 'rgba(255,255,255,0.04)', marginBottom: 14 }} className="pulse" />
                    <div style={{ width: '100%', height: 12, borderRadius: 4, background: 'rgba(255,255,255,0.03)', marginBottom: 6 }} className="pulse" />
                    <div style={{ width: '80%', height: 12, borderRadius: 4, background: 'rgba(255,255,255,0.03)' }} className="pulse" />
                  </div>
                ))}
              </div>
            ) : documents.length === 0 ? (
              <div className="text-center" style={{ padding: '60px 0', color: '#555' }}>
                {isOwnProfile ? (
                  <>
                    <p style={{ fontSize: '14px', marginBottom: '6px' }}>You haven't uploaded any PDFs yet</p>
                    <p style={{ fontSize: '12px', color: '#444' }}>Add one and Scholic will prefill the metadata for you.</p>
                  </>
                ) : (
                  <p style={{ fontSize: '14px', marginBottom: '6px' }}>This user hasn't uploaded any documents yet</p>
                )}
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {documents.map((documentRecord) => (
                  <div
                    key={documentRecord.id}
                    style={{ borderRadius: 18, border: '1px solid rgba(255,255,255,0.07)', background: 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.02))', padding: 18, cursor: 'pointer' }}
                    onClick={() => navigate(`/document/${documentRecord.id}`)}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                      <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(110,183,129,0.12)', border: '1px solid rgba(110,183,129,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6EB781', fontWeight: 800, flexShrink: 0 }}>
                        PDF
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                          <h3 style={{ margin: 0, fontFamily: '"Outfit", sans-serif', fontSize: 20, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{documentRecord.title}</h3>
                          {documentRecord.publishedYear && (
                            <span style={{ fontSize: 11, color: '#777', flexShrink: 0 }}>{documentRecord.publishedYear}</span>
                          )}
                        </div>
                        {documentRecord.authors.length > 0 && (
                          <div style={{ fontSize: 13, color: '#aaa', marginBottom: 8 }}>
                            {documentRecord.authors.join(', ')}
                          </div>
                        )}
                        {documentRecord.description && (
                          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#777', lineHeight: 1.6 }}>
                            {documentRecord.description}
                          </p>
                        )}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                          {documentRecord.publisher && (
                            <span style={{ padding: '4px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.04)', fontSize: 11, color: '#888' }}>
                              {documentRecord.publisher}
                            </span>
                          )}
                          {documentRecord.pageCount ? (
                            <span style={{ padding: '4px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.04)', fontSize: 11, color: '#888' }}>
                              {documentRecord.pageCount} pages
                            </span>
                          ) : null}
                          {documentRecord.tags.slice(0, 4).map((tag) => (
                            <span key={tag} style={{ padding: '4px 10px', borderRadius: 999, background: 'rgba(71,163,232,0.12)', border: '1px solid rgba(71,163,232,0.18)', fontSize: 11, color: '#8cc7f0' }}>
                              {tag}
                            </span>
                          ))}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                          <span style={{ fontSize: 11, color: '#555' }}>{documentRecord.fileName}</span>
                          <div style={{ display: 'flex', gap: 10 }}>
                            <a
                              href={documentRecord.fileUrl}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              style={{ fontSize: 12, color: '#6EB781', textDecoration: 'none', fontWeight: 600 }}
                            >
                              Read PDF
                            </a>
                            <span style={{ fontSize: 12, color: '#444' }}>View details →</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {documentsHasMore && (
                  <div style={{ paddingTop: '12px', display: 'flex', justifyContent: 'center' }}>
                    <button
                      onClick={loadMoreDocuments}
                      disabled={documentsFetchingMore}
                      style={{ padding: '8px 24px', fontSize: '13px', fontWeight: 500, background: 'rgba(110,183,129,0.08)', color: '#6EB781', border: '1px solid rgba(110,183,129,0.2)', borderRadius: '20px', cursor: documentsFetchingMore ? 'not-allowed' : 'pointer', opacity: documentsFetchingMore ? 0.6 : 1, fontFamily: 'inherit' }}
                    >
                      {documentsFetchingMore ? 'Loading...' : 'Load more'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {profileUser && (
        <FollowersModal
          open={followersModalOpen}
          onClose={() => setFollowersModalOpen(false)}
          username={profileUser.username}
          initialTab={followersModalTab}
          currentUserId={currentUser?.id}
          followersCount={profileUser.followersCount || 0}
          followingCount={profileUser.followingCount || 0}
        />
      )}
      <DocumentUploadModal
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onCreated={(documentRecord) => {
          setDocuments(prev => [documentRecord, ...prev]);
          setDocumentsOffset(prev => prev + 1);
          setActiveTab('Uploaded');
        }}
      />
    </div>
  );
};

export default Profile;
