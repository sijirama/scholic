import React, { useEffect, useState } from 'react';
import { X, Upload, Trash2 } from 'lucide-react';
import api from '../lib/api';
import type { CollectionSummary } from '../lib/collections';
import { toast } from 'sonner';

interface CollectionModalProps {
  open: boolean;
  collection?: CollectionSummary | null;
  onClose: () => void;
  onSaved: (collection: CollectionSummary) => void;
  onDeleted?: () => void;
}

const CollectionModal: React.FC<CollectionModalProps> = ({ open, collection, onClose, onSaved, onDeleted }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [coverPositionY, setCoverPositionY] = useState(50);
  const [pendingCoverFile, setPendingCoverFile] = useState<File | null>(null);
  const [pendingCoverPreview, setPendingCoverPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(collection?.title || '');
    setDescription(collection?.description || '');
    setIsPrivate(collection?.isPrivate || false);
    setCoverPositionY(collection?.coverPositionY ?? 50);
    setPendingCoverFile(null);
    setPendingCoverPreview('');
    setConfirmingDelete(false);
  }, [open, collection]);

  useEffect(() => {
    if (!pendingCoverFile) {
      setPendingCoverPreview('');
      return;
    }
    const url = URL.createObjectURL(pendingCoverFile);
    setPendingCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingCoverFile]);

  if (!open) return null;

  const save = async () => {
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }
    setSaving(true);
    try {
      const payload = { title: title.trim(), description: description.trim(), isPrivate, coverPositionY };
      const response = collection
        ? await api.patch(`/collections/${collection.id}`, payload)
        : await api.post('/collections', payload);
      let savedCollection = response.data as CollectionSummary;
      if (!collection && pendingCoverFile) {
        const formData = new FormData();
        formData.append('cover', pendingCoverFile);
        const coverResponse = await api.post(`/collections/${savedCollection.id}/cover`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        savedCollection = { ...savedCollection, coverImageUrl: coverResponse.data.coverImageUrl };
      }
      onSaved(savedCollection);
      onClose();
    } catch {
      toast.error('Failed to save collection');
    } finally {
      setSaving(false);
    }
  };

  const uploadCover = async (file: File) => {
    if (!collection) return;
    const formData = new FormData();
    formData.append('cover', file);
    setUploading(true);
    try {
      const response = await api.post(`/collections/${collection.id}/cover`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onSaved({ ...collection, coverImageUrl: response.data.coverImageUrl });
    } catch {
      toast.error('Failed to upload cover');
    } finally {
      setUploading(false);
    }
  };

  const removeCover = async () => {
    if (!collection) return;
    setUploading(true);
    try {
      await api.delete(`/collections/${collection.id}/cover`);
      onSaved({ ...collection, coverImageUrl: '' });
    } catch {
      toast.error('Failed to remove cover');
    } finally {
      setUploading(false);
    }
  };

  const deleteCollection = async () => {
    if (!collection) return;
    setSaving(true);
    try {
      await api.delete(`/collections/${collection.id}`);
      onDeleted?.();
      onClose();
    } catch {
      toast.error('Failed to delete collection');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ width: '100%', maxWidth: 520, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 650, color: 'var(--text)' }}>{collection ? 'Collection settings' : 'New collection'}</h2>
          <button className="theme-icon-button" onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text-dim)', fontWeight: 600 }}>
            Title
            <input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)', font: 'inherit' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text-dim)', fontWeight: 600 }}>
            Description
            <textarea value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} rows={4} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)', font: 'inherit', resize: 'vertical' }} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-inset)', fontSize: 13, color: 'var(--text-muted)' }}>
            Public collection
            <input type="checkbox" checked={!isPrivate} onChange={(e) => setIsPrivate(!e.target.checked)} />
          </label>
          {(collection?.coverImageUrl || pendingCoverPreview) && (
            <div style={{ height: 96, borderRadius: 8, border: '1px solid var(--border)', background: `url(${collection?.coverImageUrl || pendingCoverPreview}) center ${coverPositionY}%/cover no-repeat` }} />
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <label className="theme-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: uploading ? 'wait' : 'pointer' }}>
              <Upload style={{ width: 13, height: 13 }} />
              {collection ? (uploading ? 'Uploading...' : 'Cover image') : (pendingCoverFile ? pendingCoverFile.name : 'Cover image')}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                hidden
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (collection) uploadCover(file);
                  else setPendingCoverFile(file);
                }}
              />
            </label>
            {!collection && pendingCoverFile && (
              <button onClick={() => setPendingCoverFile(null)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-dim)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                <Trash2 style={{ width: 13, height: 13 }} />
                Remove cover
              </button>
            )}
            {collection?.coverImageUrl && (
              <button onClick={removeCover} disabled={uploading} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-dim)', fontSize: 12, fontWeight: 600, cursor: uploading ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
                <Trash2 style={{ width: 13, height: 13 }} />
                Remove cover
              </button>
            )}
          </div>
          {(collection?.coverImageUrl || pendingCoverPreview) && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 12, color: 'var(--text-dim)', fontWeight: 600 }}>
              Image position
              <input
                type="range"
                min={0}
                max={100}
                value={coverPositionY}
                onChange={(e) => setCoverPositionY(Number(e.target.value))}
                style={{ width: '100%' }}
              />
            </label>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '14px 18px', borderTop: '1px solid var(--border)' }}>
          {confirmingDelete ? (
            <>
              <div style={{ minWidth: 0, color: 'var(--text-dim)', fontSize: 12, lineHeight: 1.4 }}>Delete this collection? Items inside it will not be deleted.</div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button onClick={() => setConfirmingDelete(false)} disabled={saving} className="theme-pill" style={{ padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                <button onClick={deleteCollection} disabled={saving} style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: 'var(--danger)', color: 'white', fontSize: 12, fontWeight: 650, cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit' }}>{saving ? 'Deleting...' : 'Delete'}</button>
              </div>
            </>
          ) : (
            <>
              {collection ? (
                <button onClick={() => setConfirmingDelete(true)} disabled={saving} style={{ border: 'none', background: 'transparent', color: 'var(--danger)', fontSize: 12, fontWeight: 600, cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit' }}>Delete</button>
              ) : <span />}
              <button onClick={save} disabled={saving} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'var(--text-inverse)', fontSize: 13, fontWeight: 650, cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CollectionModal;
