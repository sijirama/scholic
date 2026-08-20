import React, { useEffect, useState } from 'react';
import { Check, X, Layers, Lock, MinusCircle } from 'lucide-react';
import api from '../lib/api';
import type { CollectionSummary } from '../lib/collections';
import { toast } from 'sonner';

interface AddToCollectionModalProps {
  open: boolean;
  targetType: 'annotation' | 'bookmark';
  targetId: number;
  onClose: () => void;
}

const AddToCollectionModal: React.FC<AddToCollectionModalProps> = ({ open, targetType, targetId, onClose }) => {
  const LIMIT = 50;
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingMore, setFetchingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.get(`/collections?limit=${LIMIT}&offset=0&targetType=${targetType}&targetId=${targetId}`)
      .then((res) => {
        setCollections(res.data.collections || []);
        setHasMore(!!res.data.hasMore);
      })
      .catch(() => toast.error('Failed to load collections'))
      .finally(() => setLoading(false));
  }, [open, targetId, targetType]);

  if (!open) return null;

  const add = async (collectionId: number) => {
    setSavingId(collectionId);
    try {
      const response = await api.post(`/collections/${collectionId}/entries`, { targetType, targetId });
      setCollections(prev => prev.map(collection => collection.id === collectionId
        ? { ...collection, hasTarget: true, targetEntryId: response.data.id, entryCount: collection.entryCount + (collection.hasTarget ? 0 : 1) }
        : collection));
      toast.success('Added to collection');
    } catch {
      toast.error('Failed to add to collection');
    } finally {
      setSavingId(null);
    }
  };

  const remove = async (collection: CollectionSummary) => {
    if (!collection.targetEntryId) return;
    setSavingId(collection.id);
    try {
      await api.delete(`/collections/${collection.id}/entries/${collection.targetEntryId}`);
      setCollections(prev => prev.map(row => row.id === collection.id
        ? { ...row, hasTarget: false, targetEntryId: undefined, entryCount: Math.max(0, row.entryCount - 1) }
        : row));
      toast.success('Removed from collection');
    } catch {
      toast.error('Failed to remove from collection');
    } finally {
      setSavingId(null);
    }
  };

  const loadMore = async () => {
    if (fetchingMore || !hasMore) return;
    setFetchingMore(true);
    try {
      const response = await api.get(`/collections?limit=${LIMIT}&offset=${collections.length}&targetType=${targetType}&targetId=${targetId}`);
      setCollections(prev => [...prev, ...(response.data.collections || [])]);
      setHasMore(!!response.data.hasMore);
    } catch {
      toast.error('Failed to load more collections');
    } finally {
      setFetchingMore(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ width: '100%', maxWidth: 500, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Add to collection</h2>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.45, color: 'var(--text-dim)' }}>Select a collection. Checked rows already contain this {targetType}.</p>
          </div>
          <button className="theme-icon-button" onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}>
            <X style={{ width: 17, height: 17 }} />
          </button>
        </div>
        <div style={{ padding: 12, maxHeight: 390, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 20, fontSize: 13, color: 'var(--text-dim)', textAlign: 'center' }}>Loading...</div>
          ) : collections.length === 0 ? (
            <div style={{ padding: 20, fontSize: 13, color: 'var(--text-dim)', textAlign: 'center' }}>Create a collection from your profile first.</div>
          ) : (
            <>
              {collections.map((collection) => (
                <button
                  key={collection.id}
                  onClick={() => collection.hasTarget ? remove(collection) : add(collection.id)}
                  disabled={savingId !== null}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '11px 12px',
                    borderRadius: 9,
                    border: collection.hasTarget ? '1px solid var(--accent-border)' : '1px solid transparent',
                    background: collection.hasTarget ? 'var(--accent-soft)' : 'transparent',
                    color: 'var(--text)',
                    cursor: savingId ? 'wait' : 'pointer',
                    textAlign: 'left',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-hover)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = collection.hasTarget ? 'var(--accent-soft)' : 'transparent'; }}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: collection.hasTarget ? 'var(--accent)' : 'var(--surface)', border: '1px solid var(--border)', color: collection.hasTarget ? 'var(--text-inverse)' : 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {collection.hasTarget ? <Check style={{ width: 16, height: 16 }} /> : <Layers style={{ width: 16, height: 16 }} />}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{collection.title}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 2, fontSize: 11, color: 'var(--text-dim)' }}>
                      <span>{collection.entryCount} items</span>
                      {collection.hasTarget && <span style={{ color: 'var(--accent)', fontWeight: 600 }}>already added</span>}
                    </div>
                  </div>
                  {collection.isPrivate && <Lock style={{ width: 13, height: 13, color: 'var(--text-faint)' }} />}
                  {collection.hasTarget && <MinusCircle style={{ width: 14, height: 14, color: 'var(--text-dim)' }} />}
                </button>
              ))}
              {hasMore && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
                  <button onClick={loadMore} disabled={fetchingMore} className="theme-pill" style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 650, cursor: fetchingMore ? 'wait' : 'pointer', opacity: fetchingMore ? 0.7 : 1, fontFamily: 'inherit' }}>
                    {fetchingMore ? 'Loading...' : 'Load more'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AddToCollectionModal;
