import React from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, Lock, Layers } from 'lucide-react';
import type { CollectionSummary } from '../lib/collections';
import { collectionPrivacyLabel } from '../lib/collections';

interface CollectionCardProps {
  collection: CollectionSummary;
}

const CollectionCard: React.FC<CollectionCardProps> = ({ collection }) => {
  return (
    <Link
      to={`/c/${collection.id}`}
      style={{
        display: 'block',
        border: '1px solid var(--border)',
        borderRadius: 10,
        overflow: 'hidden',
        background: 'var(--surface-inset)',
        textDecoration: 'none',
        color: 'inherit',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-inset)'; }}
    >
      {collection.coverImageUrl && (
        <div
          style={{
            height: 128,
            background: `url(${collection.coverImageUrl}) center ${collection.coverPositionY ?? 50}%/cover no-repeat`,
            borderBottom: '1px solid var(--border)',
          }}
        />
      )}
      <div style={{ padding: '13px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, minWidth: 0 }}>
          <div style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0 }}>
            <Layers style={{ width: 13, height: 13 }} />
          </div>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 650, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
            {collection.title}
          </h3>
        </div>
        {collection.description && (
          <p style={{ margin: '0 0 9px', fontSize: 12, lineHeight: 1.5, color: 'var(--text-dim)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {collection.description}
          </p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 11, color: 'var(--text-faint)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Bookmark style={{ width: 11, height: 11 }} />
            {collection.entryCount} {collection.entryCount === 1 ? 'item' : 'items'}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {collection.isPrivate && <Lock style={{ width: 10, height: 10 }} />}
            {collectionPrivacyLabel(collection)}
          </span>
        </div>
      </div>
    </Link>
  );
};

export default CollectionCard;
