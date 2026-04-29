import React from 'react';
import { useNavigate } from 'react-router-dom';

export interface TrendingPage {
  url: string;
  title?: string;
  favicon?: string;
  domain?: string;
  description?: string;
  image?: string;
  annotators: number;
  annotations: number;
}

const UrlCard: React.FC<{ page: TrendingPage }> = ({ page }) => {
  const navigate = useNavigate();
  let domain = page.domain;
  if (!domain) {
    try { domain = new URL(page.url).hostname.replace('www.', ''); } catch { domain = page.url; }
  }
  const title = page.title || domain || page.url;

  return (
    <div
      onClick={() => navigate(`/page?url=${encodeURIComponent(page.url)}`)}
      style={{
        flex: '0 0 280px',
        scrollSnapAlign: 'start',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 12,
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'background 0.15s, border-color 0.15s',
        display: 'flex',
        flexDirection: 'column',
      }}
      className="hover:bg-white/5"
    >
      {page.image ? (
        <div style={{ width: '100%', aspectRatio: '16/9', background: '#1a1a1a', overflow: 'hidden' }}>
          <img
            src={page.image}
            alt={title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={e => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }}
          />
        </div>
      ) : null}
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#888' }}>
          {page.favicon && (
            <img
              src={page.favicon}
              alt=""
              style={{ width: 12, height: 12, borderRadius: 2 }}
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{domain}</span>
        </div>
        <div style={{
          fontSize: 14, fontWeight: 600, color: '#e0e0e0',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden', lineHeight: 1.3,
        }}>
          {title}
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', gap: 12, fontSize: 11, color: '#666' }}>
          <span>{page.annotators} {page.annotators === 1 ? 'annotator' : 'annotators'}</span>
          <span>·</span>
          <span>{page.annotations} {page.annotations === 1 ? 'annotation' : 'annotations'}</span>
        </div>
      </div>
    </div>
  );
};

export default UrlCard;
