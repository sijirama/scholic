import React from 'react';
import { MessageCircle, Lock, Send, Trash2, Pencil, MoreHorizontal } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ImageLightbox from './ImageLightbox';

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

function hexToRgba(hex: string, alpha: number): string {
  const h = hex && hex.startsWith('#') && hex.length === 7 ? hex : '#A8D5B5';
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export interface Annotation {
  id: number;
  url: string;
  selectors?: string;
  highlightColor?: string;
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
  isPrivate?: boolean;
}

interface AnnotationCardProps {
  annotation: Annotation;
  openComments: { [key: number]: boolean };
  toggleComments: (id: number) => void;
  renderAvatar: (user: User, size: number) => React.ReactNode;
  renderAnnotationAction: (annotation: Annotation) => React.ReactNode;
  handleComment?: (id: number, text: string) => void;
  fetchMoreComments?: (id: number) => void;
  fetchingComments?: { [key: number]: boolean };
  currentUser?: User | null;
  isProfile?: boolean;
  onDeleteAnnotation?: (id: number) => void;
  onEditAnnotation?: (id: number, text: string) => void;
  onDeleteComment?: (annotationId: number, commentId: number) => void;
  onEditComment?: (annotationId: number, commentId: number, text: string) => void;
}

const DropdownMenu: React.FC<{
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}> = ({ onEdit, onDelete, onClose }) => {
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      style={{
        position: 'absolute',
        right: 0,
        top: '100%',
        marginTop: '4px',
        background: '#1a1a1a',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '8px',
        padding: '4px',
        zIndex: 50,
        minWidth: '120px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onEdit(); onClose(); }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          width: '100%',
          padding: '6px 10px',
          background: 'none',
          border: 'none',
          color: '#ccc',
          fontSize: '12px',
          cursor: 'pointer',
          borderRadius: '6px',
          fontFamily: 'inherit',
          transition: 'background 0.15s',
        }}
        className="hover:bg-white/5"
      >
        <Pencil style={{ width: 12, height: 12 }} />
        Edit
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); onClose(); }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          width: '100%',
          padding: '6px 10px',
          background: 'none',
          border: 'none',
          color: '#ccc',
          fontSize: '12px',
          cursor: 'pointer',
          borderRadius: '6px',
          fontFamily: 'inherit',
          transition: 'all 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = '#ff5f57'; e.currentTarget.style.background = 'rgba(255,95,87,0.08)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = '#ccc'; e.currentTarget.style.background = 'none'; }}
      >
        <Trash2 style={{ width: 12, height: 12 }} />
        Delete
      </button>
    </div>
  );
};

const TruncatedText: React.FC<{ text: string }> = ({ text }) => {
  const [limit, setLimit] = React.useState(60);
  const words = text.split(/\s+/);
  const isTruncated = words.length > limit;

  const displayText = isTruncated ? words.slice(0, limit).join(' ') + '...' : text;

  return (
    <div>
      <p style={{ fontSize: '14px', color: '#ccc', lineHeight: 1.65, margin: '0 0 12px 0' }}>
        {displayText}
      </p>
      {isTruncated && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setLimit(prev => prev + 120);
          }}
          style={{
            background: 'none',
            border: 'none',
            color: '#6EB781',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            padding: '0',
            marginTop: '-8px',
            marginBottom: '12px',
            fontFamily: 'inherit',
          }}
          className="hover:underline"
        >
          Read more
        </button>
      )}
    </div>
  );
};

