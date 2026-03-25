import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Navbar from '../components/Navbar';
import api from '../lib/api';
import { MessageCircle, SendHorizonal } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface AnnotationUser {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  profilePicture: string;
}

interface Comment {
  id: number;
  annotationId: number;
  userId: number;
  text: string;
  createdAt: string;
  user: AnnotationUser;
}

interface Annotation {
  id: number;
  userId: number;
  url: string;
  text: string;
  quoteText: string;
  isPrivate: boolean;
  createdAt: string;
  user: AnnotationUser;
  comments: Comment[];
  commentCount: number;
  
  linkTitle?: string;
  linkDescription?: string;
  linkImage?: string;
  linkFavicon?: string;
  linkDomain?: string;
}

const Feed: React.FC = () => {
  const { user } = useAuth();
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'global' | 'following'>('global');

  // Pagination state
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [fetchingMore, setFetchingMore] = useState(false);
  const observerTarget = useRef<HTMLDivElement>(null);

  const [openComments, setOpenComments] = useState<Record<number, boolean>>({});
  const [commentInputs, setCommentInputs] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState<Record<number, boolean>>({});
  
  // Track how many comments are loaded per annotation
  // (Backend initially sends 3)
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
          // Merge and avoid duplicates
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
    if (!text?.trim()) return;
    setSubmitting(prev => ({ ...prev, [annotationId]: true }));
    try {
      const response = await api.post(`/annotations/${annotationId}/comments`, { text });
      setAnnotations(prev => prev.map(ann => {
        if (ann.id === annotationId) {
          return { 
            ...ann, 
            comments: [...(ann.comments || []), response.data],
            commentCount: ann.commentCount + 1
          };
        }
        return ann;
      }));
      setCommentInputs(prev => ({ ...prev, [annotationId]: '' }));
      // Increment offset so pagination stays in sync
      setCommentOffsets(prev => ({ ...prev, [annotationId]: (prev[annotationId] || (response.data.annotation?.comments?.length || 0)) + 1 }));
    } catch (err) {
      console.error('Failed to post comment', err);
    } finally {
      setSubmitting(prev => ({ ...prev, [annotationId]: false }));
    }
  };

  const bodyFont = { fontFamily: '"Inter", sans-serif' };
  const brandFont = { fontFamily: '"Outfit", sans-serif' };

  const fetchFeed = useCallback(async (pageNum: number, isInitial = false) => {
    if (isInitial) setLoading(true);
    else setFetchingMore(true);

    try {
      const limit = 20;
      const offset = pageNum * limit;
      const response = await api.get(`/feed?limit=${limit}&offset=${offset}&tab=${tab}`);
      
      const total = response.data.total || 0;
      setAnnotations(prev => {
        const next = isInitial ? (response.data.annotations || []) : [...prev, ...(response.data.annotations || [])];
        setHasMore(next.length < total);
        return next;
      });
    } catch (err) {
      console.error('Failed to fetch feed', err);
    } finally {
      setLoading(false);
      setFetchingMore(false);
    }
  }, [tab]);

  // Reset when tab changes
  useEffect(() => {
    setAnnotations([]);
    setPage(0);
    setHasMore(true);
    fetchFeed(0, true);
  }, [tab, fetchFeed]);

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

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const renderAnnotationAction = (annotation: Annotation) => {
    let domainName = annotation.linkDomain;
    if (!domainName) {
      try { domainName = new URL(annotation.url).hostname.replace('www.', ''); } catch { domainName = annotation.url; }
    }
    
    if (annotation.text?.trim()) {
      return <span>shared a thought on <a href={annotation.url} target="_blank" rel="noreferrer" style={{ color: '#6EB781', textDecoration: 'none' }} className="hover:underline">{domainName}</a></span>;
    }
    return <span>annotated <a href={annotation.url} target="_blank" rel="noreferrer" style={{ color: '#6EB781', textDecoration: 'none' }} className="hover:underline">{domainName}</a></span>;
  };

  const renderAvatar = (annotationUser: AnnotationUser, size = 36) => {
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
  };

  return (
    <div style={{ ...bodyFont, minHeight: '100vh', background: '#121212', color: '#fff' }}>
      <Navbar />

      <div style={{ maxWidth: '640px', padding: '32px 20px', margin: '0 auto' }}>
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
        {user && (
          <div style={{
            display: 'flex', gap: '20px', marginBottom: '24px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px'
          }}>
            <button 
              onClick={() => setTab('global')}
              style={{ background: 'none', border: 'none', color: tab === 'global' ? '#fff' : '#666', fontSize: '15px', fontWeight: tab === 'global' ? 600 : 500, cursor: 'pointer', position: 'relative', padding: '0 4px', fontFamily: 'inherit' }}
            >
              Global
              {tab === 'global' && <div style={{ position: 'absolute', bottom: '-13px', left: 0, right: 0, height: '2px', background: '#6EB781', borderRadius: '2px' }} />}
            </button>
            <button 
              onClick={() => setTab('following')}
              style={{ background: 'none', border: 'none', color: tab === 'following' ? '#fff' : '#666', fontSize: '15px', fontWeight: tab === 'following' ? 600 : 500, cursor: 'pointer', position: 'relative', padding: '0 4px', fontFamily: 'inherit' }}
            >
              Following
              {tab === 'following' && <div style={{ position: 'absolute', bottom: '-13px', left: 0, right: 0, height: '2px', background: '#6EB781', borderRadius: '2px' }} />}
            </button>
          </div>
        )}

        {/* States */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
            <div style={{
              width: '22px', height: '22px',
              border: '2px solid rgba(110,183,129,0.15)',
              borderTopColor: '#6EB781',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
          </div>
        ) : annotations.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#555' }}>
            <p style={{ fontSize: '14px', marginBottom: '6px' }}>No annotations yet</p>
            <p style={{ fontSize: '12px', color: '#444' }}>Start annotating the web with the Scholic extension!</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {annotations.map((annotation) => (
              <div
                key={annotation.id}
                style={{ padding: '20px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
              >
                {/* Author row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  {annotation.user && renderAvatar(annotation.user, 36)}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Name + date */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                      <a href={`/u/${annotation.user?.username}`} style={{ textDecoration: 'none' }}>
                        <span style={{ fontSize: '14px', fontWeight: 600, color: '#e0e0e0' }} className="hover:underline">
                          @{annotation.user?.username || 'unknown'}
                        </span>
                      </a>
                      <span style={{ fontSize: '12px', color: '#444' }}>
                        {formatDate(annotation.createdAt)}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#555', marginBottom: '12px' }}>
                      {renderAnnotationAction(annotation)}
                    </div>

                    {/* Quote */}
                    {annotation.quoteText && (
                      <div style={{
                        borderLeft: '2px solid rgba(110,183,129,0.5)',
                        paddingLeft: '12px',
                        margin: '0 0 10px 0',
                        fontSize: '13px',
                        color: '#888',
                        lineHeight: 1.65,
                        fontStyle: 'italic',
                      }}>
                        {annotation.quoteText}
                      </div>
                    )}

                    {/* Note */}
                    {annotation.text && (
                      <p style={{ fontSize: '14px', color: '#ccc', lineHeight: 1.65, margin: '0 0 12px 0' }}>
                        {annotation.text}
                      </p>
                    )}

                    {/* Link Card */}
                    {(annotation.linkTitle || annotation.linkImage) && (
                      <a href={annotation.url} target="_blank" rel="noreferrer" style={{ display: 'block', textDecoration: 'none', color: 'inherit', margin: '0 0 16px 0' }}>
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

                    {/* Comment toggle */}
                    <button
                      onClick={() => toggleComments(annotation.id)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: openComments[annotation.id] ? '#6EB781' : '#555',
                        fontSize: '13px',
                        padding: '0',
                        transition: 'color 0.15s',
                        fontFamily: 'inherit',
                      }}
                    >
                      <MessageCircle style={{ width: 15, height: 15 }} />
                      <span>{annotation.commentCount || 0}</span>
                    </button>

                    {/* Comments section — animated */}
                    <AnimatePresence initial={false}>
                      {openComments[annotation.id] && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                          style={{ overflow: 'hidden' }}
                        >
                          <div style={{
                            marginTop: '16px',
                            paddingTop: '16px',
                            borderTop: '1px solid rgba(255,255,255,0.05)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '16px',
                          }}>
                            {/* New comment input - Moved ABOVE list */}
                            {user && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                                {renderAvatar({
                                  id: user.id,
                                  username: user.username,
                                  firstName: user.firstName,
                                  lastName: user.lastName,
                                  profilePicture: user.profilePicture,
                                }, 28)}
                                <div style={{
                                  flex: 1,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  background: 'rgba(255,255,255,0.04)',
                                  border: '1px solid rgba(255,255,255,0.07)',
                                  borderRadius: '20px',
                                  padding: '0 6px 0 14px',
                                  transition: 'border-color 0.15s',
                                }}>
                                  <input
                                    ref={el => { inputRefs.current[annotation.id] = el; }}
                                    type="text"
                                    placeholder="Add a comment…"
                                    value={commentInputs[annotation.id] || ''}
                                    onChange={(e) => handleCommentChange(annotation.id, e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') submitComment(annotation.id); }}
                                    onFocus={(e) => {
                                      (e.target.parentElement as HTMLElement).style.borderColor = 'rgba(110,183,129,0.35)';
                                    }}
                                    onBlur={(e) => {
                                      (e.target.parentElement as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)';
                                    }}
                                    style={{
                                      flex: 1,
                                      background: 'none',
                                      border: 'none',
                                      outline: 'none',
                                      fontSize: '13px',
                                      color: '#ccc',
                                      padding: '10px 0',
                                      fontFamily: 'inherit',
                                    }}
                                  />
                                  <button
                                    onClick={() => submitComment(annotation.id)}
                                    disabled={!commentInputs[annotation.id]?.trim() || submitting[annotation.id]}
                                    style={{
                                      width: '30px',
                                      height: '30px',
                                      borderRadius: '50%',
                                      border: 'none',
                                      background: commentInputs[annotation.id]?.trim() ? '#6EB781' : 'transparent',
                                      color: commentInputs[annotation.id]?.trim() ? '#0a0a0a' : '#444',
                                      cursor: commentInputs[annotation.id]?.trim() ? 'pointer' : 'default',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      flexShrink: 0,
                                      transition: 'all 0.15s',
                                      fontFamily: 'inherit',
                                    }}
                                  >
                                    <SendHorizonal style={{ width: 13, height: 13 }} />
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Existing comments */}
                            <AnimatePresence>
                              {(annotation.comments || []).map((comment, i) => (
                                <motion.div
                                  key={comment.id}
                                  initial={{ opacity: 0, y: 6 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ delay: i * 0.04, duration: 0.2 }}
                                  style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}
                                >
                                  <a href={`/u/${comment.user?.username}`} style={{ textDecoration: 'none' }}>
                                    {comment.user && renderAvatar(comment.user, 28)}
                                  </a>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '4px' }}>
                                      <a href={`/u/${comment.user?.username}`} style={{ textDecoration: 'none' }}>
                                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#d0d0d0' }} className="hover:underline">
                                          @{comment.user?.username}
                                        </span>
                                      </a>
                                      <span style={{ fontSize: '11px', color: '#444' }}>
                                        {formatDate(comment.createdAt)}
                                      </span>
                                    </div>
                                    <p style={{ fontSize: '13px', color: '#aaa', lineHeight: 1.6, margin: 0 }}>
                                      {comment.text}
                                    </p>
                                  </div>
                                </motion.div>
                              ))}
                            </AnimatePresence>

                            {/* Load more comments */}
                            {annotation.commentCount > (annotation.comments?.length || 0) && (
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
                                  gap: '8px'
                                }}
                              >
                                {fetchingComments[annotation.id] ? (
                                  <div style={{ width: '12px', height: '12px', border: '1.5px solid rgba(110,183,129,0.2)', borderTopColor: '#6EB781', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                                ) : null}
                                View {annotation.commentCount - (annotation.comments?.length || 0)} more comments
                              </button>
                            )}

                            {/* New comment input - REMOVED from here */}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            ))}

            {/* Pagination Footer */}
            <div ref={observerTarget} style={{ padding: '40px 0', display: 'flex', justifyContent: 'center' }}>
              {fetchingMore && (
                <div style={{
                  width: '20px', height: '20px',
                  border: '2px solid rgba(110,183,129,0.15)',
                  borderTopColor: '#6EB781',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }} />
              )}
              {!hasMore && annotations.length > 0 && (
                <p style={{ fontSize: '12px', color: '#444' }}>You've reached the end of the feed</p>
              )}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input::placeholder { color: #444; }
      `}</style>
    </div>
  );
};

export default Feed;
