import React from 'react';
import { MessageCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface User {
  id: number;
  username: string;
  firstName?: string;
  lastName?: string;
  profilePicture?: string;
}

export interface Comment {
  id: number;
  text: string;
  user: User;
  createdAt: string;
}

export interface Annotation {
  id: number;
  url: string;
  quoteText?: string;
  text?: string;
  type?: string;
  imageUrl?: string;
  linkTitle?: string;
  linkDescription?: string;
  linkImage?: string;
  linkFavicon?: string;
  linkDomain?: string;
  createdAt: string;
  user: User;
  commentCount?: number;
  comments?: Comment[];
}

interface AnnotationCardProps {
  annotation: Annotation;
  openComments: { [key: number]: boolean };
  toggleComments: (id: number) => void;
  renderAvatar: (user: User, size: number) => React.ReactNode;
  renderAnnotationAction: (annotation: Annotation) => React.ReactNode;
  formatDate: (date: string) => string;
  handleComment?: (id: number, text: string) => void;
  fetchMoreComments?: (id: number) => void;
  fetchingComments?: { [key: number]: boolean };
  currentUser?: User | null;
  isProfile?: boolean;
}

const AnnotationCard: React.FC<AnnotationCardProps> = ({
  annotation,
  openComments,
  toggleComments,
  renderAvatar,
  renderAnnotationAction,
  formatDate,
  handleComment,
  fetchMoreComments,
  fetchingComments,
  currentUser,
  isProfile = false,
}) => {
  const [commentText, setCommentText] = React.useState('');

  const isFetching = fetchingComments?.[annotation.id];
  const hasMore = (annotation.commentCount || 0) > (annotation.comments?.length || 0);

  return (
    <div
      style={{ 
        padding: isProfile ? '20px 0' : '20px 0', 
        borderBottom: '1px solid rgba(255,255,255,0.05)' 
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        {!isProfile && annotation.user && renderAvatar(annotation.user, 36)}

        <div style={{ flex: 1, minWidth: 0 }}>
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
          
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '12px' }}>
            {renderAnnotationAction(annotation)}
          </div>

          {/* Content: Image or Quote */}
          {annotation.type === 'image' && annotation.imageUrl ? (
            <div style={{
              borderRadius: '8px',
              overflow: 'hidden',
              marginBottom: '10px',
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
            <div style={{
              borderLeft: '2px solid rgba(110,183,129,0.5)',
              paddingLeft: '12px',
              margin: '0 0 10px 0',
              fontSize: '13px',
              color: '#bbb',
              lineHeight: 1.65,
              fontStyle: 'italic',
            }}>
              {annotation.quoteText}
            </div>
          )}

          {annotation.text && (
            <p style={{ fontSize: '14px', color: '#ccc', lineHeight: 1.65, margin: '0 0 12px 0' }}>
              {annotation.text}
            </p>
          )}

          {/* Link Card */}
          {annotation.type !== 'image' && (
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

          {/* Comments section */}
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
                  gap: '12px'
                }}>
                  {handleComment && (
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
                      {currentUser && renderAvatar(currentUser, 24)}
                      <div style={{ flex: 1 }}>
                        <input
                          type="text"
                          placeholder="Reply..."
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && commentText.trim()) {
                              handleComment(annotation.id, commentText);
                              setCommentText('');
                            }
                          }}
                          style={{
                            width: '100%',
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '20px',
                            padding: '6px 14px',
                            fontSize: '13px',
                            color: '#fff',
                            outline: 'none',
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {annotation.comments?.map((comment) => (
                    <div key={comment.id} style={{ display: 'flex', gap: '10px' }}>
                      {renderAvatar(comment.user, 24)}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: '#eee' }}>@{comment.user.username}</span>
                          <span style={{ fontSize: '11px', color: '#444' }}>{formatDate(comment.createdAt)}</span>
                        </div>
                        <p style={{ fontSize: '13px', color: '#bbb', margin: 0, lineHeight: 1.5 }}>{comment.text}</p>
                      </div>
                    </div>
                  ))}

                  {fetchMoreComments && hasMore && (
                    <div style={{ display: 'flex', flexDirection: 'column', marginTop: '4px' }}>
                      <button
                        onClick={() => fetchMoreComments(annotation.id)}
                        disabled={isFetching}
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
                          opacity: isFetching ? 0.5 : 1
                        }}
                      >
                        View {annotation.commentCount! - (annotation.comments?.length || 0)} more comments
                      </button>
                    </div>
                  )}

                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default AnnotationCard;