const AnnotationCard: React.FC<AnnotationCardProps> = ({
  annotation,
  openComments,
  toggleComments,
  renderAvatar,
  renderAnnotationAction,
  handleComment,
  fetchMoreComments,
  fetchingComments,
  currentUser,
  isProfile = false,
  onDeleteAnnotation,
  onEditAnnotation,
  onDeleteComment,
  onEditComment,
}) => {
  const [commentText, setCommentText] = React.useState('');
  const [lightboxSrc, setLightboxSrc] = React.useState<string | null>(null);
  const [annotationMenuOpen, setAnnotationMenuOpen] = React.useState(false);
  const [editingAnnotation, setEditingAnnotation] = React.useState(false);
  const [editAnnotationText, setEditAnnotationText] = React.useState('');
  const [commentMenuOpen, setCommentMenuOpen] = React.useState<number | null>(null);
  const [editingCommentId, setEditingCommentId] = React.useState<number | null>(null);
  const [editCommentText, setEditCommentText] = React.useState('');

  const isFetching = fetchingComments?.[annotation.id];
  const hasMore = (annotation.commentCount || 0) > (annotation.comments?.length || 0);

  const isAnnotationOwner = currentUser?.id === annotation.user?.id;

  return (
    <div
      style={{ 
        padding: isProfile ? '20px 0' : '20px 0', 
        borderBottom: '1px solid rgba(255,255,255,0.05)' 
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        {annotation.user && renderAvatar(annotation.user, 36)}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
            <a href={`/u/${annotation.user?.username}`} style={{ textDecoration: 'none' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#e0e0e0' }} className="hover:underline">
                @{annotation.user?.username || 'unknown'}
              </span>
            </a>
            <a href={`/annotation/${annotation.id}`} style={{ fontSize: '12px', color: '#444', textDecoration: 'none', transition: 'color 0.15s' }} className="hover:underline">
              {timeAgo(annotation.createdAt)}
            </a>
            {annotation.isPrivate && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)'
                }}
                title="Private Annotation"
              >
                <Lock style={{ width: 10, height: 10, color: '#666' }} />
                <span style={{ fontSize: '10px', fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Private</span>
              </div>
            )}
            {isAnnotationOwner && (onEditAnnotation || onDeleteAnnotation) && (
              <div style={{ marginLeft: 'auto', position: 'relative' }}>
                <button
                  onClick={(e) => { e.stopPropagation(); setAnnotationMenuOpen(prev => !prev); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '2px',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    opacity: 0.4,
                    transition: 'opacity 0.15s',
                  }}
                  className="hover:bg-white/5"
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.4'; }}
                >
                  <MoreHorizontal style={{ width: 16, height: 16, color: '#888' }} />
                </button>
                {annotationMenuOpen && (
                  <DropdownMenu
                    onEdit={() => {
                      setEditingAnnotation(true);
                      setEditAnnotationText(annotation.text || '');
                    }}
                    onDelete={() => onDeleteAnnotation?.(annotation.id)}
                    onClose={() => setAnnotationMenuOpen(false)}
                  />
                )}
              </div>
            )}
          </div>
          
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '12px' }}>
            {renderAnnotationAction(annotation)}
          </div>

          {/* Content: Image or Quote */}
          {annotation.type === 'image' && annotation.imageUrl ? (
            <div
              onClick={() => setLightboxSrc(annotation.imageUrl!)}
              style={{
                borderRadius: '8px',
                overflow: 'hidden',
                marginBottom: '10px',
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.02)',
                cursor: 'zoom-in',
              }}
            >
              <img
                src={annotation.imageUrl}
                alt="Annotation Screenshot"
                style={{ width: '100%', display: 'block' }}
              />
            </div>
          ) : annotation.quoteText && (
            <p style={{
              margin: '0 0 10px 0',
              fontSize: '13px',
              color: '#ddd',
              lineHeight: 1.7,
              fontStyle: 'italic',
              display: '-webkit-box',
              WebkitLineClamp: 5,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}>
              <mark style={{
                background: hexToRgba(annotation.highlightColor || '#A8D5B5', 0.2),
                color: 'inherit',
                borderRadius: '2px',
                padding: '1px 0',
              }}>
                {annotation.quoteText}
              </mark>
            </p>
          )}

          {editingAnnotation ? (
            <div style={{ marginBottom: '12px' }}>
              <textarea
                value={editAnnotationText}
                onChange={(e) => setEditAnnotationText(e.target.value)}
                maxLength={5000}
                rows={3}
                style={{
                  width: '100%',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  fontSize: '14px',
                  color: '#fff',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  lineHeight: 1.65,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(110,183,129,0.4)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
                autoFocus
              />
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button
                  onClick={() => {
                    onEditAnnotation?.(annotation.id, editAnnotationText);
                    setEditingAnnotation(false);
                  }}
                  style={{
                    padding: '4px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    background: '#6EB781',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingAnnotation(false)}
                  style={{
                    padding: '4px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    background: 'rgba(255,255,255,0.06)',
                    color: '#999',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : annotation.text ? (
            <TruncatedText text={annotation.text} />
          ) : null}

          {/* Link Card */}
          <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', overflow: 'hidden', background: 'rgba(255,255,255,0.02)', margin: '0 0 16px 0' }}>
            {annotation.linkImage && (
              <a href={annotation.url} target="_blank" rel="noreferrer">
                <div style={{ width: '100%', height: '180px', background: `url(${annotation.linkImage}) center/cover no-repeat`, borderBottom: '1px solid rgba(255,255,255,0.08)' }} />
              </a>
            )}
            <div style={{ padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                {annotation.linkFavicon && <img src={annotation.linkFavicon} style={{ width: '14px', height: '14px', borderRadius: '2px' }} alt="" />}
                <a
                  href={`/page?url=${encodeURIComponent(annotation.url)}`}
                  style={{ fontSize: '12px', color: '#888', fontWeight: 500, textDecoration: 'none' }}
                  className="hover:underline"
                >
                  {annotation.linkDomain || (() => { try { return new URL(annotation.url).hostname.replace('www.', ''); } catch { return annotation.url; } })()}
                </a>
              </div>
              <a href={annotation.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }} className="hover:bg-white/5">
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#e0e0e0', margin: '0 0 4px 0', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{annotation.linkTitle || annotation.url}</h3>
                {annotation.linkDescription && (
                  <p style={{ fontSize: '12px', color: '#888', margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.5 }}>{annotation.linkDescription}</p>
                )}
              </a>
            </div>
          </div>

          {/* Bottom bar: comment toggle + navigation links */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
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

            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
              <a
                href={`/annotation/${annotation.id}`}
                style={{ fontSize: 11, color: '#444', textDecoration: 'none', fontWeight: 500, transition: 'color 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.color = '#444'; }}
              >
                view annotation →
              </a>
              <a
                href={`/page?url=${encodeURIComponent(annotation.url)}`}
                style={{ fontSize: 11, color: '#444', textDecoration: 'none', fontWeight: 500, transition: 'color 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.color = '#444'; }}
              >
                all on {(() => { try { return annotation.linkDomain || new URL(annotation.url).hostname.replace('www.', ''); } catch { return 'site'; } })()} →
              </a>
            </div>
          </div>

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
                   {handleComment && currentUser && (
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '8px', alignItems: 'center' }}>
                      {renderAvatar(currentUser, 24)}
                      <div
                        style={{
                          flex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: '12px',
                          padding: '4px 4px 4px 14px',
                          gap: '6px',
                        }}
                      >
                        <textarea
                          placeholder="Reply..."
                          value={commentText}
                          maxLength={1000}
                          onChange={(e) => setCommentText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey && commentText.trim()) {
                              e.preventDefault();
                              handleComment(annotation.id, commentText);
                              setCommentText('');
                            }
                          }}
                          rows={1}
                          style={{
                            flex: 1,
                            background: 'none',
                            border: 'none',
                            outline: 'none',
                            fontSize: '13px',
                            color: '#fff',
                            resize: 'none',
                            fontFamily: 'inherit',
                            lineHeight: 1.5,
                            padding: '4px 0',
                          }}
                        />
                        <button
                          onClick={() => {
                            if (commentText.trim()) {
                              handleComment(annotation.id, commentText);
                              setCommentText('');
                            }
                          }}
                          style={{
                            background: commentText.trim() ? '#6EB781' : 'rgba(255,255,255,0.06)',
                            border: 'none',
                            borderRadius: '8px',
                            width: '28px',
                            height: '28px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: commentText.trim() ? 'pointer' : 'default',
                            transition: 'background 0.15s',
                            padding: 0,
                            flexShrink: 0,
                          }}
                        >
                          <Send style={{ width: 14, height: 14, color: commentText.trim() ? '#fff' : '#555' }} />
                        </button>
                      </div>
                    </div>
                  )}

                  {annotation.comments?.map((comment) => {
                    const isCommentOwner = currentUser?.id === comment.user?.id;
                    const isEditingThis = editingCommentId === comment.id;

                    return (
                      <div
                        key={comment.id}
                        style={{ display: 'flex', gap: '10px', position: 'relative' }}
                        className="comment-row"
                      >
                        {renderAvatar(comment.user, 24)}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: '#eee' }}>@{comment.user.username}</span>
                            <span style={{ fontSize: '11px', color: '#444' }}>{timeAgo(comment.createdAt)}</span>
                            {isCommentOwner && (onEditComment || onDeleteComment) && (
                              <div style={{ marginLeft: 'auto', position: 'relative' }}>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setCommentMenuOpen(prev => prev === comment.id ? null : comment.id); }}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    padding: '2px',
                                    borderRadius: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    opacity: 0.4,
                                    transition: 'opacity 0.15s',
                                  }}
                                  className="hover:bg-white/5"
                                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.4'; }}
                                >
                                  <MoreHorizontal style={{ width: 14, height: 14, color: '#888' }} />
                                </button>
                                {commentMenuOpen === comment.id && (
                                  <DropdownMenu
                                    onEdit={() => {
                                      setEditingCommentId(comment.id);
                                      setEditCommentText(comment.text);
                                    }}
                                    onDelete={() => onDeleteComment?.(annotation.id, comment.id)}
                                    onClose={() => setCommentMenuOpen(null)}
                                  />
                                )}
                              </div>
                            )}
                          </div>
                          {isEditingThis ? (
                            <div>
                              <textarea
                                value={editCommentText}
                                onChange={(e) => setEditCommentText(e.target.value)}
                                maxLength={1000}
                                rows={2}
                                style={{
                                  width: '100%',
                                  background: 'rgba(255,255,255,0.03)',
                                  border: '1px solid rgba(255,255,255,0.12)',
                                  borderRadius: '8px',
                                  padding: '8px 10px',
                                  fontSize: '13px',
                                  color: '#fff',
                                  resize: 'vertical',
                                  fontFamily: 'inherit',
                                  lineHeight: 1.5,
                                  outline: 'none',
                                  boxSizing: 'border-box',
                                }}
                                onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(110,183,129,0.4)'; }}
                                onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
                                autoFocus
                              />
                              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                                <button
                                  onClick={() => {
                                    onEditComment?.(annotation.id, comment.id, editCommentText);
                                    setEditingCommentId(null);
                                  }}
                                  style={{
                                    padding: '3px 10px',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    background: '#6EB781',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontFamily: 'inherit',
                                  }}
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingCommentId(null)}
                                  style={{
                                    padding: '3px 10px',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    background: 'rgba(255,255,255,0.06)',
                                    color: '#999',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontFamily: 'inherit',
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p style={{ fontSize: '13px', color: '#bbb', margin: 0, lineHeight: 1.5 }}>{comment.text}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}

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
      {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </div>
  );
};

export default AnnotationCard;
