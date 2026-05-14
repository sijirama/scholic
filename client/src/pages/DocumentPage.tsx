import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink } from 'lucide-react';
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
  // Single state object tagged with the id it was loaded for. When `id`
  // changes mid-flight, the derived loading/error/doc values below ignore the
  // stale result until the new fetch settles — no setState-in-effect needed
  // for the reset.
  type RequestState =
    | { status: 'loading' }
    | { status: 'ready'; doc: DocumentRecord }
    | { status: 'error'; message: string };
  const [request, setRequest] = useState<{ id: string | undefined; state: RequestState }>({ id, state: { status: 'loading' } });

  const isCurrent = request.id === id;
  const loading = !isCurrent || request.state.status === 'loading';
  const error = isCurrent && request.state.status === 'error' ? request.state.message : '';
  const documentRecord = isCurrent && request.state.status === 'ready' ? request.state.doc : null;

  useEffect(() => {
    let cancelled = false;
    api.get(`/documents/${id}`)
      .then((response) => {
        if (!cancelled) {
          setRequest({ id, state: { status: 'ready', doc: response.data } });
        }
      })
      .catch((err: { response?: { data?: { error?: string } } }) => {
        if (!cancelled) {
          setRequest({ id, state: { status: 'error', message: err.response?.data?.error || 'Failed to load document' } });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: '"Inter", sans-serif' }}>
      <Navbar />

      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 20px 48px' }}>
        <button
          onClick={() => navigate(-1)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--text-soft)', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 20, fontFamily: 'inherit' }}
        >
          <ArrowLeft style={{ width: 15, height: 15 }} />
          Back
        </button>

        {loading && (
          <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 24 }}>
            <div style={{ borderRadius: 18, background: 'var(--surface)', height: 320 }} />
            <div style={{ borderRadius: 18, background: 'var(--surface)', height: 640 }} />
          </div>
        )}

        {!loading && error && (
          <div style={{ padding: '80px 0', textAlign: 'center', color: 'var(--text-soft)' }}>{error}</div>
        )}

        {!loading && !error && documentRecord && (
          <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 24, alignItems: 'start' }}>
            <aside style={{ position: 'sticky', top: 72 }}>
              <div style={{ border: '1px solid var(--border)', borderRadius: 18, background: 'linear-gradient(180deg, var(--surface-2), var(--surface))', padding: 22, minWidth: 0 }}>
                <h1 style={{ margin: '0 0 10px', fontFamily: '"Outfit", sans-serif', fontSize: 26, lineHeight: 1.15, overflowWrap: 'break-word', wordBreak: 'break-word' }}>{documentRecord.title}</h1>
                {documentRecord.authors.length > 0 && (
                  <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                    {documentRecord.authors.join(', ')}
                  </p>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                  {documentRecord.publishedYear && (
                    <span style={{ padding: '2px 7px', borderRadius: 5, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 10.5, color: 'var(--text-soft)' }}>
                      {documentRecord.publishedYear}
                    </span>
                  )}
                  {documentRecord.publisher && (
                    <span style={{ padding: '2px 7px', borderRadius: 5, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 10.5, color: 'var(--text-soft)' }}>
                      {documentRecord.publisher}
                    </span>
                  )}
                  {documentRecord.pageCount ? (
                    <span style={{ padding: '2px 7px', borderRadius: 5, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 10.5, color: 'var(--text-soft)' }}>
                      {documentRecord.pageCount} pages
                    </span>
                  ) : null}
                </div>

                <a
                  href={`/page?url=${encodeURIComponent(documentRecord.fileUrl)}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500, marginBottom: 14 }}
                  className="hover:underline"
                >
                  see all annotations →
                </a>

                {documentRecord.description && (
                  <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-soft)', lineHeight: 1.7, overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                    {documentRecord.description}
                  </p>
                )}

                {documentRecord.tags.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 18 }}>
                    {documentRecord.tags.map((tag) => (
                      <span key={tag} style={{ padding: '2px 7px', borderRadius: 5, background: 'var(--color-blue-soft)', border: '1px solid var(--color-blue-border)', fontSize: 10.5, color: 'var(--color-blue-text)', lineHeight: 1.5 }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
                  <a
                    href={documentRecord.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, textDecoration: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontWeight: 600, fontSize: 13, borderRadius: 8, padding: '10px 14px' }}
                  >
                    Read PDF
                    <ExternalLink style={{ width: 13, height: 13 }} />
                  </a>
                  <Link
                    to={`/u/${documentRecord.user.username}`}
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', background: 'var(--surface)', color: 'var(--text-muted)', fontWeight: 500, fontSize: 13, borderRadius: 8, padding: '10px 14px', border: '1px solid var(--border)' }}
                  >
                    View uploader
                  </Link>
                </div>

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, fontSize: 11.5, color: 'var(--text-soft)', display: 'grid', gap: 5 }}>
                  <span>{formatFileSize(documentRecord.fileSize)}{documentRecord.mimeType ? ` · ${documentRecord.mimeType}` : ''}</span>
                  <span>Uploaded by @{documentRecord.user.username}</span>
                </div>
              </div>
            </aside>

            <section style={{ border: '1px solid var(--border)', borderRadius: 18, overflow: 'hidden', background: 'var(--bg-elevated)', minWidth: 0 }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text-soft)' }}>
                Inline preview
              </div>
              <iframe
                src={documentRecord.fileUrl}
                title={documentRecord.title}
                style={{ width: '100%', height: '78vh', border: 'none', background: 'var(--bg-elevated)' }}
              />
            </section>
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentPage;
