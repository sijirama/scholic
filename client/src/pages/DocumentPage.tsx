import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink, FileText } from 'lucide-react';
import Navbar from '../components/Navbar';
import api from '../lib/api';

interface DocumentRecord {
  id: number;
  createdAt: string;
  title: string;
  description: string;
  authors: string[];
  tags: string[];
  publishedYear?: number;
  publisher?: string;
  pageCount?: number;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  metadataSource: string;
  user: {
    id: number;
    username: string;
    firstName?: string;
    lastName?: string;
    profilePicture?: string;
  };
}

const formatFileSize = (size: number) => {
  if (!size) return '';
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const DocumentPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [documentRecord, setDocumentRecord] = useState<DocumentRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    api.get(`/documents/${id}`)
      .then((response) => {
        if (!cancelled) {
          setDocumentRecord(response.data);
        }
      })
      .catch((err: { response?: { data?: { error?: string } } }) => {
        if (!cancelled) {
          setError(err.response?.data?.error || 'Failed to load document');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div style={{ minHeight: '100vh', background: '#0f0f0f', color: '#fff', fontFamily: '"Inter", sans-serif' }}>
      <Navbar />

      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 20px 48px' }}>
        <button
          onClick={() => navigate(-1)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#666', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 20, fontFamily: 'inherit' }}
        >
          <ArrowLeft style={{ width: 15, height: 15 }} />
          Back
        </button>

        {loading && (
          <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 24 }}>
            <div style={{ borderRadius: 18, background: 'rgba(255,255,255,0.03)', height: 320 }} />
            <div style={{ borderRadius: 18, background: 'rgba(255,255,255,0.03)', height: 640 }} />
          </div>
        )}

        {!loading && error && (
          <div style={{ padding: '80px 0', textAlign: 'center', color: '#666' }}>{error}</div>
        )}

        {!loading && !error && documentRecord && (
          <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 24, alignItems: 'start' }}>
            <aside style={{ position: 'sticky', top: 72 }}>
              <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))', padding: 22 }}>
                <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(110,183,129,0.12)', border: '1px solid rgba(110,183,129,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
                  <FileText style={{ width: 24, height: 24, color: '#6EB781' }} />
                </div>

                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.04)', color: '#777', fontSize: 11, marginBottom: 14 }}>
                  <span>{documentRecord.metadataSource === 'ai' ? 'AI metadata' : 'Metadata review'}</span>
                </div>

                <h1 style={{ margin: '0 0 10px', fontFamily: '"Outfit", sans-serif', fontSize: 28, lineHeight: 1.1 }}>{documentRecord.title}</h1>
                {documentRecord.authors.length > 0 && (
                  <p style={{ margin: '0 0 10px', fontSize: 14, color: '#bbb', lineHeight: 1.5 }}>
                    {documentRecord.authors.join(', ')}
                  </p>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  {documentRecord.publishedYear && (
                    <span style={{ padding: '5px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.04)', fontSize: 12, color: '#aaa' }}>
                      {documentRecord.publishedYear}
                    </span>
                  )}
                  {documentRecord.publisher && (
                    <span style={{ padding: '5px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.04)', fontSize: 12, color: '#aaa' }}>
                      {documentRecord.publisher}
                    </span>
                  )}
                  {documentRecord.pageCount ? (
                    <span style={{ padding: '5px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.04)', fontSize: 12, color: '#aaa' }}>
                      {documentRecord.pageCount} pages
                    </span>
                  ) : null}
                </div>

                {documentRecord.description && (
                  <p style={{ margin: '0 0 18px', fontSize: 13, color: '#8f8f8f', lineHeight: 1.7 }}>
                    {documentRecord.description}
                  </p>
                )}

                {documentRecord.tags.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
                    {documentRecord.tags.map((tag) => (
                      <span key={tag} style={{ padding: '4px 10px', borderRadius: 999, background: 'rgba(71,163,232,0.12)', border: '1px solid rgba(71,163,232,0.18)', fontSize: 11, color: '#8cc7f0' }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div style={{ display: 'grid', gap: 10, marginBottom: 18 }}>
                  <a
                    href={documentRecord.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, textDecoration: 'none', background: '#6EB781', color: '#08110b', fontWeight: 700, fontSize: 13, borderRadius: 12, padding: '12px 16px' }}
                  >
                    Read PDF
                    <ExternalLink style={{ width: 14, height: 14 }} />
                  </a>
                  <Link
                    to={`/u/${documentRecord.user.username}`}
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', background: 'rgba(255,255,255,0.03)', color: '#cfcfcf', fontWeight: 600, fontSize: 13, borderRadius: 12, padding: '12px 16px', border: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    View uploader
                  </Link>
                </div>

                <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 16, fontSize: 12, color: '#666', display: 'grid', gap: 6 }}>
                  <span>{documentRecord.fileName}</span>
                  <span>{formatFileSize(documentRecord.fileSize)}{documentRecord.mimeType ? ` · ${documentRecord.mimeType}` : ''}</span>
                  <span>Uploaded by @{documentRecord.user.username}</span>
                </div>
              </div>
            </aside>

            <section style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, overflow: 'hidden', background: '#131313' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 12, color: '#666' }}>
                Inline preview
              </div>
              <iframe
                src={documentRecord.fileUrl}
                title={documentRecord.title}
                style={{ width: '100%', height: '78vh', border: 'none', background: '#1a1a1a' }}
              />
            </section>
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentPage;
