import React from 'react';
import { MessageCircle } from 'lucide-react';
import Avatar from './Avatar';
import ReactionStrip from './ReactionStrip';
import MentionText from './MentionText';
import type { Annotation, User as AnnotationUser } from './AnnotationCard';

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

interface SiteAnnotationCardProps {
  annotation: Annotation;
  isSelected: boolean;
  onClick: () => void;
  /** Pass the signed-in user so reactions can decide whether to enable input. */
  canReact?: boolean;
}

const SiteAnnotationCard: React.FC<SiteAnnotationCardProps> = ({ annotation, isSelected, onClick, canReact = false }) => {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '14px 16px',
        borderRadius: 10,
        border: `1px solid ${isSelected ? 'rgba(110,183,129,0.45)' : 'rgba(255,255,255,0.06)'}`,
        background: isSelected ? 'rgba(110,183,129,0.06)' : 'rgba(255,255,255,0.015)',
        cursor: 'pointer',
        transition: 'all 0.2s',
        boxShadow: isSelected ? '0 0 0 1px rgba(110,183,129,0.2), 0 4px 16px rgba(110,183,129,0.08)' : 'none',
        marginBottom: 10,
      }}
    >
      {/* Author + time */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Avatar user={annotation.user as AnnotationUser} size={24} />
        <a
          href={`/u/${annotation.user?.username}`}
          onClick={e => e.stopPropagation()}
          style={{ fontSize: 13, fontWeight: 600, color: '#e0e0e0', textDecoration: 'none' }}
          className="hover:underline"
        >
          @{annotation.user?.username}
        </a>
        <span style={{ fontSize: 11, color: '#555', marginLeft: 'auto' }}>{timeAgo(annotation.createdAt)}</span>
      </div>

      {/* Quote snippet */}
      {annotation.quoteText && (
        <p style={{
          fontSize: 12,
          color: '#888',
          fontStyle: 'italic',
          margin: '0 0 7px',
          lineHeight: 1.6,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          fontFamily: '"Georgia", serif',
          overflowWrap: 'break-word',
          wordBreak: 'break-word',
        }}>
          "{annotation.quoteText}"
        </p>
      )}

      {/* Note snippet */}
      {annotation.text && (
        <p style={{
          fontSize: 16,
          color: '#bbb',
          margin: 0,
          lineHeight: 1.5,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          fontFamily: '"Caveat", cursive',
          overflowWrap: 'break-word',
          wordBreak: 'break-word',
        }}>
          <MentionText text={annotation.text} />
        </p>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', marginTop: 10, gap: 12, flexWrap: 'wrap' }}>
        {(annotation.commentCount || 0) > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#555' }}>
            <MessageCircle style={{ width: 12, height: 12 }} />
            <span style={{ fontSize: 11 }}>{annotation.commentCount}</span>
          </div>
        )}
        <div onClick={e => e.stopPropagation()} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <ReactionStrip
            annotationId={annotation.id}
            reactionCounts={annotation.reactionCounts}
            myReaction={annotation.myReaction}
            canReact={canReact && !annotation.isPrivate}
          />
          <a
            href={`/annotation/${annotation.id}`}
            style={{ fontSize: 11, color: '#555', textDecoration: 'none' }}
            className="hover:text-green-400"
          >
            view →
          </a>
        </div>
      </div>
    </div>
  );
};

export default SiteAnnotationCard;
