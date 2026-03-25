import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Navbar from '../components/Navbar';
import api from '../lib/api';
import { ArrowLeft, Settings } from 'lucide-react';
import AnnotationCard from '../components/AnnotationCard';

interface ProfileUser {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  profilePicture: string;
  bio: string;
  memberNumber: number;
  showMemberNumber: boolean;
  createdAt: string;
  followersCount?: number;
  followingCount?: number;
  isFollowing?: boolean;
}

interface Comment {
  id: number;
  annotationId: number;
  userId: number;
  text: string;
  createdAt: string;
  user: ProfileUser;
}

interface Annotation {
  id: number;
  userId: number;
  url: string;
  text: string;
  quoteText: string;
  isPrivate: boolean;
  createdAt: string;
  user: ProfileUser;
  comments: Comment[];
  commentCount: number;
  
  linkTitle?: string;
  linkDescription?: string;
  linkImage?: string;
  linkFavicon?: string;
  linkDomain?: string;
  type?: string;
  imageUrl?: string;
}

interface AnnotationData {
  id: number;
  userId: number;
  url: string;
  text: string;
  quoteText: string;
  isPrivate: boolean;
  createdAt: string;
  user: {
    id: number;
    username: string;
    firstName: string;
    lastName: string;
    profilePicture: string;
  };
  comments: Comment[];
  commentCount: number;
  linkTitle?: string;
  linkDescription?: string;
  linkImage?: string;
  linkFavicon?: string;
  linkDomain?: string;
  type?: string;
  imageUrl?: string;
}

