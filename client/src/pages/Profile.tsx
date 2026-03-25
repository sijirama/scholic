import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Navbar from '../components/Navbar';
import api from '../lib/api';
import { ArrowLeft, Settings, MessageCircle } from 'lucide-react';

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

const CommentSkeleton: React.FC = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
    {[1, 2].map(i => (
      <div key={i} style={{ display: 'flex', gap: '10px' }}>
        <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(255,255,255,0.04)', flexShrink: 0 }} className="pulse" />
        <div style={{ flex: 1 }}>
          <div style={{ width: '60px', height: '12px', borderRadius: '4px', background: 'rgba(255,255,255,0.03)', marginBottom: '6px' }} className="pulse" />
          <div style={{ width: '100%', height: '12px', borderRadius: '4px', background: 'rgba(255,255,255,0.02)' }} className="pulse" />
        </div>
      </div>
    ))}
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
  const [commentInputs, setCommentInputs] = useState<Record<number, string>>({});
  const [commentOffsets, setCommentOffsets] = useState<Record<number, number>>({});
  const [fetchingComments, setFetchingComments] = useState<Record<number, boolean>>({});

  const toggleComments = (annotationId: number) => {
    setOpenComments(prev => ({ ...prev, [annotationId]: !prev[annotationId] }));
  };

  const fetchMoreComments = async (annotationId: number) => {
    if (fetchingComments[annotationId]) return;
    setFetchingComments(prev => ({ ...prev, [annotationId]: true }));
    const currentOffset = commentOffsets[annotationId] || 5;
    
    try {
      const response = await api.get(`/annotations/${annotationId}/comments?limit=10&offset=${currentOffset}`);
      const newComments = response.data.comments || [];
      
      setActivity(prev => prev.map(ann => {
        if (ann.id === annotationId) {
          const existingIds = new Set(ann.comments.map(c => c.id));
          const filteredNew = newComments.filter((c: Comment) => !existingIds.has(c.id));
          return { ...ann, comments: [...ann.comments, ...filteredNew] };
        }
        return ann;
      }));
      setCommentOffsets(prev => ({ ...prev, [annotationId]: currentOffset + newComments.length }));
    } catch (err) {
      console.error('Failed to fetch more comments', err);
    } finally {
      setFetchingComments(prev => ({ ...prev, [annotationId]: false }));
    }
  };

  const handleCommentChange = (annotationId: number, text: string) => {
    setCommentInputs(prev => ({ ...prev, [annotationId]: text }));
  };

  const submitComment = async (annotationId: number) => {
    const text = commentInputs[annotationId];
    if (!text || !text.trim()) return;

    try {
      const response = await api.post(`/annotations/${annotationId}/comments`, { text });
      setActivity(prev => prev.map(ann => {
        if (ann.id === annotationId) {
          const newComments = ann.comments ? [...ann.comments, response.data] : [response.data];
          return { ...ann, comments: newComments, commentCount: ann.commentCount + 1 };
        }
        return ann;
      }));
      setCommentInputs(prev => ({ ...prev, [annotationId]: '' }));
      setCommentOffsets(prev => ({ ...prev, [annotationId]: (prev[annotationId] || 5) + 1 }));
    } catch (err) {
      console.error('Failed to post comment', err);
    }
  };

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

  const renderAnnotationAction = (annotation: Annotation) => {
    let domainName = annotation.linkDomain;
    if (!domainName) {
      try { domainName = new URL(annotation.url).hostname.replace('www.', ''); } catch { domainName = annotation.url; }
    }

    if (annotation.text && annotation.text.trim()) {
      return <span>shared a thought on <a href={annotation.url} target="_blank" rel="noreferrer" style={{color: '#6EB781', textDecoration: 'none'}} className="hover:underline">{domainName}</a></span>;
    }
    return <span>annotated <a href={annotation.url} target="_blank" rel="noreferrer" style={{color: '#6EB781', textDecoration: 'none'}} className="hover:underline">{domainName}</a></span>;
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
                  <div
                    key={annotation.id}
                    style={{
                      padding: '16px 0',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="flex items-center gap-2" style={{ marginBottom: '2px' }}>
                          <span style={{ fontSize: '14px', fontWeight: 600, color: '#e0e0e0' }}>
                            @{profileUser.username}
                          </span>
                          <span style={{ fontSize: '12px', color: '#555' }}>
                            {formatDate(annotation.createdAt)}
                          </span>
                        </div>
                        <div style={{ fontSize: '12px', color: '#666', marginBottom: '10px' }}>
                          {renderAnnotationAction(annotation)}
                        </div>

                        {/* Content: Image or Quote */}
                        {annotation.type === 'image' && annotation.imageUrl ? (
                          <div style={{
                            borderRadius: '8px',
                            overflow: 'hidden',
                            margin: '12px 0',
                            border: '1px solid rgba(255,255,255,0.08)',
                            background: 'rgba(255,255,255,0.02)'
                          }}>
                            <img 
                              src={annotation.imageUrl} 
                              alt="Annotation Screenshot" 
                              style={{ width: '100%', display: 'block' }} 
                            />
                          </div>
                        ) : annotation.quoteText && (
                          <div
                            style={{
                              borderLeft: '2px solid #6EB781',
                              paddingLeft: '12px',
                              margin: '8px 0',
                              fontSize: '13px',
                              color: '#bbb',
                              lineHeight: '1.6',
                              fontStyle: 'italic',
                            }}
                          >
                            {annotation.quoteText}
                          </div>
                        )}

                        {annotation.text && (
                          <p style={{ fontSize: '14px', color: '#ccc', lineHeight: '1.6', marginTop: '8px' }}>
                            {annotation.text}
                          </p>
                        )}

                        {/* Link Card Component */}
                        {annotation.type !== 'image' && (
                          <a href={annotation.url} target="_blank" rel="noreferrer" style={{ display: 'block', textDecoration: 'none', color: 'inherit', margin: '12px 0 16px 0' }}>
                            <div style={{
                              border: '1px solid rgba(255,255,255,0.08)',
                              borderRadius: '8px',
                              overflow: 'hidden',
                              display: 'flex',
                              flexDirection: 'column',
                              background: 'rgba(255,255,255,0.02)',
                              transition: 'background 0.2s',
                            }} className="hover:bg-white/5">
                              {annotation.linkImage && (
                                <div style={{ width: '100%', height: '180px', background: `url(${annotation.linkImage}) center/cover no-repeat`, borderBottom: '1px solid rgba(255,255,255,0.08)' }} />
                              )}
                              <div style={{ padding: '12px 14px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                  {annotation.linkFavicon && <img src={annotation.linkFavicon} style={{ width: '14px', height: '14px', borderRadius: '2px' }} alt="" />}
                                  <span style={{ fontSize: '12px', color: '#888', fontWeight: 500 }}>{annotation.linkDomain || new URL(annotation.url).hostname.replace('www.', '')}</span>
                                </div>
                                <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#e0e0e0', margin: '0 0 4px 0', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{annotation.linkTitle || annotation.url}</h3>
                                {annotation.linkDescription && (
                                  <p style={{ fontSize: '12px', color: '#888', margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.5 }}>{annotation.linkDescription}</p>
                                )}
                              </div>
                            </div>
                          </a>
                        )}

                        <div className="flex items-center gap-5" style={{ marginTop: '12px' }}>
                          <button
                            onClick={() => toggleComments(annotation.id)}
                            className="flex items-center gap-1.5 transition-colors cursor-pointer hover:text-white"
                            style={{ color: '#555', fontSize: '13px', background: 'none', border: 'none' }}
                          >
                            <MessageCircle className="w-4 h-4" />
                            <span>{annotation.commentCount || 0}</span>
                          </button>
                        </div>

                        {openComments[annotation.id] && (
                          <div className="mt-3 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                            {(annotation.comments || []).map(comment => (
                              <div key={comment.id} className="flex items-start gap-3 mb-5">
                                <div className="flex items-center justify-center shrink-0 w-7 h-7 rounded-full overflow-hidden border border-white/10" style={{ background: 'linear-gradient(135deg, rgba(110,183,129,0.3), rgba(71,163,232,0.3))' }}>
                                  {comment.user?.profilePicture ? (
                                    <img src={comment.user.profilePicture} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                  ) : (
                                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#fff' }}>{comment.user?.username?.[0]?.toUpperCase()}</span>
                                  )}
                                </div>
                                <div className="flex-1" style={{ fontSize: '13px', paddingTop: '2px' }}>
                                  <div className="flex items-center gap-2" style={{ marginBottom: '4px' }}>
                                    <span className="font-semibold" style={{ color: '#e0e0e0', fontSize: '14px' }}>@{comment.user?.username}</span>
                                    <span style={{ fontSize: '12px', color: '#666' }}>{formatDate(comment.createdAt)}</span>
                                  </div>
                                  <p style={{ color: '#ccc', lineHeight: '1.5' }}>{comment.text}</p>
                                </div>
                              </div>
                            ))}

                            {/* Load more comments */}
                            {annotation.commentCount > (annotation.comments?.length || 0) && (
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <button
                                  onClick={() => fetchMoreComments(annotation.id)}
                                  disabled={fetchingComments[annotation.id]}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#6EB781',
                                    fontSize: '12px',
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                    padding: '4px 0',
                                    textAlign: 'left',
                                    fontFamily: 'inherit',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    opacity: fetchingComments[annotation.id] ? 0.5 : 1
                                  }}
                                >
                                  View {annotation.commentCount - (annotation.comments?.length || 0)} more comments
                                </button>
                                {fetchingComments[annotation.id] && <CommentSkeleton />}
                              </div>
                            )}
                            
                            {/* New Comment Input */}
                            <div className="flex gap-3 mt-4 items-center">
                              {currentUser && (
                                <div className="flex items-center justify-center shrink-0 w-7 h-7 rounded-full overflow-hidden border border-white/10" style={{ background: 'linear-gradient(135deg, rgba(110,183,129,0.3), rgba(71,163,232,0.3))' }}>
                                  {currentUser.profilePicture ? (
                                    <img src={currentUser.profilePicture} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                  ) : (
                                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#fff' }}>{currentUser.username?.[0]?.toUpperCase()}</span>
                                  )}
                                </div>
                              )}
                              <input
                                type="text"
                                placeholder="Write a comment..."
                                value={commentInputs[annotation.id] || ''}
                                onChange={(e) => handleCommentChange(annotation.id, e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    submitComment(annotation.id);
                                  }
                                }}
                                style={{
                                  flex: 1,
                                  background: '#1a1a1a', 
                                  border: '1px solid rgba(255,255,255,0.08)',
                                  borderRadius: '20px',
                                  padding: '8px 14px',
                                  fontSize: '13px',
                                  color: '#ccc',
                                  outline: 'none',
                                }}
                                className="focus:border-green-500/50 transition-colors"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
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
