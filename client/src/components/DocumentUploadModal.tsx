import React, { useEffect, useRef, useState } from 'react';
import { Upload, FileText, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';

interface UploadedDocument {
  id: number;
  title: string;
  authors: string[];
  description: string;
  tags: string[];
  publishedYear?: number;
  publisher?: string;
  pageCount?: number;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  metadataSource: string;
  createdAt: string;
  user: {
    id: number;
    username: string;
    firstName?: string;
    lastName?: string;
    profilePicture?: string;
  };
}

interface DocumentUploadModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (documentRecord: UploadedDocument) => void;
}

interface DraftData {
  fileUrl: string;
  fileKey: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

interface MetadataData {
  title: string;
  authors: string[];
  publishedYear?: number;
  description: string;
  tags: string[];
  publisher: string;
  pageCount: number;
  metadataSource: string;
}

const DocumentUploadModal: React.FC<DocumentUploadModalProps> = ({ open, onClose, onCreated }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [draft, setDraft] = useState<DraftData | null>(null);
  const [metadata, setMetadata] = useState<MetadataData>({
    title: '',
    authors: [],
    description: '',
    tags: [],
    publisher: '',
    pageCount: 0,
    metadataSource: 'fallback',
  });
  const [authorsText, setAuthorsText] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [yearText, setYearText] = useState('');

  useEffect(() => {
    if (!open) {
      setDraft(null);
      setUploading(false);
      setSaving(false);
      setCancelling(false);
      setMetadata({
        title: '',
        authors: [],
        description: '',
        tags: [],
        publisher: '',
        pageCount: 0,
        metadataSource: 'fallback',
      });
      setAuthorsText('');
      setTagsText('');
      setYearText('');
    }
  }, [open]);

  if (!open) return null;

  const cancelDraft = async () => {
    if (uploading || saving || cancelling) return;
    if (!draft) {
      onClose();
      return;
    }
    setCancelling(true);
    try {
      await api.post('/upload/document-preview/cancel', { fileKey: draft.fileKey });
      onClose();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error.response?.data?.error || 'Failed to cancel upload');
    } finally {
      setCancelling(false);
    }
  };