const ProfileSkeleton: React.FC = () => (
  <div style={{ maxWidth: '640px', padding: '32px 20px', margin: '0 auto' }}>
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [activeTab, setActiveTab] = useState('Annotations');

  // Pagination state
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [fetchingMore, setFetchingMore] = useState(false);
  const observerTarget = useRef<HTMLDivElement>(null);

  // Comments state
  const [openComments, setOpenComments] = useState<Record<number, boolean>>({});

  const [commentOffsets, setCommentOffsets] = useState<Record<number, number>>({});
  const [fetchingComments, setFetchingComments] = useState<Record<number, boolean>>({});

  const toggleFollow = async () => {
    if (!profileUser) return;
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
    } catch (err) {
      console.error('Failed to toggle follow:', err);
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
      }
      setActivity(prev => {
        const next = isInitial ? (response.data.activity || []) : [...prev, ...(response.data.activity || [])];
        setHasMore(next.length < total);
        return next;
      });
    } catch (err: unknown) {
      console.error('Failed to fetch profile:', err);
      if (isInitial) {
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        const axiosError = err as any; 
        setError(axiosError.response?.data?.error || 'User not found');
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
  const tabs = ['Annotations'];

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

  const renderAvatar = useCallback((annotationUser: ProfileUser, size = 36) => {
    const initial = annotationUser.username?.[0]?.toUpperCase() || annotationUser.firstName?.[0]?.toUpperCase() || '?';
    if (annotationUser.profilePicture) {
      return (
        <img
          src={annotationUser.profilePicture}
          alt={annotationUser.username}
          style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
        />
      );
    }
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, rgba(110,183,129,0.5), rgba(71,163,232,0.5))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size * 0.38,
          fontWeight: 700,
          color: '#fff',
          flexShrink: 0,
        }}
      >
        {initial}
      </div>
    );
  }, []);

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
          
          /* Custom Scrollbar */
          body::-webkit-scrollbar {
            width: 8px;
          }
          body::-webkit-scrollbar-track {
            background: #121212;
          }
          body::-webkit-scrollbar-thumb {
            background: rgba(110,183,129,0.2);
            border-radius: 10px;
            border: 2px solid #121212;
          }
          body::-webkit-scrollbar-thumb:hover {
            background: rgba(110,183,129,0.4);
          }
        `}</style>
      </div>
    );
  }

  if (error || !profileUser) {
    return (
      <div className="min-h-screen w-full" style={{ ...bodyFont, background: '#121212', color: '#fff' }}>
        <Navbar />
        <div className="text-center" style={{ padding: '60px 0', color: '#555' }}>
          <p style={{ fontSize: '14px' }}>{error || 'User not found'}</p>
        </div>
      </div>
    );
  }

  const initial = profileUser.username?.[0]?.toUpperCase() || profileUser.firstName?.[0]?.toUpperCase() || '?';

  return (
    <div className="min-h-screen w-full" style={{ ...bodyFont, background: '#121212', color: '#fff' }}>
      <Navbar />

      <div className="mx-auto" style={{ maxWidth: '640px', padding: '32px 20px', margin: '0 auto' }}>
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
              style={{
                padding: '6px 16px',
                fontSize: '13px',
                fontWeight: 600,
                borderRadius: '20px',
                border: profileUser.isFollowing ? '1px solid #555' : 'none',
                background: profileUser.isFollowing ? 'transparent' : '#fff',
                color: profileUser.isFollowing ? '#ccc' : '#000',
                cursor: 'pointer',
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
              <span><strong style={{ color: '#fff' }}>{activity.length}</strong> notes</span>
              <span><strong style={{ color: '#fff' }}>{profileUser.followersCount || 0}</strong> followers</span>
              <span><strong style={{ color: '#fff' }}>{profileUser.followingCount || 0}</strong> following</span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: '24px' }}>
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
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

        {/* Tab Content */}
        {activeTab === 'Annotations' && (
          <div>
            {activity.length === 0 ? (
              <div className="text-center" style={{ padding: '60px 0', color: '#555' }}>
                <p style={{ fontSize: '14px', marginBottom: '6px' }}>No activity yet</p>
                <p style={{ fontSize: '12px', color: '#444' }}>Rankings, notes, and reviews will appear here.</p>
              </div>
            ) : (
              <div className="flex flex-col" style={{ gap: '8px' }}>
                {activity.map((annotation) => (
                  <AnnotationCard
                    key={annotation.id}
                    annotation={annotation as AnnotationData}
                openComments={openComments}
                toggleComments={(id) => setOpenComments(prev => ({ ...prev, [id]: !prev[id] }))}
                renderAvatar={renderAvatar as (user: AnnotationUser) => React.ReactNode}
                renderAnnotationAction={renderAnnotationAction as (a: AnnotationData) => React.ReactNode}
                formatDate={formatDate}
                handleComment={(id, text) => {
                  // Adapt to profile's comment submission logic
                  api.post(`/api/annotations/${id}/comments`, { text }).then(() => {
                    // Update activity list optimistically or refresh
                    setActivity(prev => prev.map(ann => {
                      if (ann.id === id) {
                        return { ...ann, commentCount: ann.commentCount + 1 };
                      }
                      return ann;
                    }));
                  });
                }}
                fetchMoreComments={async (id) => {
                  if (fetchingComments[id]) return;
                  setFetchingComments(prev => ({ ...prev, [id]: true }));
                  const currentOffset = commentOffsets[id] || 5;
                  try {
                    const response = await api.get(`/annotations/${id}/comments?limit=10&offset=${currentOffset}`);
                    const newComments = response.data.comments || [];
                    setActivity(prev => prev.map(ann => {
                      if (ann.id === id) {
                        const existingIds = new Set(ann.comments.map(c => c.id));
                        const filteredNew = newComments.filter((c: Comment) => !existingIds.has(c.id));
                        return { ...ann, comments: [...ann.comments, ...filteredNew] };
                      }
                      return ann;
                    }));
                    setCommentOffsets(prev => ({ ...prev, [id]: currentOffset + newComments.length }));
                  } catch (err) {
                    console.error('Failed to fetch more comments', err);
                  } finally {
                    setFetchingComments(prev => ({ ...prev, [id]: false }));
                  }
                }}
                fetchingComments={fetchingComments}
                currentUser={currentUser as AnnotationUser}
                    isProfile={true}
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

        {/* Other tabs — coming soon */}
        {activeTab !== 'Annotations' && (
          <div className="flex items-center justify-center" style={{ padding: '60px 0', color: '#444' }}>
            <p style={{ fontSize: '14px' }}>{activeTab} coming soon</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Profile;
