import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, ExternalLink, Globe } from 'lucide-react';
import Avatar from '../Avatar';
import ReactionStrip from '../ReactionStrip';
import MentionText from '../MentionText';
import type { Annotation } from '../AnnotationCard';

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

function hexToRgba(hex: string, alpha: number): string {
  const h = hex && hex.startsWith('#') && hex.length === 7 ? hex : '#A8D5B5';
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const DiscoverAnnotationCard: React.FC<{
  annotation: Annotation;
  canReact?: boolean;
}> = ({ annotation, canReact = false }) => {
  const navigate = useNavigate();
  let domainName = annotation.linkDomain;
  if (!domainName) {
    try {
      domainName = new URL(annotation.url).hostname.replace('www.', '');
    } catch {
      domainName = annotation.url;
    }
  }

  return (
    <div
      onClick={() => navigate(`/annotation/${annotation.id}`)}
      style={{
        background: 'linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.02))',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 14,
        padding: '16px 16px 14px',
        cursor: 'pointer',
        transition: 'border-color 0.15s, transform 0.15s, background 0.15s',
        minWidth: 0,
        boxShadow: '0 14px 36px rgba(0,0,0,0.18)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'rgba(110,183,129,0.18)';
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.background = 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.03))';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.background = 'linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.02))';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <a
          href={`/u/${annotation.user?.username}`}
          onClick={(event) => event.stopPropagation()}
          style={{ display: 'inline-flex', textDecoration: 'none' }}
        >
          <Avatar user={annotation.user} size={30} />
        </a>
        <div style={{ minWidth: 0, flex: 1 }}>
          <a
            href={`/u/${annotation.user?.username}`}
            onClick={(event) => event.stopPropagation()}
            style={{ textDecoration: 'none' }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: '#ededed', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              @{annotation.user?.username}
            </div>
          </a>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span style={{ fontSize: 11, color: '#555' }}>{timeAgo(annotation.createdAt)}</span>
          </div>
        </div>
        <a
          href={annotation.url}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          style={{ color: '#666', display: 'inline-flex', flexShrink: 0 }}
        >
          <ExternalLink style={{ width: 14, height: 14 }} />
        </a>
      </div>

      {annotation.quoteText && (
        <div
          style={{
            marginBottom: annotation.text ? 12 : 16,
            padding: '14px 16px',
            borderRadius: 10,
            background: 'rgba(255,255,255,0.025)',
            border: '1px solid rgba(255,255,255,0.045)',
            overflow: 'hidden',
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 15,
              lineHeight: 1.7,
              color: '#e3e3e3',
              fontStyle: 'italic',
              display: '-webkit-box',
              WebkitLineClamp: 5,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            <mark
              style={{
                background: hexToRgba(annotation.highlightColor || '#A8D5B5', 0.18),
                color: 'inherit',
                borderRadius: 2,
                padding: '1px 0',
              }}
            >
              {annotation.quoteText}
            </mark>
          </p>
        </div>
      )}

      {annotation.text && (
        <div
          style={{
            fontSize: 13,
            color: '#a2a2a2',
            lineHeight: 1.62,
            marginBottom: 16,
            display: '-webkit-box',
            WebkitLineClamp: annotation.quoteText ? 3 : 5,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            overflowWrap: 'break-word',
            wordBreak: 'break-word',
          }}
        >
          <MentionText text={annotation.text} />
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          minWidth: 0,
          marginBottom: 14,
          padding: '9px 10px',
          borderRadius: 10,
          background: 'rgba(255,255,255,0.028)',
          border: '1px solid rgba(255,255,255,0.045)',
        }}
      >
        {annotation.linkFavicon ? (
          <img
            src={annotation.linkFavicon}
            alt=""
            style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0 }}
            onError={(event) => {
              event.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <Globe style={{ width: 14, height: 14, color: '#666', flexShrink: 0 }} />
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: '#d9d9d9',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {annotation.linkTitle || domainName}
          </div>
          <div
            style={{
              fontSize: 11,
              color: '#6EB781',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              marginTop: 1,
            }}
          >
            {domainName}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#666' }}>
          <MessageCircle style={{ width: 13, height: 13 }} />
          <span style={{ fontSize: 11 }}>{annotation.commentCount || 0}</span>
        </div>
        <div style={{ marginLeft: 'auto' }} onClick={(event) => event.stopPropagation()}>
          <ReactionStrip
            annotationId={annotation.id}
            reactionCounts={annotation.reactionCounts}
            myReaction={annotation.myReaction}
            canReact={canReact && !annotation.isPrivate}
          />
        </div>
      </div>
    </div>
  );
};

export default DiscoverAnnotationCard;
