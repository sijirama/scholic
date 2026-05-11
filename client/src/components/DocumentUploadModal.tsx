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
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)' }}
      />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ width: '100%', maxWidth: 760, borderRadius: 24, background: '#171717', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 32px 90px rgba(0,0,0,0.45)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <div>
              <div style={{ fontFamily: '"Outfit", sans-serif', fontSize: 22, color: '#fff', fontWeight: 600 }}>Add document</div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                Upload once, review the metadata, publish to your Uploaded tab.
              </div>
            </div>
            <button
              disabled
              title="Use Cancel to close and clean up the staged upload"
              style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', color: '#555', cursor: 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.6 }}
            >
              <X style={{ width: 16, height: 16 }} />
            </button>
          </div>

          {!draft ? (
            <div style={{ padding: 24 }}>
              <div style={{ borderRadius: 22, border: '1px dashed rgba(110,183,129,0.35)', background: 'radial-gradient(circle at top, rgba(110,183,129,0.12), rgba(255,255,255,0.02))', padding: '44px 24px', textAlign: 'center' }}>
                <div style={{ width: 66, height: 66, borderRadius: 20, background: 'rgba(110,183,129,0.12)', border: '1px solid rgba(110,183,129,0.24)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
                  <Upload style={{ width: 28, height: 28, color: '#6EB781' }} />
                </div>
                <div style={{ fontFamily: '"Outfit", sans-serif', fontSize: 24, color: '#fff', marginBottom: 10 }}>
                  Drop in a PDF
                </div>
                <p style={{ margin: '0 auto 18px', maxWidth: 420, fontSize: 13, lineHeight: 1.7, color: '#888' }}>
                  Scholic uploads the file, pulls the metadata for you, and gives you a clean review form before publishing.
                </p>
                <button
                  onClick={() => inputRef.current?.click()}
                  disabled={uploading}
                  style={{ padding: '12px 18px', borderRadius: 12, border: 'none', background: '#6EB781', color: '#08110b', fontWeight: 700, cursor: uploading ? 'wait' : 'pointer', fontFamily: 'inherit', fontSize: 13 }}
                >
                  {uploading ? 'Uploading and extracting…' : 'Choose PDF'}
                </button>
              <div style={{ marginTop: 12, fontSize: 11, color: '#555' }}>PDF only · up to 15MB</div>
              <div style={{ marginTop: 8, fontSize: 11, color: '#444' }}>Close is disabled here so staged uploads don&apos;t get stranded.</div>
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
              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 16 }}>
                <button
                  onClick={cancelDraft}
                  disabled={uploading || cancelling}
                  style={{ padding: '11px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', color: '#d0d0d0', fontWeight: 600, cursor: uploading || cancelling ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: uploading || cancelling ? 0.7 : 1 }}
                >
                  {cancelling ? 'Cancelling…' : 'Cancel'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ padding: 24, display: 'grid', gap: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FileText style={{ width: 18, height: 18, color: '#ddd' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: '#eee', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{draft.fileName}</div>
                  <div style={{ fontSize: 11, color: '#666', marginTop: 3 }}>
                    {(draft.fileSize / (1024 * 1024)).toFixed(1)} MB · {metadata.pageCount ? `${metadata.pageCount} pages` : 'page count pending'}
                  </div>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 999, background: 'rgba(110,183,129,0.10)', border: '1px solid rgba(110,183,129,0.2)', fontSize: 11, color: '#6EB781', fontWeight: 700 }}>
                  <Sparkles style={{ width: 12, height: 12 }} />
                  {metadata.metadataSource === 'ai' ? 'AI-filled' : 'Ready to review'}
                </div>
              </div>

              <div style={{ display: 'grid', gap: 14 }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, color: '#777' }}>Title</span>
                  <input value={metadata.title} onChange={(e) => setMetadata((prev) => ({ ...prev, title: e.target.value }))} style={inputStyle} />
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px', gap: 14 }}>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 12, color: '#777' }}>Authors</span>
                    <input value={authorsText} onChange={(e) => setAuthorsText(e.target.value)} style={inputStyle} placeholder="Comma-separated names" />
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 12, color: '#777' }}>Year</span>
                    <input value={yearText} onChange={(e) => setYearText(e.target.value)} style={inputStyle} placeholder="2024" inputMode="numeric" />
                  </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px', gap: 14 }}>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 12, color: '#777' }}>Publisher</span>
                    <input value={metadata.publisher} onChange={(e) => setMetadata((prev) => ({ ...prev, publisher: e.target.value }))} style={inputStyle} />
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 12, color: '#777' }}>Pages</span>
                    <input value={metadata.pageCount || ''} onChange={(e) => setMetadata((prev) => ({ ...prev, pageCount: Number(e.target.value) || 0 }))} style={inputStyle} inputMode="numeric" />
                  </label>
                </div>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, color: '#777' }}>Description</span>
                  <textarea value={metadata.description} onChange={(e) => setMetadata((prev) => ({ ...prev, description: e.target.value }))} style={{ ...inputStyle, minHeight: 118, resize: 'vertical', paddingTop: 12 }} />
                </label>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, color: '#777' }}>Tags</span>
                  <input value={tagsText} onChange={(e) => setTagsText(e.target.value)} style={inputStyle} placeholder="machine learning, philosophy, sociology" />
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingTop: 8 }}>
                <button
                  onClick={cancelDraft}
                  disabled={cancelling}
                  style={{ padding: '11px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', color: '#d0d0d0', fontWeight: 600, cursor: cancelling ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: cancelling ? 0.7 : 1 }}
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
                  style={{ padding: '11px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', color: '#d0d0d0', fontWeight: 600, cursor: cancelling || saving ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: cancelling || saving ? 0.7 : 1 }}
                >
                  Replace file
                </button>
                <button
                  onClick={submit}
                  disabled={saving || cancelling}
                  style={{ padding: '11px 18px', borderRadius: 12, border: 'none', background: '#6EB781', color: '#08110b', fontWeight: 800, cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit' }}
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
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.03)',
  color: '#fff',
  padding: '10px 12px',
  fontFamily: 'inherit',
  fontSize: 13,
  outline: 'none',
};

export default DocumentUploadModal;