  const handleFile = async (file: File) => {
    if (file.type !== 'application/pdf') {
      toast.error('Only PDF files are allowed');
      return;
    }
    setUploading(true);
    const form = new FormData();
    form.append('document', file);
    try {
      const response = await api.post('/upload/document-preview', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const nextDraft: DraftData = response.data.draft;
      const nextMetadata: MetadataData = response.data.metadata;
      setDraft(nextDraft);
      setMetadata(nextMetadata);
      setAuthorsText((nextMetadata.authors || []).join(', '));
      setTagsText((nextMetadata.tags || []).join(', '));
      setYearText(nextMetadata.publishedYear ? String(nextMetadata.publishedYear) : '');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error.response?.data?.error || 'Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!draft) return;
    if (!metadata.title.trim()) {
      toast.error('Title is required');
      return;
    }

    setSaving(true);
    try {
      const response = await api.post('/documents', {
        ...draft,
        title: metadata.title.trim(),
        description: metadata.description.trim(),
        authors: authorsText.split(',').map((value) => value.trim()).filter(Boolean),
        tags: tagsText.split(',').map((value) => value.trim()).filter(Boolean),
        publishedYear: yearText.trim() ? Number(yearText.trim()) : null,
        publisher: metadata.publisher.trim(),
        pageCount: metadata.pageCount || 0,
        metadataSource: metadata.metadataSource || 'manual',
      });
      onCreated(response.data);
      toast.success('Document added');
      onClose();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error.response?.data?.error || 'Failed to save document');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999 }}>
      <div
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, background: 'var(--overlay)' }}
      />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ width: '100%', maxWidth: 680, borderRadius: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontFamily: '"Outfit", sans-serif', fontSize: 17, color: 'var(--text)', fontWeight: 600 }}>Add document</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 2 }}>
                Upload, review the metadata, publish.
              </div>
            </div>
            <button
              disabled
              title="Use Cancel to close and clean up the staged upload"
              style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-dim)', cursor: 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.6 }}
            >
              <X style={{ width: 14, height: 14 }} />
            </button>
          </div>

          {!draft ? (
            <div style={{ padding: 20 }}>
              <div style={{ borderRadius: 10, border: '1px dashed var(--accent-border)', background: 'var(--accent-soft)', padding: '32px 20px', textAlign: 'center' }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                  <Upload style={{ width: 20, height: 20, color: 'var(--accent)' }} />
                </div>
                <div style={{ fontFamily: '"Outfit", sans-serif', fontSize: 17, color: 'var(--text)', marginBottom: 6, fontWeight: 600 }}>
                  Drop in a PDF
                </div>
                <p style={{ margin: '0 auto 16px', maxWidth: 400, fontSize: 12, lineHeight: 1.6, color: 'var(--text-soft)' }}>
                  Scholic uploads the file, pulls the metadata, and shows you a clean review form before publishing.
                </p>
                <button
                  onClick={() => inputRef.current?.click()}
                  disabled={uploading}
                  style={{
                    padding: '7px 14px',
                    borderRadius: 8,
                    border: 'none',
                    background: uploading ? 'var(--surface-3)' : 'var(--accent)',
                    color: uploading ? 'var(--text-dim)' : 'var(--text-inverse)',
                    fontWeight: 600,
                    cursor: uploading ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                    fontSize: 12,
                    opacity: uploading ? 0.7 : 1,
                  }}
                >
                  {uploading ? 'Uploading and extracting…' : 'Choose PDF'}
                </button>
              <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-dim)' }}>PDF only · up to 15MB</div>
              <div style={{ marginTop: 6, fontSize: 10.5, color: 'var(--text-faint)' }}>Close is disabled here so staged uploads don&apos;t get stranded.</div>
                <input
                  ref={inputRef}
                  type="file"
                  accept="application/pdf"
                  style={{ display: 'none' }}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      handleFile(file);
                    }
                    event.currentTarget.value = '';
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 14 }}>
                <button
                  onClick={cancelDraft}
                  disabled={uploading || cancelling}
                  style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', fontWeight: 500, cursor: uploading || cancelling ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: 12, opacity: uploading || cancelling ? 0.6 : 1 }}
                >
                  {cancelling ? 'Cancelling…' : 'Cancel'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ padding: 20, display: 'grid', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <FileText style={{ width: 14, height: 14, color: 'var(--text-muted)' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{draft.fileName}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-dim)', marginTop: 2 }}>
                    {(draft.fileSize / (1024 * 1024)).toFixed(1)} MB · {metadata.pageCount ? `${metadata.pageCount} pages` : 'page count pending'}
                  </div>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 5, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', fontSize: 10.5, color: 'var(--accent)', fontWeight: 600 }}>
                  <Sparkles style={{ width: 10, height: 10 }} />
                  {metadata.metadataSource === 'ai' ? 'AI-filled' : 'Ready to review'}
                </div>
              </div>

              <div style={{ display: 'grid', gap: 14 }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-soft)' }}>Title</span>
                  <input value={metadata.title} onChange={(e) => setMetadata((prev) => ({ ...prev, title: e.target.value }))} style={inputStyle} />
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px', gap: 14 }}>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-soft)' }}>Authors</span>
                    <input value={authorsText} onChange={(e) => setAuthorsText(e.target.value)} style={inputStyle} placeholder="Comma-separated names" />
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-soft)' }}>Year</span>
                    <input value={yearText} onChange={(e) => setYearText(e.target.value)} style={inputStyle} placeholder="2024" inputMode="numeric" />
                  </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px', gap: 14 }}>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-soft)' }}>Publisher</span>
                    <input value={metadata.publisher} onChange={(e) => setMetadata((prev) => ({ ...prev, publisher: e.target.value }))} style={inputStyle} />
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-soft)' }}>Pages</span>
                    <input value={metadata.pageCount || ''} onChange={(e) => setMetadata((prev) => ({ ...prev, pageCount: Number(e.target.value) || 0 }))} style={inputStyle} inputMode="numeric" />
                  </label>
                </div>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-soft)' }}>Description</span>
                  <textarea value={metadata.description} onChange={(e) => setMetadata((prev) => ({ ...prev, description: e.target.value }))} style={{ ...inputStyle, minHeight: 118, resize: 'vertical', paddingTop: 12 }} />
                </label>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-soft)' }}>Tags</span>
                  <input value={tagsText} onChange={(e) => setTagsText(e.target.value)} style={inputStyle} placeholder="machine learning, philosophy, sociology" />
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, paddingTop: 4 }}>
                <button
                  onClick={cancelDraft}
                  disabled={cancelling}
                  style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', fontWeight: 500, cursor: cancelling ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: 12, opacity: cancelling ? 0.6 : 1 }}
                >
                  {cancelling ? 'Cancelling…' : 'Cancel'}
                </button>
                <button
                  onClick={async () => {
                    if (!draft) return;
                    setCancelling(true);
                    try {
                      await api.post('/upload/document-preview/cancel', { fileKey: draft.fileKey });
                      setDraft(null);
                      inputRef.current?.click();
                    } catch (err: unknown) {
                      const error = err as { response?: { data?: { error?: string } } };
                      toast.error(error.response?.data?.error || 'Failed to replace document');
                    } finally {
                      setCancelling(false);
                    }
                  }}
                  disabled={cancelling || saving}
                  style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', fontWeight: 500, cursor: cancelling || saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: 12, opacity: cancelling || saving ? 0.6 : 1 }}
                >
                  Replace file
                </button>
                <button
                  onClick={submit}
                  disabled={saving || cancelling}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 6,
                    border: 'none',
                    background: (saving || cancelling) ? 'var(--surface-3)' : 'var(--accent)',
                    color: (saving || cancelling) ? 'var(--text-dim)' : 'var(--text-inverse)',
                    fontWeight: 600,
                    cursor: (saving || cancelling) ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                    fontSize: 12,
                    opacity: (saving || cancelling) ? 0.7 : 1,
                  }}
                >
                  {saving ? 'Saving…' : 'Publish document'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)',
  padding: '7px 10px',
  fontFamily: 'inherit',
  fontSize: 12.5,
  outline: 'none',
};

export default DocumentUploadModal;
